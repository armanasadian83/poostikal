import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { digest } from './security.js';

const verified=new WeakMap<Request,{db:Pool|PoolClient; user:{id:string; expires_at:Date; document:Record<string,any>}}>();
export async function requireCustomerSession(db: Pool | PoolClient, req: Request) {
  const token = req.cookies?.poostikal_customer;
  const unauthorized = () => new UnauthorizedException('برای ادامه وارد حساب کاربری شو.');
  if (typeof token !== 'string' || !token || token.length > 200) throw unauthorized();
  const known=verified.get(req);
  if(known?.db===db)return known.user;
  const result = await db.query(
    `SELECT c.id, c.document, s.expires_at FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND c.status = 'active' AND c.deleted_at IS NULL AND NOT c.local_test`, [digest(token)]
  );
  if (!result.rowCount) throw unauthorized();
  verified.set(req,{db,user:result.rows[0]});
  return result.rows[0];
}
