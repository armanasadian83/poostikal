import {requireCustomerSession} from './customer-session.js';
import { Body, Controller, Delete, Get, HttpException, Injectable, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Database } from './database.js';
import { CatalogService, storefrontId } from './catalog.js';
import { AdminGuard, AdminRequest, digest, RateLimiter } from './security.js';
import { parse, type ProductDocument } from './validation.js';
import { clearBasketAfterCheckout, lockBasketForCheckout } from './baskets.js';

const shippingSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default(''),
  type: z.enum(['flat','collect']), feeToman: z.number().int().min(0).max(1_000_000_000),
  active: z.boolean(), sortOrder: z.number().int().min(0).max(1000).default(0),
}).strict().refine(v => v.type !== 'collect' || v.feeToman === 0, { message: 'پس‌کرایه مبلغ ثابت ندارد.' });
const digits = (s: string) => s.replace(/[۰-۹]/g, d => String(d.charCodeAt(0)-1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0)-1632));
const money = z.number().int().min(0).max(1_000_000_000_000);
export const orderSchema = z.object({
  requestId: z.uuid(), shippingMethodId: z.uuid(), expectedShippingFeeToman: money, expectedShippingType: z.enum(['flat','collect']),
  basketRevision: z.uuid().optional(),
  items: z.array(z.object({ productId:z.string().min(1).max(120), variantId:z.string().min(1).max(150), quantity:z.number().int().min(1).max(20), expectedUnitPriceToman:money }).strict()).min(1).max(100),
  recipient: z.object({ name:z.string().trim().min(2).max(100), phone:z.string().transform(digits).pipe(z.string().regex(/^09\d{9}$/)), province:z.string().trim().min(2).max(70), city:z.string().trim().min(2).max(70), address:z.string().trim().min(10).max(1000), postalCode:z.string().transform(digits).pipe(z.string().regex(/^\d{10}$/)), note:z.string().trim().max(1000).default('') }).strict(),
}).strict();
const internalId = (id:string) => id.replace(/^catalog-(?=\d+(?:-|$))/, 'raboteb-');
const shippingView = (row:Record<string,any>) => ({id:row.id,name:row.name,description:row.description,type:row.type,feeToman:Number(row.fee),active:row.active,sortOrder:row.sort_order});
const orderNumber = (n:string) => String(n).padStart(6,'0');
export const orderSummary = (document:Record<string,any>,status:string) => ({id:document.id,number:document.number,status,createdAt:document.createdAt,items:document.items,subtotalToman:document.subtotalToman,discountToman:document.discountToman,shipping:document.shipping,shippingToman:document.shippingToman,totalToman:document.totalToman});
type Adjustment = {productId:string; quantity:number; variants:{id:string;quantity:number}[]};

// Use the unique numeric index or the UUID primary key without casting an indexed column.
function orderLookup(value:string) {
  if(/^\d{6}$/.test(value))return 'number=$1::bigint';
  if(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))return 'id=$1::uuid';
  throw new HttpException('سفارش پیدا نشد.',404);
}
@Injectable()
export class OrderService {
  constructor(private readonly db:Database,private readonly catalog:CatalogService) {}
  async shipping(admin=false) { return (await this.db.pool.query(`SELECT * FROM shipping_methods ${admin?'':'WHERE active'} ORDER BY sort_order,created_at,id`)).rows.map(shippingView); }
  async saveShipping(body:unknown,adminId:string) {
    const v=parse(shippingSchema,body);
    return this.db.transaction(async client=>{
      const result=await client.query('INSERT INTO shipping_methods(id,name,description,type,fee,active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,type=EXCLUDED.type,fee=EXCLUDED.fee,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order RETURNING *',[v.id,v.name,v.description,v.type,v.feeToman,v.active,v.sortOrder]);
      await client.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,'shipping.save',v.id]);
      return shippingView(result.rows[0]);
    });
  }
  async submit(body:unknown,req:Request) {
    return this.db.transaction(async client=>{
      const {id:customerId}=await requireCustomerSession(client,req);
      if(req.headers?.['x-checkout-account']!==undefined && req.headers['x-checkout-account']!==customerId)
        throw new HttpException('حساب کاربری تغییر کرده؛ سبد خرید را دوباره باز کن.',409);
      const input=parse(orderSchema,body);
      if(new Set(input.items.map(i=>internalId(i.variantId))).size!==input.items.length) throw new HttpException('یک تنوع را فقط یک بار به سفارش اضافه کن.',400);
      const fingerprint=digest(JSON.stringify(input));
      // One result for double clicks, simultaneous requests and retries after a lost response.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.requestId]);
      const prior=await client.query('SELECT document,status,request_hash,customer_id,deleted_at FROM orders WHERE request_id=$1',[input.requestId]);
      if(prior.rowCount) {
        const row=prior.rows[0];
        if(row.customer_id!==customerId || row.deleted_at || row.request_hash!==fingerprint) throw new HttpException('این درخواست قابل تکرار نیست؛ سفارش را دوباره مرور کن.',409);
        return orderSummary(row.document,row.status);
      }
      // Older browser tabs must refresh before starting a new checkout; completed
      // request IDs above still replay. Server clients using the direct order
      // contract without a basket keep the same stock checks.
      if(req.headers?.['x-checkout-account']!==undefined && !input.basketRevision) {
        throw new HttpException('برای ثبت سفارش، سبد خرید را دوباره باز کن.',409);
      }
      // A second tab with a different request ID still cannot submit the same basket twice.
      if(input.basketRevision) await lockBasketForCheckout(client,customerId,input.basketRevision,input.items);
      const selected=await client.query('SELECT * FROM shipping_methods WHERE id=$1 AND active FOR SHARE',[input.shippingMethodId]);
      if(!selected.rowCount) throw new HttpException('این روش ارسال در دسترس نیست؛ روش دیگری انتخاب کن.',409);
      const shipping=shippingView(selected.rows[0]);
      if(shipping.feeToman!==input.expectedShippingFeeToman||shipping.type!==input.expectedShippingType) throw new HttpException('هزینه یا روش ارسال تغییر کرده؛ سبد را دوباره مرور کن.',409);
      const ids=[...new Set(input.items.map(i=>internalId(i.productId)))].sort();
      // Lock in stable order; check and deduct stock in the same transaction as the order.
      const rows=await client.query('SELECT id,document FROM products WHERE id=ANY($1::text[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',[ids]);
      const products=new Map<string,ProductDocument>(rows.rows.map(r=>[r.id,r.document]));
      const items=[];const adjustments:Adjustment[]=[];let subtotal=0,originalSubtotal=0;
      for(const id of ids) {
        const p=products.get(id);
        if(!p||p.status!=='active') throw new HttpException('یکی از محصولات دیگر قابل سفارش نیست؛ سبد را تازه کن.',409);
        const requested=input.items.filter(i=>internalId(i.productId)===id);
        const quantity=requested.reduce((sum,i)=>sum+i.quantity,0);
        if(p.stock!==null&&quantity>p.stock) throw new HttpException('موجودی یکی از محصولات کافی نیست؛ تعداد را اصلاح کن.',409);
        const publicProduct=this.catalog.publicProduct(p);
        const adjustment:Adjustment={productId:id,quantity:p.stock===null?0:quantity,variants:[]};
        for(const line of requested) {
          const variant=publicProduct.variants.find(v=>v.id===storefrontId(internalId(line.variantId)));
          if(!variant||variant.priceToman<=0||variant.stock!==null&&line.quantity>variant.stock) throw new HttpException('تنوع یا موجودی محصول تغییر کرده؛ سبد را تازه کن.',409);
          if(variant.priceToman!==line.expectedUnitPriceToman) throw new HttpException('قیمت یکی از محصولات تغییر کرده؛ قیمت جدید را در سبد بررسی کن.',409);
          subtotal+=variant.priceToman*line.quantity;
          originalSubtotal+=Math.max(variant.priceToman,variant.originalPriceToman??0)*line.quantity;
          items.push({productId:publicProduct.id,variantId:variant.id,slug:p.slug,name:publicProduct.name,brand:publicProduct.brand,image:publicProduct.image,variantLabel:variant.label,quantity:line.quantity,unitPriceToman:variant.priceToman,originalUnitPriceToman:Math.max(variant.priceToman,variant.originalPriceToman??variant.priceToman)});
          const stored=p.variants.find(v=>v.id===internalId(line.variantId));
          if(stored&&stored.stock!==null&&!stored.stockFromParent) {stored.stock-=line.quantity;adjustment.variants.push({id:stored.id,quantity:line.quantity});}
        }
        if(p.stock!==null)p.stock-=quantity;
        for(const v of p.variants)if(v.stockFromParent)v.stock=p.stock;
        if(p.stock===0)p.status='out-of-stock';
        await this.persistInventory(client,p);
        adjustments.push(adjustment);
      }
      const id=randomUUID(),createdAt=new Date().toISOString();
      const document={id,version:1,userId:customerId,userName:input.recipient.name,createdAt,dateLabel:new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(createdAt)),status:'pending',paymentStatus:'unpaid',items,originalSubtotalToman:originalSubtotal,discountToman:originalSubtotal-subtotal,subtotalToman:subtotal,shippingToman:shipping.feeToman,totalToman:subtotal+shipping.feeToman,shipping,recipient:input.recipient,note:input.recipient.note,inventory:adjustments};
      const result=await client.query("INSERT INTO orders(id,customer_id,status,total,document,request_id,request_hash) VALUES($1,$2,'pending',$3,$4,$5,$6) RETURNING number",[id,customerId,document.totalToman,document,input.requestId,fingerprint]);
      const saved={...document,number:orderNumber(result.rows[0].number)};
      await client.query('UPDATE orders SET document=$2 WHERE id=$1',[id,saved]);
      if(input.basketRevision) await clearBasketAfterCheckout(client,customerId,input.basketRevision);
      return orderSummary(saved,'pending');
    });
  }
  private async persistInventory(client:PoolClient,p:ProductDocument) {
    const result=await client.query("UPDATE products SET stock=$2,status=$3,version=version+1,document=jsonb_set($4::jsonb,'{version}',to_jsonb(version+1)),updated_at=now() WHERE id=$1 RETURNING version",[p.id,p.stock,p.status,p]);
    p.version=result.rows[0].version;
    if(p.variants.length)await client.query(`UPDATE variants a SET stock=(v->>'stock')::int,document=v
      FROM jsonb_array_elements($2::jsonb) v WHERE a.product_id=$1 AND a.id=v->>'id'`,[p.id,JSON.stringify(p.variants)]);
  }
  async read(id:string) {
    const row=(await this.db.pool.query('SELECT document,status,version FROM orders WHERE ' + orderLookup(id) + ' AND deleted_at IS NULL',[id])).rows[0];
    if(!row)throw new HttpException('سفارش پیدا نشد.',404);
    return {...row.document,status:row.status,version:row.version};
  }
  private async release(client:PoolClient,document:Record<string,any>) {
    const holds:Adjustment[]=document.inventory??[];
    for(const hold of [...holds].sort((a,b)=>a.productId.localeCompare(b.productId))){
      await client.query('SELECT release_order_allocation($1,$2)',[hold,document.id]);
    }
  }
  async edit(id:string,body:unknown,adminId:string){
    const input=parse(z.object({version:z.number().int().positive(),status:z.enum(['pending','delivered','cancelled']),recipient:orderSchema.shape.recipient,shippingMethodId:z.uuid(),shippingFeeToman:money,items:z.array(z.object({productId:z.string().min(1).max(120),variantId:z.string().min(1).max(150),quantity:z.number().int().min(1).max(1000),unitPriceToman:money}).strict()).min(1).max(100)}).strict(),body);
    if(new Set(input.items.map(i=>internalId(i.variantId))).size!==input.items.length)throw new HttpException('تنوع تکراری را در یک ردیف وارد کن.',400);
    return this.db.transaction(async c=>{
      const row=(await c.query('SELECT * FROM orders WHERE ' + orderLookup(id) + ' AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!row)throw new HttpException('سفارش پیدا نشد.',404);
      if(row.status==='delivered')throw new HttpException('سفارش تکمیل‌شده قابل ویرایش نیست.',409);
      if(row.version!==input.version)throw new HttpException('سفارش تغییر کرده؛ صفحه را تازه کن تا تغییرات دیگران حفظ شود.',409);
      const previous=row.document;
      const shippingRow=(await c.query('SELECT * FROM shipping_methods WHERE id=$1 FOR SHARE',[input.shippingMethodId])).rows[0];
      if(!shippingRow||(!shippingRow.active&&input.shippingMethodId!==previous.shipping?.id))throw new HttpException('روش ارسال در دسترس نیست.',400);
      const shipping={...shippingView(shippingRow),feeToman:input.shippingFeeToman};
      if(shipping.type==='collect'&&shipping.feeToman!==0)throw new HttpException('هزینه پس‌کرایه باید صفر باشد.',400);
      const signature=(items:any[])=>JSON.stringify(items.map(i=>[internalId(i.productId),internalId(i.variantId),i.quantity]).sort((a,b)=>String(a[1]).localeCompare(String(b[1]))));
      const inventoryChanged=signature(previous.items)!==signature(input.items)||(row.status==='cancelled')!==(input.status==='cancelled');
      const ids=[...new Set([...input.items.map(i=>internalId(i.productId)),...(previous.inventory??[]).map((i:Adjustment)=>i.productId)])].sort();
      await c.query('SELECT id FROM products WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids]);
      if(inventoryChanged&&row.status!=='cancelled')await this.release(c,previous);
      const rows=await c.query('SELECT document,deleted_at FROM products WHERE id=ANY($1::text[])',[ids]);
      const products=new Map<string,any>(rows.rows.map(r=>[r.document.id,r]));
      const items:any[]=[];const adjustments:Adjustment[]=[];
      for(const line of input.items){
        const p=products.get(internalId(line.productId))?.document as ProductDocument|undefined;
        const old=previous.items.find((v:any)=>internalId(v.productId)===internalId(line.productId)&&internalId(v.variantId)===internalId(line.variantId));
        const publicProduct=p?this.catalog.publicProduct(p):undefined;
        const variant=publicProduct?.variants.find(v=>v.id===storefrontId(internalId(line.variantId)));
        if(!old&&(!p||!variant||products.get(p.id)?.deleted_at))throw new HttpException('محصول یا تنوع انتخاب‌شده در دسترس نیست.',409);
        if(inventoryChanged&&input.status!=='cancelled'&&(!p||!variant||products.get(p.id)?.deleted_at||p.status!=='active'))throw new HttpException('یکی از محصولات قابل سفارش نیست.',409);
        items.push({...old,productId:storefrontId(internalId(line.productId)),variantId:storefrontId(internalId(line.variantId)),slug:p?.slug??old?.slug,name:old?.name??publicProduct?.name,brand:old?.brand??publicProduct?.brand,image:old?.image??publicProduct?.image,variantLabel:old?.variantLabel??variant?.label,quantity:line.quantity,unitPriceToman:line.unitPriceToman,originalUnitPriceToman:Math.max(line.unitPriceToman,old?.originalUnitPriceToman??variant?.originalPriceToman??old?.unitPriceToman??variant?.priceToman??0)});
      }
      if(inventoryChanged&&input.status!=='cancelled')for(const productId of [...new Set(input.items.map(i=>internalId(i.productId)))].sort()){
        const p=products.get(productId).document as ProductDocument;
        const requested=input.items.filter(i=>internalId(i.productId)===productId),quantity=requested.reduce((n,i)=>n+i.quantity,0);
        if(p.stock!==null&&quantity>p.stock)throw new HttpException(`موجودی «${p.name}» کافی نیست.`,409);
        const adjustment:Adjustment={productId,quantity:p.stock===null?0:quantity,variants:[]};
        for(const line of requested){
          const v=p.variants.find(v=>v.id===internalId(line.variantId));
          if(v?.stock!==null&&v?.stock!==undefined&&line.quantity>v.stock)throw new HttpException('موجودی تنوع کافی نیست.',409);
          if(v&&v.stock!==null&&!v.stockFromParent){v.stock-=line.quantity;adjustment.variants.push({id:v.id,quantity:line.quantity});}
        }
        if(p.stock!==null)p.stock-=quantity;
        for(const v of p.variants)if(v.stockFromParent)v.stock=p.stock;
        if(p.stock===0)p.status='out-of-stock';
        await this.persistInventory(c,p);adjustments.push(adjustment);
      }
      const subtotal=items.reduce((n,i)=>n+i.unitPriceToman*i.quantity,0),original=items.reduce((n,i)=>n+i.originalUnitPriceToman*i.quantity,0);
      if(!Number.isSafeInteger(subtotal+shipping.feeToman)||subtotal+shipping.feeToman>1e14)throw new HttpException('مبلغ سفارش بیش از حد مجاز است.',400);
      const document={...previous,version:row.version+1,status:input.status,recipient:input.recipient,userName:input.recipient.name,note:input.recipient.note,items,shipping,shippingToman:shipping.feeToman,subtotalToman:subtotal,originalSubtotalToman:original,discountToman:original-subtotal,totalToman:subtotal+shipping.feeToman,inventory:inventoryChanged?adjustments:previous.inventory,updatedAt:new Date().toISOString()};
      await c.query('UPDATE orders SET status=$2,total=$3,document=$4,version=version+1,updated_at=now() WHERE id=$1',[row.id,input.status,document.totalToman,document]);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,'order.edit',row.id]);
      return document;
    });
  }
  async status(id:string,body:unknown,adminId:string){
    const {status}=parse(z.object({status:z.enum(['pending','delivered','cancelled'])}).strict(),body);
    const order=await this.read(id);
    if(status===order.status)return {ok:true};
    return this.edit(id,{version:order.version,status,recipient:order.recipient,shippingMethodId:order.shipping.id,shippingFeeToman:order.shippingToman,items:order.items.map((i:any)=>({productId:i.productId,variantId:i.variantId,quantity:i.quantity,unitPriceToman:i.unitPriceToman}))},adminId);
  }
  async trash(id:string,adminId:string){
    return this.db.transaction(async c=>{
      const row=(await c.query('UPDATE orders SET deleted_at=now(),version=version+1 WHERE ' + orderLookup(id) + ' AND deleted_at IS NULL RETURNING id',[id])).rows[0];
      if(!row)throw new HttpException('سفارش پیدا نشد.',404);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,'orders.trash',row.id]);return {ok:true};
    });
  }

}

@Controller('api')
export class OrderController {
  constructor(private readonly orders:OrderService,private readonly rate:RateLimiter,private readonly db:Database) {}
  @Get('shipping-methods') shipping(@Res({passthrough:true}) res:Response) {res.setHeader('Cache-Control','no-store');return this.orders.shipping();}
  @Post('orders') async submit(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response) {res.setHeader('Cache-Control','no-store');await this.rate.check(`orders:${req.ip}`,30,900);return this.orders.submit(body,req);}
  @Get('customer/order-attempts/:requestId')
  async attempt(@Param('requestId') rawId:string,@Req() req:Request) {
    const requestId = parse(z.uuid(),rawId);
    const {id} = await requireCustomerSession(this.db.pool,req);
    const result = await this.db.pool.query(
      'SELECT document,status FROM orders WHERE request_id=$1 AND customer_id=$2 AND deleted_at IS NULL',
      [requestId,id],
    );
    const order = result.rows[0];
    if(!order) throw new HttpException('سفارشی برای این درخواست پیدا نشد.',404);
    return orderSummary(order.document,order.status);
  }
  @Get('admin/shipping-methods') @UseGuards(AdminGuard) adminShipping() {return this.orders.shipping(true);}
  @Get('admin/orders') @UseGuards(AdminGuard) async list(@Res({passthrough:true}) res:Response) {res.setHeader('Cache-Control','no-store');return (await this.db.pool.query('SELECT document,status,version FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000')).rows.map(r=>({...r.document,status:r.status,version:r.version}));}
  @Get('admin/orders/:id') @UseGuards(AdminGuard) read(@Param('id') id:string) {return this.orders.read(id);}
  @Put('admin/orders/:id') @UseGuards(AdminGuard) edit(@Param('id') id:string,@Body() body:unknown,@Req() req:AdminRequest) {return this.orders.edit(id,body,req.adminId);}
  @Delete('admin/orders/:id') @UseGuards(AdminGuard) trash(@Param('id') id:string,@Req() req:AdminRequest) {return this.orders.trash(id,req.adminId);}
  @Post('admin/shipping-methods') @UseGuards(AdminGuard) saveShipping(@Body() body:unknown,@Req() req:AdminRequest) {return this.orders.saveShipping(body,req.adminId);}
  @Put('admin/orders/:id/status') @UseGuards(AdminGuard) status(@Param('id') id:string,@Body() body:unknown,@Req() req:AdminRequest) {return this.orders.status(id,body,req.adminId);}
}
