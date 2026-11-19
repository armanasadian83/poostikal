import {requireCustomerSession} from './customer-session.js';
import { Body, CanActivate, Controller, ExecutionContext, Get, Header, HttpException, Injectable, Param, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { AdminGuard, type AdminRequest, RateLimiter, UploadGuard } from './security.js';
import { compressReceipt, MAX_INPUT_BYTES } from './receipt-image.js';
import { orderSummary } from './orders.js';
import { parse } from './validation.js';

const states = ['pending','approved','rejected','cancelled'] as const;
const noOrder = () => new HttpException('این سفارش در این حساب در دسترس نیست.',404);
const bankKey = 'bank-transfer';
const transferSettings = z.object({
  cardNumber:z.string().transform(s=>s.replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)&15)).replace(/[\s-]/g,'')).pipe(z.string().regex(/^\d{16}$/)),
  holderName:z.string().trim().min(3).max(100)
}).strict();
export const receiptFields = 'r.id,r.status,r.rejection_reason AS "rejectionReason",r.amount::float8 AS "amountToman",r.uploaded_at AS "uploadedAt",r.expires_at AS "expiresAt"';
const orderFields = 'o.number::text AS "orderNumber",o.total::float8 AS "orderTotalToman",o.document->>\'userName\' AS "customerName",o.status AS "orderStatus"';
const validNumber = /^\d{6}$/;
type ReceiptUpload = {buffer:Buffer;size:number};
type BuyerRequest = Request & {paymentOrderId:string};

@Injectable()
export class ReceiptBuyerGuard implements CanActivate {
  constructor(private readonly db:Database,private readonly rate:RateLimiter){}
  async canActivate(context:ExecutionContext){
    const req=context.switchToHttp().getRequest<BuyerRequest>();
    const {id:customerId}=await requireCustomerSession(this.db.pool,req);
    const number=String(req.params.number);
    if(!validNumber.test(number))throw noOrder();
    if(req.method==='POST')await this.rate.check('receipt-upload:'+req.ip,24,900);
    const result=await this.db.pool.query('SELECT id FROM orders WHERE number=$1 AND customer_id=$2 AND deleted_at IS NULL',[number,customerId]);
    if(!result.rowCount)throw noOrder();
    req.paymentOrderId=result.rows[0].id;
    return true;
  }
}

@Injectable()
export class ReceiptService {
  constructor(private readonly db:Database){}
  async bank() {return (await this.db.pool.query('SELECT document FROM settings WHERE id=$1',[bankKey])).rows[0]?.document ?? null;}
  async saveBank(body:unknown,actor:string) {
    const value=parse(transferSettings,body);
    await this.db.transaction(async c=>{
      const owner=await c.query("SELECT 1 FROM admins WHERE id=$1 AND active AND role='owner' FOR SHARE",[actor]);
      if(!owner.rowCount)throw new HttpException('فقط مالک فروشگاه می‌تواند کارت مقصد را تغییر دهد.',403);
      await c.query('INSERT INTO settings(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=excluded.document',[bankKey,value]);
      await c.query("INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,'payment.bank.update',$2)",[actor,bankKey]);
    });return value;
  }
  async confirmation(id:string,customerId?:string) {
    const [order,bank,latest]=await Promise.all([this.db.pool.query('SELECT document,status FROM orders WHERE id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR customer_id=$2)',[id,customerId??null]),this.bank(),
      this.db.pool.query('SELECT '+receiptFields+' FROM receipt_reviews r WHERE r.order_id=$1 ORDER BY uploaded_at DESC,id DESC LIMIT 1',[id])]);
    if(!order.rowCount)throw noOrder();
    const {document,status}=order.rows[0];
    return {order:orderSummary(document,status),...(customerId?{recipient:document.recipient}:{}),bank,receipt:latest.rows[0]??null,paymentStatus:document.paymentStatus??'unpaid'};
  }
  async upload(id:string,expectedTotal:string|undefined,file?:ReceiptUpload) {
    if(!file)throw new HttpException('تصویر فیش را انتخاب کن.',400);
    const image=await compressReceipt(file.buffer);
    return this.db.transaction(async c=>{
      const order=(await c.query('SELECT status,total,document FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!order)throw noOrder();
      if(!expectedTotal || expectedTotal!==String(order.total))throw new HttpException('مبلغ سفارش تغییر کرده است؛ مبلغ جدید را بررسی کن.',409);
      if(!(await c.query('SELECT 1 FROM settings WHERE id=$1',[bankKey])).rowCount)throw new HttpException('کارت مقصد هنوز تنظیم نشده است.',409);
      if(order.status!=='pending'||order.document.paymentStatus==='paid')throw new HttpException('این سفارش پذیرای فیش جدید نیست.',409);
      
      if((await c.query("SELECT 1 FROM receipt_reviews WHERE order_id=$1 AND status IN ('pending','approved')",[id])).rowCount)throw new HttpException('فیش این سفارش در حال بررسی است.',409);
      const saved=await c.query(`WITH stored AS (
        INSERT INTO payment_receipts(id,order_id,amount,image) VALUES($1,$2,$3,$4) RETURNING id,order_id,amount,uploaded_at,expires_at
      ) INSERT INTO receipt_reviews AS r(id,order_id,amount,uploaded_at,expires_at,status)
      SELECT id,order_id,amount,uploaded_at,expires_at,'pending' FROM stored RETURNING `+receiptFields,[randomUUID(),id,order.total,image]);
      return saved.rows[0];
    });
  }
  async queue(raw:unknown) {
    const {status,number,page}=parse(z.object({status:z.enum(states).optional(),number:z.string().regex(/^\d{1,6}$/).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict(),raw);
    const args=[status??null,number??null];
    const from=` FROM receipt_reviews r JOIN orders o ON o.id=r.order_id LEFT JOIN payment_receipts f ON f.id=r.id AND f.expires_at>now() WHERE o.deleted_at IS NULL AND (f.id IS NOT NULL OR r.status='pending')
      AND ($1::text IS NULL OR r.status=$1) AND ($2::text IS NULL OR o.number::text LIKE $2||'%')`;
    const [list,count]=await Promise.all([this.db.pool.query('SELECT '+receiptFields+', (f.id IS NOT NULL) AS "hasImage",'+orderFields+from+' ORDER BY r.uploaded_at DESC,r.id LIMIT 20 OFFSET $3',[...args,(page-1)*20]),
      this.db.pool.query('SELECT count(*)::int AS total'+from,args)]);
    return {items:list.rows,total:count.rows[0].total};
  }
  async image(id:string) {
    const row=(await this.db.pool.query('SELECT r.image FROM payment_receipts r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 AND r.expires_at>now() AND o.deleted_at IS NULL',[parse(z.uuid(),id)])).rows[0];
    if(!row)throw new HttpException('تصویر فیش در دسترس نیست یا مدت نگهداری آن تمام شده است.',404);
    return row.image as Buffer;
  }
  async review(id:string,body:unknown,actor:string) {
    parse(z.uuid(),id);const review=parse(z.discriminatedUnion('decision',[z.object({decision:z.literal('approved')}).strict(),z.object({decision:z.literal('rejected'),reason:z.string().trim().min(1).max(500)}).strict()]),body);
    const {decision}=review;
    return this.db.transaction(async c=>{
      // Lock orders before receipts, the same order as uploads and order edits.
      const order=(await c.query('SELECT o.* FROM orders o WHERE o.id=(SELECT order_id FROM receipt_reviews WHERE id=$1) AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!order)throw noOrder();
      const row=(await c.query('SELECT status,amount,EXISTS(SELECT 1 FROM payment_receipts f WHERE f.id=r.id AND f.expires_at>now()) AS available FROM receipt_reviews r WHERE r.id=$1 FOR UPDATE OF r',[id])).rows[0];
      if(!row)throw new HttpException('مدت نگهداری این فیش تمام شده است.',410);
      if(row.status!=='pending')throw new HttpException('این فیش قبلاً بررسی شده است.',409);
      if(order.status==='cancelled')throw new HttpException('سفارش لغو شده است.',409);
      if(decision==='approved'&&!row.available)throw new HttpException('تصویر منقضی شده است؛ برای دریافت فیش جدید، دلیل رد را بنویس.',409);
      if(decision==='approved'&&order.total!==row.amount)throw new HttpException('سفارش لغو شده یا مبلغ آن تغییر کرده است؛ تأیید این فیش ممکن نیست.',409);
      await c.query('UPDATE receipt_reviews SET status=$2,reviewed_by=$3,reviewed_at=now(),rejection_reason=$4 WHERE id=$1',[id,decision,actor,review.decision==='rejected'?review.reason:null]);
      await c.query("UPDATE orders SET version=version+1,updated_at=now(),document=document||jsonb_build_object('version',version+1,'paymentStatus',$2::text) WHERE id=$1",[order.id,decision==='approved'?'paid':'rejected']);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[actor,'receipt.'+decision,order.id]);
      return {status:decision};
    });
  }
}

@Controller('api')
export class ReceiptController {
  constructor(private readonly receipts:ReceiptService){}
  @Get('order-payment/:number') @UseGuards(ReceiptBuyerGuard) @Header('Cache-Control','private, no-store')
  confirmation(@Req() req:BuyerRequest){return this.receipts.confirmation(req.paymentOrderId);}
  @Post('order-payment/:number/receipt') @UseGuards(ReceiptBuyerGuard,UploadGuard)
  @UseInterceptors(FileInterceptor('file',{limits:{files:1,fields:0,fileSize:MAX_INPUT_BYTES+1}}))
  upload(@Req() req:BuyerRequest,@UploadedFile() file?:ReceiptUpload){if(file&&file.size>MAX_INPUT_BYTES)throw new HttpException('حداکثر حجم مجاز فیش ۱۰ مگابایت است.',413);return this.receipts.upload(req.paymentOrderId,req.get('X-Order-Total'),file);}
  @Get('admin/payment-bank') @UseGuards(AdminGuard) @Header('Cache-Control','private, no-store')
  async bank(){return {bank:await this.receipts.bank()};}
  @Put('admin/payment-bank') @UseGuards(AdminGuard)
  bankSave(@Body() body:unknown,@Req() req:AdminRequest){return this.receipts.saveBank(body,req.adminId);}
  @Get('admin/payment-receipts') @UseGuards(AdminGuard) @Header('Cache-Control','private, no-store')
  list(@Query() query:unknown){return this.receipts.queue(query);}
  @Get('admin/payment-receipts/:id/image') @UseGuards(AdminGuard)
  async image(@Param('id') id:string,@Res() res:Response){const image=await this.receipts.image(id);res.set({'Cache-Control':'private, no-store','Content-Type':'image/webp','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}).send(image);}
  @Put('admin/payment-receipts/:id') @UseGuards(AdminGuard)
  review(@Param('id') id:string,@Body() body:unknown,@Req() req:AdminRequest){return this.receipts.review(id,body,req.adminId);}
}
