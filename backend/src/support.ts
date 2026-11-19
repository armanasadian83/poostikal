import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const stickers: typeof import('./support-stickers.json') = createRequire(import.meta.url)('./support-stickers.json');
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { requireCustomerSession } from './customer-session.js';
import { digest, RateLimiter, type AdminRequest } from './security.js';
import { parse } from './validation.js';

const cookie = 'poostikal_support';
const likes = `m.id::text AS id, m.like_version::text AS version,
  (SELECT count(*)::int FROM support_message_likes l WHERE l.message_id=m.id) AS "likeCount",
  EXISTS(SELECT 1 FROM support_message_likes l WHERE l.message_id=m.id AND l.actor=$2) AS liked`;
const selectMessage = `SELECT ${likes}, m.sender, m.body, m.created_at AS "createdAt", m.sticker_id AS "stickerId",
  CASE WHEN parent.id IS NOT NULL THEN jsonb_build_object('id',parent.id::text,'sender',parent.sender,
    'body',left(parent.body,140),'stickerId',parent.sticker_id) END AS "replyTo"
  FROM support_messages m LEFT JOIN support_messages parent ON parent.thread_id=m.thread_id AND parent.id=m.reply_to`;
const cursor = z.string().regex(/^[1-9]\d{0,17}$/);
const missing = () => new NotFoundException('گفت‌وگو پیدا نشد.');

@Controller('api')
export class SupportController {
  constructor(private readonly db: Database, private readonly rate: RateLimiter) {}

  private async identity(req: Request) {
    if (req.cookies?.poostikal_customer) {
      try { return (await requireCustomerSession(this.db.pool, req)).id as string; }
      catch (err) { if (!(err instanceof UnauthorizedException)) throw err; }
    }
    return null;
  }

  private guestHash(req: Request) {
    const token = req.cookies?.[cookie];
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? digest(token) : null;
  }

  @Post('support/open')
  async open(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { phone } = parse(z.object({ phone: z.string().regex(/^09\d{9}$/).optional() }), body ?? {});
    const customer = await this.identity(req);
    if (customer) {
      const result = await this.db.pool.query(`INSERT INTO support_threads(id, customer_id, phone)
        SELECT $1, id, phone FROM customers WHERE id=$2
        ON CONFLICT(customer_id) DO UPDATE SET phone=EXCLUDED.phone RETURNING id`, [randomUUID(), customer]);
      return { threadId: result.rows[0].id };
    }
    const hash = this.guestHash(req);
    if (hash) {
      const existing = await this.db.pool.query('SELECT id FROM support_threads WHERE guest_hash=$1 AND guest_expires_at>now()', [hash]);
      if (existing.rowCount) return { threadId: existing.rows[0].id };
    }
    if (!phone) return { threadId: null };
    await this.rate.check('support-open:' + req.ip, 30, 3600);
    const token = randomBytes(32).toString('hex');
    const id = randomUUID();
    const expires = new Date(Date.now() + 90 * 86400000);
    await this.db.pool.query('INSERT INTO support_threads(id, guest_hash, guest_expires_at, phone) VALUES($1,$2,$3,$4)', [id, digest(token), expires, phone]);
    res.cookie(cookie, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/support', expires });
    return { threadId: id };
  }

  private async authorize(req: Request, threadId: string) {
    const customer = await this.identity(req);
    const hash = customer ? null : this.guestHash(req);
    const result = await this.db.pool.query(`SELECT 1 FROM support_threads WHERE id=$1 AND
      (customer_id=$2 OR (guest_hash=$3 AND guest_expires_at>now()))`, [parse(z.uuid(), threadId), customer, hash]);
    if (!result.rowCount) throw missing();
  }

  private async history(id: string, query: unknown, actor: string) {
    const { before, after, since } = parse(z.object({
      before: cursor.optional(), after: cursor.optional(), since: z.union([cursor,z.literal('0')]).optional(),
    }).refine(v => !(v.after && v.before)), query);
    // Take the initial watermark before reading messages so a concurrent reaction can be replayed on the next poll.
    let likeCursor = since;
    if (since === undefined || actor !== 'customer') {
      const thread = await this.db.pool.query('SELECT like_version::text AS version FROM support_threads WHERE id=$1', [id]);
      if (!thread.rowCount) throw missing();
      likeCursor ??= thread.rows[0].version;
    }
    const condition = before ? 'AND m.id < $3' : after ? 'AND m.id > $3' : '';
    const values = before || after ? [id, actor, before || after] : [id, actor];
    const result = await this.db.pool.query(`${selectMessage} WHERE m.thread_id=$1 ${condition}
      ORDER BY m.id ${after ? 'ASC' : 'DESC'} LIMIT 61`, values);
    const batch = result.rows.slice(0, 60);
    const changes = since === undefined ? [] : (await this.db.pool.query(`SELECT ${likes}
      FROM support_messages m WHERE m.thread_id=$1 AND m.like_version>0 AND m.like_version>$3
      ORDER BY m.like_version LIMIT 61`, [id, actor, since])).rows;
    const updates = changes.slice(0,60);
    return { messages: after ? batch : batch.reverse(), hasMore: result.rows.length>60, updates,
      likeCursor: updates.at(-1)?.version ?? likeCursor, moreUpdates: changes.length>60 };
  }

  private async append(id: string, body: unknown, sender: 'customer' | 'staff', actor: string) {
    const message = parse(z.object({ body: z.string().trim().min(1).max(3000).optional(),
      stickerId: z.string().max(32).refine(id => stickers.some(s=>s.id===id)).optional(),
      replyTo: cursor.optional(), clientId: z.uuid(),
    }).refine(m => Boolean(m.body) !== Boolean(m.stickerId)), body);
    const sticker = stickers.find(item => item.id === message.stickerId);
    return this.db.transaction(async client => {
      if (!(await client.query('SELECT 1 FROM support_threads WHERE id=$1 FOR UPDATE', [id])).rowCount) throw missing();
      if (message.replyTo && !(await client.query('SELECT 1 FROM support_messages WHERE thread_id=$1 AND id=$2', [id,message.replyTo])).rowCount) {
        throw new NotFoundException('پیام موردنظر در این گفت‌وگو پیدا نشد.');
      }
      const saved = await client.query(`INSERT INTO support_messages(thread_id,sender,client_id,body,sticker_id,reply_to)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(thread_id,sender,client_id) DO NOTHING RETURNING id`,
        [id,sender,message.clientId,sticker ? 'استیکر · '+sticker.label : message.body,sticker?.id,message.replyTo]);
      if (saved.rowCount) await client.query('UPDATE support_threads SET last_message_id=$2 WHERE id=$1', [id,saved.rows[0].id]);
      return (await client.query(`${selectMessage} WHERE m.thread_id=$1 AND m.sender=$3 AND m.client_id=$4`,
        [id,actor,sender,message.clientId])).rows[0];
    });
  }

  private async setLike(thread: string, messageId: string, actor: string, body: unknown) {
    const { liked } = parse(z.object({ liked:z.boolean() }), body);
    const id = parse(cursor, messageId);
    return this.db.transaction(async client => {
      await client.query('SELECT 1 FROM support_threads WHERE id=$1 FOR UPDATE', [thread]);
      if (!(await client.query('SELECT 1 FROM support_messages WHERE thread_id=$1 AND id=$2',[thread,id])).rowCount) throw missing();
      const changed = liked
        ? await client.query('INSERT INTO support_message_likes(message_id,actor) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,actor])
        : await client.query('DELETE FROM support_message_likes WHERE message_id=$1 AND actor=$2',[id,actor]);
      if (changed.rowCount) {
        const revision = await client.query('UPDATE support_threads SET like_version=like_version+1 WHERE id=$1 RETURNING like_version',[thread]);
        await client.query('UPDATE support_messages SET like_version=$2 WHERE id=$1',[id,revision.rows[0].like_version]);
      }
      return (await client.query(`SELECT ${likes} FROM support_messages m WHERE m.id=$1`,[id,actor])).rows[0];
    });
  }

  @Post('support/:id/messages/:messageId/like')
  async customerLike(@Param('id') id: string, @Param('messageId') messageId: string, @Req() req: Request, @Body() body: unknown) {
    await this.authorize(req, id);
    await this.rate.check('support-likes:'+id, 150, 60);
    return this.setLike(id,messageId,'customer',body);
  }

  @Post('admin/support/:id/messages/:messageId/like')
  async staffLike(@Param('id') id: string, @Param('messageId') messageId: string, @Req() req: AdminRequest, @Body() body: unknown) {
    return this.setLike(parse(z.uuid(),id),messageId,req.adminId,body);
  }

  @Get('support/:id/messages')
  async messages(@Param('id') id: string, @Req() req: Request, @Query() query: unknown) {
    await this.authorize(req, id);
    return this.history(id, query, 'customer');
  }

  @Post('support/:id/messages')
  async send(@Param('id') id: string, @Req() req: Request, @Body() body: unknown) {
    await this.authorize(req, id);
    await this.rate.check('support-send:' + id, 80, 60);
    return this.append(id, body, 'customer', 'customer');
  }

  @Get('admin/support')
  async inbox(@Query() query: unknown) {
    const { q, offset } = parse(z.object({ q: z.string().trim().max(100).default(''), offset: z.coerce.number().int().min(0).max(10000000).default(0) }), query);
    const result = await this.db.pool.query(`SELECT t.id, t.phone, nullif(c.document->>'name', t.phone) AS name,
      t.pinned, m.sender, left(m.body, 120) AS preview, m.created_at AS "updatedAt"
      FROM support_threads t JOIN support_messages m ON m.id=t.last_message_id
      LEFT JOIN customers c ON c.id=t.customer_id
      WHERE t.last_message_id IS NOT NULL AND ($1='' OR strpos(t.phone,$1)>0 OR strpos(lower(c.document->>'name'),lower($1))>0)
      ORDER BY t.pinned DESC, t.last_message_id DESC LIMIT 41 OFFSET $2`, [q,offset]);
    return { threads: result.rows.slice(0,40), hasMore: result.rows.length > 40 };
  }

  @Patch('admin/support/:id/pin')
  async pin(@Param('id') id: string, @Body() body: unknown) {
    const { pinned } = parse(z.object({ pinned: z.boolean() }), body);
    const result = await this.db.pool.query('UPDATE support_threads SET pinned=$2 WHERE id=$1 RETURNING pinned', [parse(z.uuid(), id), pinned]);
    if (!result.rowCount) throw missing();
    return result.rows[0] as { pinned: boolean };
  }

  @Delete('admin/support/:id')
  async deleteThread(@Param('id') id: string) {
    // Messages and their reactions are deleted by the thread's foreign-key cascade.
    await this.db.pool.query('DELETE FROM support_threads WHERE id=$1', [parse(z.uuid(), id)]);
    return { deleted: true };
  }

  @Get('admin/support/:id/messages')
  async adminHistory(@Param('id') id: string, @Query() query: unknown, @Req() req: AdminRequest) {
    return this.history(parse(z.uuid(), id), query, req.adminId);
  }

  @Post('admin/support/:id/messages')
  async reply(@Param('id') id: string, @Req() req: AdminRequest, @Body() body: unknown) {
    await this.rate.check('support-reply:' + req.adminId, 150, 60);
    return this.append(parse(z.uuid(), id), body, 'staff', req.adminId);
  }
}
