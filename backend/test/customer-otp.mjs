import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { CustomerController } from '../dist/customers.js';

const phone = '09123456789';
const request = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
const secret = 'test-otp-secret';
const credentials = { apiKey: 'test-sms-ir-key', templateId: 271, parameterName: 'OtpToken' };
const verificationUrl = 'https://api.sms.ir/v1/send/verify';

function withEnvironment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('SMS.ir gets the issued OTP while the controller stores its HMAC and accepts it once', async t => {
  withEnvironment(t, { OTP_SECRET: secret, NODE_ENV: 'production' });
  const send = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 1, data: { messageId: 1234 } }));
  const limit = t.mock.fn(async () => {});
  const customerId = '3a7f75d0-9dbd-4d94-ab76-39217a4f1bf7';
  let hash;
  let savedSession;
  const writeChallenge = t.mock.fn(async (sql, [mobile, codeHash]) => {
    assert.match(sql, /INSERT INTO otp_challenges/);
    assert.match(sql, /interval '5 minutes'/);
    assert.equal(mobile, phone);
    hash = codeHash;
  });
  const query = t.mock.fn(async (sql, params) => {
    if (sql.startsWith('SELECT code_hash FROM otp_challenges')) {
      assert.deepEqual(params, [phone]);
      return hash ? { rows: [{ code_hash: hash }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('UPDATE otp_challenges SET attempts')) {
      assert.deepEqual(params, [phone]);
      return { rowCount: 1 };
    }
    if (sql.startsWith('DELETE FROM otp_challenges')) {
      assert.deepEqual(params, [phone]);
      hash = undefined;
      return { rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO customers')) {
      assert.match(sql, /VALUES\(\$1,\$2,false,\$3\)/);
      assert.equal(params[1], phone);
      assert.equal(params[2].phone, phone);
      return { rows: [{ id: customerId, status: 'active' }] };
    }
    if (sql.startsWith('INSERT INTO customer_sessions')) {
      savedSession = params;
      return { rowCount: 1 };
    }
    assert.match(sql, /^UPDATE customers SET last_login_at/);
    assert.deepEqual(params, [customerId]);
    return { rowCount: 1 };
  });
  const db = { pool: { query: writeChallenge }, transaction: callback => callback({ query }) };
  const controller = new CustomerController(db, { check: limit }, { smsCredentials: async () => credentials }, {});
  const res = { cookie: t.mock.fn() };

  assert.deepEqual(await controller.requestOtp({ phone }, request), { ok: true, expiresIn: 300 });
  assert.equal(send.mock.callCount(), 1);
  const [url, options] = send.mock.calls[0].arguments;
  assert.equal(url, verificationUrl);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(new Headers(options.headers).get('x-api-key'), credentials.apiKey);
  const payload = JSON.parse(options.body);
  const code = payload.parameters[0].value;
  assert.match(code, /^\d{6}$/);
  assert.deepEqual(payload, { mobile: phone, templateId: credentials.templateId, parameters: [{ name: 'OtpToken', value: code }] });
  assert.equal(hash, createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex'));
  assert.deepEqual(limit.mock.calls.map(call => call.arguments), [
    [`otp-ip:${request.ip}`, 10, 3600], [`otp-phone:${phone}`, 1, 60], [`otp-day:${phone}`, 8, 86400],
  ]);

  const wrongCode = code === '100000' ? '100001' : '100000';
  await assert.rejects(controller.verify({ phone, code: wrongCode }, request, res), error => error.getStatus() === 401);
  assert.equal(res.cookie.mock.callCount(), 0);
  assert.match(query.mock.calls.at(-1).arguments[0], /^UPDATE otp_challenges SET attempts/);
  assert.deepEqual(await controller.verify({ phone, code }, request, res), { ok: true, customerId });
  const [cookieName, token, cookieOptions] = res.cookie.mock.calls[0].arguments;
  assert.equal(cookieName, 'poostikal_customer');
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.secure, true);
  assert.deepEqual(savedSession, [createHash('sha256').update(token).digest('hex'), customerId]);
  await assert.rejects(controller.verify({ phone, code }, request, res), error => error.getStatus() === 401);
  assert.equal(res.cookie.mock.callCount(), 1);
});

test('SMS.ir failures delete only that challenge and return a generic error', async t => {
  withEnvironment(t, { OTP_SECRET: secret });
  const send = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 10, message: 'private provider response' }));
  const query = t.mock.fn(async () => ({ rowCount: 1 }));
  const controller = new CustomerController({ pool: { query } }, { check: async () => {} }, { smsCredentials: async () => credentials }, {});

  await assert.rejects(controller.requestOtp({ phone }, request), error =>
    error.getStatus() === 503 && error.message === 'پیامک ارسال نشد؛ کمی بعد دوباره امتحان کن.');
  assert.equal(send.mock.callCount(), 1);
  assert.equal(query.mock.callCount(), 2);
  const [[insert, saved], [remove, removed]] = query.mock.calls.map(call => call.arguments);
  assert.match(insert, /^INSERT INTO otp_challenges/);
  assert.match(remove, /^DELETE FROM otp_challenges WHERE phone=\$1 AND code_hash=\$2$/);
  assert.deepEqual(removed, saved);
});

test('unconfigured SMS ignores legacy demo login even on loopback', async t => {
  const legacyCode = '123456';
  withEnvironment(t, {
    OTP_SECRET: secret, LOCAL_LOGIN_PHONE: phone, LOCAL_LOGIN_CODE: legacyCode, LOCAL_LOGIN_ANY_PHONE: 'true',
    NODE_ENV: 'development', HOST: '127.0.0.1', APP_ORIGIN: 'http://127.0.0.1:7777', TRUST_PROXY: '',
  });
  const send = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected SMS request'); });
  const poolQuery = t.mock.fn();
  const challenge = t.mock.fn(async () => ({ rows: [], rowCount: 0 }));
  const db = { pool: { query: poolQuery }, transaction: callback => callback({ query: challenge }) };
  const controller = new CustomerController(db, { check: async () => {} }, { smsCredentials: async () => null }, {});
  const res = { cookie: t.mock.fn() };

  await assert.rejects(controller.requestOtp({ phone }, request), error => error.getStatus() === 503);
  await assert.rejects(controller.verify({ phone, code: legacyCode }, request, res), error => error.getStatus() === 401);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(poolQuery.mock.callCount(), 0);
  assert.equal(challenge.mock.callCount(), 1);
  assert.match(challenge.mock.calls[0].arguments[0], /^SELECT code_hash FROM otp_challenges/);
  assert.equal(res.cookie.mock.callCount(), 0);
});
