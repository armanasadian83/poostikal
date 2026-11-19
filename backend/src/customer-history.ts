import {Controller, Get, HttpException, Param, Query, UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {Database} from './database.js';
import {AdminGuard} from './security.js';
import {parse} from './validation.js';

const paging = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(['all', 'pending', 'delivered', 'cancelled']).default('all'),
}).strict();
const PAGE_SIZE = 8;

@Controller('api/admin/users') @UseGuards(AdminGuard)
export class CustomerHistoryController {
  constructor(private readonly db: Database) {}

  @Get(':id/history')
  async history(@Param('id') rawId: string, @Query() query: unknown) {
    const id = parse(z.uuid(), rawId);
    const {page, status} = parse(paging, query);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await client.query('SELECT id,phone,status,local_test,document,created_at,last_login_at FROM customers WHERE id=$1 AND deleted_at IS NULL', [id]);
      const row = result.rows[0];
      if (!row) throw new HttpException('مشتری پیدا نشد یا به سطل زباله منتقل شده.', 404);
      const doc = row.document;
      // Account ownership is authoritative; recipient phones can belong to someone else.
      const stats = (await client.query(`SELECT count(*)::int AS "orderCount",
        count(*) FILTER (WHERE status='delivered')::int AS "completedCount",
        count(*) FILTER (WHERE status='pending')::int AS "pendingCount",
        count(*) FILTER (WHERE status='cancelled')::int AS "cancelledCount",
        coalesce(sum(total) FILTER (WHERE status='delivered'),0)::float8 AS "totalSpentToman",
        coalesce(round(avg(total) FILTER (WHERE status='delivered')),0)::float8 AS "averageOrderToman",
        min(created_at) AS "firstOrderAt", max(created_at) AS "lastOrderAt"
        FROM orders WHERE customer_id=$1 AND deleted_at IS NULL`, [id])).rows[0];
      const total = status === 'all' ? stats.orderCount : status === 'pending' ? stats.pendingCount : status === 'delivered' ? stats.completedCount : stats.cancelledCount;
      const currentPage = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
      const orders = await client.query(`SELECT id,number,created_at,status,total,document FROM orders
        WHERE customer_id=$1 AND deleted_at IS NULL ${status === 'all' ? '' : 'AND status=$3'}
        ORDER BY created_at DESC,number DESC LIMIT 8 OFFSET $2`,
        status === 'all' ? [id, (currentPage - 1) * PAGE_SIZE] : [id, (currentPage - 1) * PAGE_SIZE, status]);
      const products = await client.query(`SELECT item->>'productId' AS "productId",
        (array_agg(item->>'name' ORDER BY o.created_at DESC,o.number DESC))[1] AS name,
        (array_agg(item->>'image' ORDER BY o.created_at DESC,o.number DESC))[1] AS image,
        sum((item->>'quantity')::int)::int AS quantity, count(DISTINCT o.id)::int AS "orderCount",
        sum((item->>'quantity')::int*(item->>'unitPriceToman')::numeric)::float8 AS "totalToman"
        FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->'items') item
        WHERE o.customer_id=$1 AND o.deleted_at IS NULL AND o.status='delivered'
        GROUP BY item->>'productId' ORDER BY quantity DESC,"totalToman" DESC,"productId" LIMIT 6`, [id]);
      const addresses = await client.query('SELECT id,document FROM customer_addresses WHERE customer_id=$1 ORDER BY created_at DESC,id LIMIT 30', [id]);
      return {
        customer: {id: row.id, name: doc.name || row.phone, phone: row.phone, email: doc.email || '', city: doc.city || '',
          status: row.status, localTest: row.local_test, joinedAt: doc.joinedAt || (doc.legacySource ? null : row.created_at),
          importedAt: doc.legacySource?.importedAt || null, lastLoginAt: row.last_login_at},
        stats, topProducts: products.rows,
        orders: {page: currentPage, pageSize: PAGE_SIZE, total, items: orders.rows.map(o => ({id:o.id,
          number:o.document.number || String(o.number), createdAt:o.created_at, status:o.status,
          totalToman:Number(o.total), paymentStatus:o.document.paymentStatus || 'unpaid',
          itemCount:(o.document.items || []).reduce((sum:number,item:{quantity:number}) => sum + item.quantity, 0),
          recipientName:o.document.recipient?.name || o.document.userName || '',
          recipientPhone:o.document.recipient?.phone || ''}))},
        addresses: addresses.rows.map(a => ({id:a.id,label:a.document.label,name:a.document.name,
          phone:a.document.phone,province:a.document.province,city:a.document.city,address:a.document.address,postalCode:a.document.postalCode})),
      };
    });
  }
}
