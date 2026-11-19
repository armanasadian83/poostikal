import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
const root = resolve(import.meta.dirname, '../..');
process.chdir(resolve(root, 'backend'));
const data = resolve(root, '.data');
mkdirSync(data, { recursive: true });
const secretFile = resolve(data, 'database-secrets.json');
if (!existsSync(secretFile)) writeFileSync(secretFile, JSON.stringify({ owner: randomBytes(32).toString('hex'), app: randomBytes(32).toString('hex'), admin: randomBytes(24).toString('base64url') }), { mode: 0o600 });
const secrets = JSON.parse(readFileSync(secretFile, 'utf8'));
if (!existsSync('.env')) writeFileSync('.env', `PORT=4000\nHOST=127.0.0.1\nAPP_ORIGIN=http://127.0.0.1:7777\nDATABASE_URL=postgresql://poostikal:${secrets.app}@127.0.0.1:55432/poostikal\nDB_POOL_MAX=20\nMEDIA_DIR=../.data/media\nADMIN_EMAIL=admin@poostikal.local\nADMIN_PASSWORD=${secrets.admin}\nOPENROUTER_API_KEY=\nOPENROUTER_MODEL=openai/gpt-4.1-mini\nAI_ENABLED=false\nAI_DAILY_REQUEST_LIMIT=1000\nOTP_SECRET=${randomBytes(32).toString("hex")}\nSUPPLIER_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nNODE_ENV=development\n`, { mode: 0o600 });
const db = new EmbeddedPostgres({ databaseDir: resolve(data, 'postgres'), port: 55432, user: 'poostikal_owner', password: secrets.owner, persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=100', '-c', 'shared_buffers=128MB'], onLog: () => {}, onError: (e) => console.error(String(e).replaceAll(secrets.owner, '[redacted]')) });
let owned = false;
let probe = new Client({ host: '127.0.0.1', port: 55432, user: 'poostikal_owner', password: secrets.owner, database: 'postgres', connectionTimeoutMillis: 1500 });
try { await probe.connect(); } catch { await probe.end().catch(() => {}); if (!existsSync(resolve(data, 'postgres/PG_VERSION'))) await db.initialise(); await db.start(); owned = true; probe = db.getPgClient(); await probe.connect(); }
if (!(await probe.query("SELECT 1 FROM pg_roles WHERE rolname='poostikal'")).rowCount) await probe.query(`CREATE ROLE poostikal LOGIN PASSWORD '${secrets.app}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
if (!(await probe.query("SELECT 1 FROM pg_database WHERE datname='poostikal'")).rowCount) await probe.query('CREATE DATABASE poostikal OWNER poostikal');
await probe.end();
console.log('PostgreSQL is ready at 127.0.0.1:55432. Admin credentials are in backend/.env.');
if (owned) { for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await db.stop(); process.exit(0); }); setInterval(() => {}, 60000); }
