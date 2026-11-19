import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Request, Response } from 'express';
import { Database } from './database.js';
const scryptAsync = promisify(scrypt);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(value: string) { const salt = randomBytes(16).toString('hex'); const hash = await scryptAsync(value, salt, 64) as Buffer; return `${salt}:${hash.toString('hex')}`; }
export async function verifyPassword(value: string, encoded: string) { const [salt, hash] = encoded.split(':'); const derived = await scryptAsync(value, salt, 64) as Buffer; const expected = Buffer.from(hash, 'hex'); return expected.length === derived.length && timingSafeEqual(expected, derived); }
export type AdminRequest = Request & { adminId: string; adminRole: string; adminExpires:Date };
@Injectable()
export class RateLimiter {
  constructor(private readonly db: Database) {}
  async check(key: string, max: number, seconds: number) {
    const { rows } = await this.db.pool.query(`INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END, reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING hits`, [key, seconds]);
    if (rows[0].hits > max) throw new HttpException('درخواست‌های زیادی فرستاده شده؛ کمی بعد دوباره امتحان کن.', 429);
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    // Existing controller guards can share the global guard's result on this request only.
    if (req.adminId && req.adminRole) return true;
    const token = req.cookies?.poostikal_admin;
    if (typeof token !== 'string' || token.length > 200) throw new UnauthorizedException('ابتدا وارد پنل مدیریت شو.');
    const { rows } = await this.db.pool.query('SELECT s.admin_id,s.expires_at,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active', [digest(token)]);
    if (!rows.length) throw new UnauthorizedException('نشست مدیریت به پایان رسیده است.');
    req.adminId = rows[0].admin_id; req.adminRole = rows[0].role; req.adminExpires=rows[0].expires_at;
    return true;
  }
}
// Bootstrap a valid session issued by an older installation at /api. Do not extend its DB expiry.
export function migrateSessionScope(req:Request,res:Response,name:'poostikal_customer'|'poostikal_admin',expires:Date){
  if(req.cookies?.[name+'_scope']==='2'||!req.cookies?.[name])return;
  const options={httpOnly:true,sameSite:name==='poostikal_admin'?'strict' as const:'lax' as const,secure:process.env.NODE_ENV==='production',expires,path:'/'};
  res.cookie(name,req.cookies[name],options);res.clearCookie(name,{path:'/api'});
  res.cookie(name+'_scope','2',options);
}
// Reserve a slot before Multer buffers the request body. Both response events
// can fire, so release exactly once, including aborted uploads.
@Injectable()
export class UploadGuard implements CanActivate {
  private active = 0;
  canActivate(context: ExecutionContext) {
    if (this.active >= 3) throw new HttpException('بارگذاری‌ها در حال انجام‌اند؛ چند لحظه دیگر امتحان کن.', 429);
    this.active++;
    const response = context.switchToHttp().getResponse<Response>();
    let released = false;
    const release = () => { if (!released) { released = true; this.active--; } };
    response.once('finish', release);
    response.once('close', release);
    return true;
  }
}
export function requireSameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (origin && origin !== process.env.APP_ORIGIN) throw new ForbiddenException('مبدأ درخواست مجاز نیست.');
  if (req.headers['sec-fetch-site'] === 'cross-site' || (!origin && req.headers['sec-fetch-site'] === 'same-site') || (process.env.NODE_ENV==='production' && !origin && req.headers.cookie && req.headers['sec-fetch-site']!=='same-origin')) throw new ForbiddenException();
}

