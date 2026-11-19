import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';

const input = resolve(process.argv[2]);
const apply = process.argv[3] === '--apply';
const source = JSON.parse(await readFile(input, 'utf8'));
assert.equal(source.source, 'https://poostikal.ir');
assert.ok(Array.isArray(source.customers) && source.customers.length > 0);
const phones = new Set();
const sourceIds = new Set();
for (const user of source.customers) {
  assert.match(user.phone, /^09\d{9}$/);
  assert.ok(Number.isSafeInteger(user.wordpressId) && user.wordpressId > 0);
  for (const name of [user.firstName, user.lastName]) {
    assert.ok(typeof name === 'string' && name.trim().length > 1 && name.length <= 100);
    assert.ok(!/^(خانم|آقا|تست|تستی|ناشناخته|unknown|test)$/i.test(name.trim()));
  }
  assert.ok(!phones.has(user.phone) && !sourceIds.has(user.wordpressId));
  phones.add(user.phone);
  sourceIds.add(user.wordpressId);
}

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname));
const db = new Client({ connectionString: databaseUrl.href });
const importedAt = new Date().toISOString();
const run = importedAt.replaceAll(':', '-');
const report = { source: source.source, importedAt, applied: apply, inserted: [], existing: [], skipped: source.skipped };
await db.connect();
try {
  await db.query('BEGIN');
  // Hold concurrent customer creation briefly so matching and the backup use one state.
  await db.query('LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE');
  const before = (await db.query('SELECT * FROM customers ORDER BY created_at,id')).rows;
  if (apply) {
    await writeFile(resolve(dirname(input), `customers-before-${run}.json`), JSON.stringify(before, null, 2), { flag: 'wx', mode: 0o600 });
  }
  for (const user of source.customers) {
    const sameSource = before.find(row => row.document.legacySource?.site === source.source && row.document.legacySource?.userId === user.wordpressId);
    if (sameSource) {
      assert.equal(sameSource.phone, user.phone, 'Source account phone changed; manual review required');
      report.existing.push({ wordpressId: user.wordpressId, id: sameSource.id, trashed: !!sameSource.deleted_at });
      continue;
    }
    const samePhone = before.filter(row => !row.local_test && row.phone === user.phone);
    if (samePhone.length) {
      report.existing.push({ wordpressId: user.wordpressId, ids: samePhone.map(row => row.id), reason: 'Matching existing or trashed phone identity preserved' });
      continue;
    }
    const id = randomUUID();
    const document = {
      id, name: `${user.firstName} ${user.lastName}`, firstName: user.firstName,
      lastName: user.lastName, phone: user.phone, email: user.email || '',
      city: '', joinedAt: '', joinedLabel: '—', status: 'active', role: 'customer',
      orderCount: 0, totalSpentToman: 0,
      legacySource: { site: source.source, userId: user.wordpressId, importedAt },
    };
    if (apply) {
      await db.query('INSERT INTO customers(id,phone,local_test,status,document) VALUES($1,$2,false,\'active\',$3)', [id, user.phone, document]);
      await db.query('INSERT INTO audit_log(action,entity_id) VALUES($1,$2)', ['customer.import.wordpress', id]);
    }
    report.inserted.push({ wordpressId: user.wordpressId, id, name: document.name });
  }
  await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  if (apply) {
    report.note = 'Phone numbers come from the WordPress customer usernames. Original registration dates were not available and remain blank. Source first and last names are preserved. Production SMS identities use local_test=false.';
    await writeFile(resolve(dirname(input), `report-${run}.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ applied: apply, imported: report.inserted.length, alreadyPresent: report.existing.length, skippedCustomers: report.skipped.length }));
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
