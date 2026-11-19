import { Body, ConflictException, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { storefrontId } from './catalog.js';
import { requireCustomerSession } from './customer-session.js';
import { Database } from './database.js';
import { parse } from './validation.js';

const lineSchema = z.object({
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  variantId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
  quantity: z.number().int().min(1).max(20),
}).strict();
export type BasketLine = z.infer<typeof lineSchema>;

const updateSchema = z.object({
  customerId: z.uuid(),
  revision: z.uuid().nullable(),
  lines: z.array(lineSchema).max(100),
  requireFull: z.boolean().optional(),
}).strict();

const internalId = (id: string) => id.replace(/^catalog-(?=\d+(?:-|$))/, 'raboteb-');
const conflict = () => new ConflictException('سبد خرید تغییر کرده؛ دوباره مرورش کن.');

function canonicalLine({productId, variantId, quantity}: BasketLine): BasketLine {
  return {
    productId: storefrontId(internalId(productId)),
    variantId: storefrontId(internalId(variantId)),
    quantity,
  };
}

function duplicateVariants(lines: readonly BasketLine[]) {
  return new Set(lines.map(line => line.variantId)).size !== lines.length;
}

function sameLines(left: readonly BasketLine[], right: readonly BasketLine[]) {
  if (left.length !== right.length) return false;
  const byVariant = new Map(left.map(line => [line.variantId, line]));
  return right.every(line => {
    const other = byVariant.get(line.variantId);
    return other?.productId === line.productId && other.quantity === line.quantity;
  });
}

type BasketRow = {revision: string; expires_at: Date | null; lines: BasketLine[]};
type LockedBasket = BasketRow & {expired: boolean | null};
type Adjustment = BasketLine & {previousQuantity: number; reason: 'stock' | 'expired'};

function view(customerId: string, row?: BasketRow, adjustments: Adjustment[] = []) {
  return {
    customerId,
    revision: row?.revision ?? null,
    expiresAt: row?.expires_at ?? null,
    lines: row?.lines ?? [],
    adjustments,
  };
}

async function lockBasket(client: PoolClient, customerId: string): Promise<LockedBasket | undefined> {
  // Evaluate expiry after the row lock, even if another checkout held the lock.
  const result = await client.query<LockedBasket>(`
    WITH locked AS MATERIALIZED (
      SELECT revision, expires_at, lines FROM customer_baskets WHERE customer_id=$1 FOR UPDATE
    )
    SELECT *, expires_at <= clock_timestamp() AS expired FROM locked`, [customerId]);
  return result.rows[0];
}

async function replaceBasket(
  client: PoolClient,
  customerId: string,
  lines: BasketLine[],
  refreshExpiry: boolean,
) {
  const result = await client.query<BasketRow>(`
    UPDATE customer_baskets
    SET lines=$2, revision=gen_random_uuid(),
        expires_at=CASE WHEN $2::jsonb='[]'::jsonb THEN NULL
          WHEN $3 THEN clock_timestamp()+interval '24 hours' ELSE expires_at END
    WHERE customer_id=$1 RETURNING revision, expires_at, lines`,
  [customerId, JSON.stringify(lines), refreshExpiry]);
  return result.rows[0];
}

type ProductStock = {
  id: string;
  stock: number | null;
  price: string;
  implicit_variant: boolean;
  variants: {id: string; stock: number | null; priceToman: number}[];
};

async function reconcileStock(client: PoolClient, lines: BasketLine[]) {
  const adjustments: Adjustment[] = [];
  const available: BasketLine[] = [];
  if (!lines.length) return {lines: available, adjustments};
  const ids = [...new Set(lines.map(line => internalId(line.productId)))];
  const variantIds = lines.map(line => internalId(line.variantId));
  const result = await client.query<ProductStock>(`
    SELECT id, stock, price,
      coalesce(jsonb_array_length(document->'variants'), 0)=0 AS implicit_variant,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', variant->>'id',
        'stock', variant->'stock', 'priceToman', variant->'priceToman'))
        FROM jsonb_array_elements(document->'variants') variant
        WHERE variant->>'id'=ANY($2::text[])), '[]'::jsonb) AS variants
    FROM products WHERE id=ANY($1::text[]) AND status='active' AND deleted_at IS NULL`, [ids, variantIds]);
  const products = new Map(result.rows.map(product => [product.id, {
    remaining: product.stock ?? Infinity,
    variants: new Map((product.implicit_variant ? [{
      id: product.id + '-default', stock: product.stock, priceToman: Number(product.price),
    }] : product.variants).map(variant => [storefrontId(variant.id), variant])),
  }]));
  // Keep the basket's line order when variants share a limited pool of stock.
  for (const line of lines) {
    const product = products.get(internalId(line.productId));
    const variant = product?.variants.get(line.variantId);
    const quantity = product && variant && variant.priceToman > 0
      ? Math.max(0, Math.min(line.quantity, product.remaining, variant.stock ?? Infinity))
      : 0;
    if (quantity > 0 && product) {
      available.push({...line, quantity});
      product.remaining -= quantity;
    }
    if (quantity !== line.quantity) {
      adjustments.push({...line, quantity, previousQuantity: line.quantity, reason: 'stock'});
    }
  }
  return {lines: available, adjustments};
}

export async function lockBasketForCheckout(
  client: PoolClient,
  customerId: string,
  revision: string,
  items: readonly BasketLine[],
) {
  const row = await lockBasket(client, customerId);
  const requested = items.map(canonicalLine);
  if (!row || row.expired || row.revision !== revision || duplicateVariants(requested) ||
      !sameLines(row.lines, requested)) throw conflict();
}

export async function clearBasketAfterCheckout(client: PoolClient, customerId: string, revision: string) {
  // Retain a new revision even when the basket is empty, so an old write cannot recreate it.
  const result = await client.query(`
    UPDATE customer_baskets SET lines='[]', expires_at=NULL, revision=gen_random_uuid()
    WHERE customer_id=$1 AND revision=$2`, [customerId, revision]);
  if (!result.rowCount) throw conflict();
}

@Controller('api/customer/basket')
export class BasketController {
  constructor(private readonly db: Database) {}

  @Get()
  async get(@Req() request: Request) {
    const {id: customerId} = await requireCustomerSession(this.db.pool, request);
    return this.db.transaction(async client => {
      const row = await lockBasket(client, customerId);
      if (!row) return view(customerId);
      if (row.expired) {
        const adjustments: Adjustment[] = row.lines.map(line => ({
          ...line, previousQuantity: line.quantity, quantity: 0, reason: 'expired',
        }));
        return view(customerId, await replaceBasket(client, customerId, [], false), adjustments);
      }
      const checked = await reconcileStock(client, row.lines);
      if (!checked.adjustments.length) return view(customerId, row);
      const adjusted = await replaceBasket(client, customerId, checked.lines, false);
      return view(customerId, adjusted, checked.adjustments);
    });
  }

  @Put()
  async update(@Req() request: Request, @Body() body: unknown) {
    const input = parse(updateSchema, body);
    const lines = input.lines.map(canonicalLine);
    if (duplicateVariants(lines)) throw new ConflictException('این تنوع چند بار به سبد اضافه شده.');
    return this.db.transaction(async client => {
      const {id: customerId} = await requireCustomerSession(client, request);
      if (input.customerId !== customerId) throw conflict();
      const row = await lockBasket(client, customerId);
      if (row?.expired || (row?.revision ?? null) !== input.revision) throw conflict();
      const checked = await reconcileStock(client, lines);
      if (input.requireFull && checked.adjustments.length) {
        throw new ConflictException('موجودی یکی از محصولات تغییر کرده. انتخاب‌ها رو دوباره بررسی کن.');
      }
      if (sameLines(row?.lines ?? [], checked.lines)) return view(customerId, row, checked.adjustments);
      if (row) {
        return view(customerId, await replaceBasket(client, customerId, checked.lines, true), checked.adjustments);
      }
      const inserted = await client.query<BasketRow>(`
        INSERT INTO customer_baskets(customer_id, lines, expires_at)
        VALUES($1,$2,clock_timestamp()+interval '24 hours')
        ON CONFLICT(customer_id) DO NOTHING RETURNING revision, expires_at, lines`,
      [customerId, JSON.stringify(checked.lines)]);
      if (!inserted.rowCount) throw conflict();
      return view(customerId, inserted.rows[0], checked.adjustments);
    });
  }
}
