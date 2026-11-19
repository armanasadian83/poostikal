import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { defaultPalette } from '../dist/theme.js';

test('theme: public-safe palette, authentication, validation, concurrent saves and restart persistence', { timeout: 60000 }, async () => {
  const secrets = JSON.parse(await readFile('../.data/database-secrets.json', 'utf8'));
  const name = `poostikal_theme_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, /^poostikal_theme_[a-f0-9]{32}$/);
  const owner = new Client({ host: '127.0.0.1', port: 55432, user: 'poostikal_owner', password: secrets.owner, database: 'postgres' });
  await owner.connect(); await owner.query(`CREATE DATABASE ${name} OWNER poostikal`);
  const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
  let child;
  const start = () => { child = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4108', AI_ENABLED: 'false', OPENROUTER_API_KEY: '', RABOTEB_CONSUMER_KEY: '', RABOTEB_CONSUMER_SECRET: '' }, windowsHide: true, stdio: 'ignore' }); };
  const stop = async () => { if (child && child.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; } };
  let cookie = '';
  const request = (path, method = 'GET', body, admin = false, origin = 'http://127.0.0.1:7777') => fetch('http://127.0.0.1:4108/api' + path, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ready = async () => { for (let i = 0; i < 100; i++) { try { if ((await request('/health')).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Isolated theme API did not start'); };
  try {
    start(); await ready();
    const response = await request('/theme'), initial = await response.json();
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(initial, { palette: defaultPalette, version: 0 });
    assert.deepEqual(Object.keys(initial).sort(), ['palette', 'version']);
    assert.equal((await request('/admin/theme', 'PUT', initial)).status, 401);
    const login = await request('/auth/login', 'POST', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    assert.equal(login.status, 201); cookie = login.headers.get('set-cookie').split(';')[0];
    for (const invalid of [
      { ...initial, palette: { ...defaultPalette, accent: 'red;}</style><script>alert(1)</script>' } },
      { ...initial, palette: { ...defaultPalette, primary: '#fff' } },
      { ...initial, palette: { primary: '#123456' } },
      { ...initial, palette: { ...defaultPalette, secret: 'no' } },
      { ...initial, version: -1 }, { ...initial, admin: true },
    ]) assert.equal((await request('/admin/theme', 'PUT', invalid, true)).status, 400);
    assert.equal((await request('/admin/theme', 'PUT', initial, true, 'https://other.example')).status, 403);
    const next = { ...initial, palette: { ...defaultPalette, primary: '#13574F', secondary: '#288b79' } };
    const race = await Promise.all([request('/admin/theme', 'PUT', next, true), request('/admin/theme', 'PUT', next, true)]);
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
    const saved = await race.find(result => result.ok).json();
    assert.equal(saved.version, 1); assert.equal(saved.palette.primary, '#13574f');
    const visitors = await Promise.all(Array.from({ length: 30 }, async () => (await request('/theme')).json()));
    assert.ok(visitors.every(value => value.version === 1 && value.palette.primary === '#13574f'));
    await stop(); start(); await ready();
    assert.deepEqual(await (await request('/theme')).json(), saved);
    assert.equal((await request('/admin/theme', 'PUT', initial, true)).status, 409);
    const restored = await request('/admin/theme', 'PUT', { palette: defaultPalette, version: 1 }, true);
    assert.equal(restored.status, 200);
    assert.deepEqual((await (await request('/theme')).json()).palette, defaultPalette);
  } finally { await stop(); await owner.query(`DROP DATABASE ${name} WITH (FORCE)`); await owner.end(); }
});
