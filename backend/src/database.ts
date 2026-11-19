import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
function poolLimit() {
  const value=Number(process.env.DB_POOL_MAX||20);
  if(!Number.isInteger(value)||value<1||value>200)throw new Error('DB_POOL_MAX must be an integer between 1 and 200');
  return value;
}
@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: poolLimit(), application_name: 'poostikal-api', connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000, idle_in_transaction_session_timeout: 10000, ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}) });
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard=false;
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { try{await client.query('ROLLBACK');}catch{discard=true;} throw error; } finally { client.release(discard); }
  }
  async onModuleInit() {
    this.pool.on('error', () => console.error('PostgreSQL pool connection failed.'));
    await this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(834622)');
      await client.query('CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
      for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
        const sql = await readFile(`migrations/${file}`, 'utf8'); const hash = createHash('sha256').update(sql).digest('hex');
        const existing = await client.query('SELECT checksum FROM migrations WHERE name=$1', [file]);
        if (existing.rowCount) { if (existing.rows[0].checksum !== hash) throw new Error(`Migration modified: ${file}`); continue; }
        await client.query(sql); await client.query('INSERT INTO migrations(name,checksum) VALUES($1,$2)', [file, hash]);
      }
    });
  }
  async onModuleDestroy() { await this.pool.end(); }
}

