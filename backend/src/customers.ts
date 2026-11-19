import {requireCustomerSession} from './customer-session.js';
import {Body,Controller,Delete,Get,Header,Param,Put,Query,HttpException,Post,Req,Res,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHmac,randomInt,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {Request,Response} from 'express';
import {z} from 'zod';
import {Database} from './database.js';
import {digest,RateLimiter,migrateSessionScope} from './security.js';
import {IntegrationSettings} from './integration-settings.js';
import {parse} from './validation.js';
import {orderSchema} from './orders.js';
import {ReceiptService,receiptFields} from './payment-receipts.js';
import {sendSmsIrOtp} from './sms-ir.js';
const addressSchema=orderSchema.shape.recipient.omit({note:true}).extend({label:z.string().trim().min(1).max(60)}).strict();
const paging=z.object({page:z.coerce.number().int().positive().max(100000).default(1)}).strict();
const phoneSchema=z.string().regex(/^09[0-9]{9}$/);
function otpHash(secret:string,phone:string,code:string){
  return createHmac('sha256',secret).update(`${phone}:${code}`).digest('hex');
}
@Controller('api/customer')
export class CustomerController {
  constructor(private readonly db:Database,private readonly rate:RateLimiter,private readonly integrations:IntegrationSettings,private readonly receipts:ReceiptService){}
  @Post('otp') async requestOtp(@Body() body:unknown,@Req() req:Request){
    const {phone}=parse(z.object({phone:phoneSchema}),body);
    await this.rate.check(`otp-ip:${req.ip}`,10,3600);
    const secret=process.env.OTP_SECRET;
    const credentials=secret?await this.integrations.smsCredentials():null;
    if(!secret||!credentials)throw new ServiceUnavailableException('ورود پیامکی هنوز فعال نشده است.');
    await this.rate.check(`otp-phone:${phone}`,1,60);
    await this.rate.check(`otp-day:${phone}`,8,86400);
    const code=String(randomInt(100000,1000000));const hash=otpHash(secret,phone,code);
    await this.db.pool.query("INSERT INTO otp_challenges(phone,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(phone) DO UPDATE SET code_hash=EXCLUDED.code_hash,attempts=0,expires_at=EXCLUDED.expires_at",[phone,hash]);
    try {
      await sendSmsIrOtp({...credentials,mobile:phone,code});
    } catch {
      await this.db.pool.query('DELETE FROM otp_challenges WHERE phone=$1 AND code_hash=$2',[phone,hash]);
      throw new ServiceUnavailableException('پیامک ارسال نشد؛ کمی بعد دوباره امتحان کن.');
    }
    return {ok:true,expiresIn:300};
  }
  @Post('verify') async verify(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const {phone,code}=parse(z.object({phone:phoneSchema,code:z.string().regex(/^[0-9]{6}$/)}),body);
    await this.rate.check(`verify:${req.ip}`,30,900);
    const secret=process.env.OTP_SECRET;
    if(!secret)throw new ServiceUnavailableException('ورود پیامکی فعال نیست.');
    const outcome=await this.db.transaction(async client=>{
      const result=await client.query('SELECT code_hash FROM otp_challenges WHERE phone=$1 AND expires_at>now() AND attempts<5 FOR UPDATE',[phone]);
      if(!result.rowCount)return null;
      const expected=Buffer.from(result.rows[0].code_hash,'hex'),provided=Buffer.from(otpHash(secret,phone,code),'hex');
      if(expected.length!==provided.length||!timingSafeEqual(expected,provided)){
        await client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE phone=$1',[phone]);
        return null;
      }
      await client.query('DELETE FROM otp_challenges WHERE phone=$1',[phone]);
      const id=randomUUID();
      const now=new Date();
      const document={id,name:phone,phone,city:'',joinedAt:now.toISOString(),joinedLabel:new Intl.DateTimeFormat('fa-IR').format(now),status:'active',role:'customer',orderCount:0,totalSpentToman:0};
      const customer=await client.query(`INSERT INTO customers(id,phone,local_test,document) VALUES($1,$2,false,$3)
        ON CONFLICT(phone,local_test) WHERE deleted_at IS NULL DO UPDATE SET phone=EXCLUDED.phone RETURNING id,status`,[id,phone,document]);
      if(customer.rows[0].status==='blocked')return null;
      const token=randomBytes(32).toString('base64url');
      await client.query("INSERT INTO customer_sessions VALUES($1,$2,now()+interval '30 days')",[digest(token),customer.rows[0].id]);
      await client.query('UPDATE customers SET last_login_at=now() WHERE id=$1',[customer.rows[0].id]);
      return {token,customerId:customer.rows[0].id};
    });
    if(!outcome)throw new UnauthorizedException('کد معتبر نیست یا مهلتش تمام شده است.');res.cookie('poostikal_customer',outcome.token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:30*86400000,path:'/'});if(req.cookies?.poostikal_customer)res.clearCookie('poostikal_customer',{path:'/api'});return {ok:true,customerId:outcome.customerId};
  }
  current(req:Request){return requireCustomerSession(this.db.pool,req);}
  @Get('session') @Header('Cache-Control','private, no-store')
  async session(@Req() req:Request,@Res({passthrough:true}) res:Response){const {id,expires_at}=await this.current(req);migrateSessionScope(req,res,'poostikal_customer',expires_at);return {id};}
  @Get('me') async me(@Req() req:Request){
    const {id,document}=await this.current(req);
    const counts=await this.db.pool.query(`SELECT
      (SELECT count(*)::int FROM orders WHERE customer_id=$1 AND deleted_at IS NULL) AS orders,
      (SELECT count(*)::int FROM receipt_reviews r JOIN orders o ON o.id=r.order_id WHERE o.customer_id=$1 AND o.deleted_at IS NULL) AS receipts,
      (SELECT count(*)::int FROM customer_addresses WHERE customer_id=$1) AS addresses`,[id]);
    return {customer:{phone:document.phone,name:document.name,joinedAt:document.joinedAt},counts:counts.rows[0]};
  }
  @Put('profile') async profile(@Req() req:Request,@Body() body:unknown){
    const {id}=await this.current(req);const {name}=parse(z.object({name:z.string().trim().min(2).max(100)}).strict(),body);
    await this.db.pool.query("UPDATE customers SET document=document||jsonb_build_object('name',$2::text) WHERE id=$1",[id,name]);return {name};
  }
  @Get('addresses') async addresses(@Req() req:Request){
    const {id}=await this.current(req);const list=await this.db.pool.query('SELECT id,document FROM customer_addresses WHERE customer_id=$1 ORDER BY created_at DESC,id',[id]);return list.rows.map(r=>({...r.document,id:r.id}));
  }
  @Post('addresses') async addAddress(@Req() req:Request,@Body() body:unknown){
    const {id}=await this.current(req),doc=parse(addressSchema,body),addressId=randomUUID();
    await this.db.transaction(async c=>{await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[id]);
      if((await c.query('SELECT count(*)::int AS n FROM customer_addresses WHERE customer_id=$1',[id])).rows[0].n>=30)throw new HttpException('حداکثر ۳۰ نشانی می‌توانی ذخیره کنی.',409);
      await c.query('INSERT INTO customer_addresses(id,customer_id,document) VALUES($1,$2,$3)',[addressId,id,doc]);});return {id:addressId,...doc};
  }
  @Put('addresses/:id') async updateAddress(@Param('id') addressId:string,@Req() req:Request,@Body() body:unknown){
    const {id}=await this.current(req),doc=parse(addressSchema,body);
    if(!(await this.db.pool.query('UPDATE customer_addresses SET document=$3 WHERE customer_id=$1 AND id=$2',[id,parse(z.uuid(),addressId),doc])).rowCount)throw new HttpException('نشانی یافت نشد.',404);
    return {id:addressId,...doc};
  }
  @Delete('addresses/:id') async deleteAddress(@Param('id') addressId:string,@Req() req:Request){
    const {id}=await this.current(req);if(!(await this.db.pool.query('DELETE FROM customer_addresses WHERE customer_id=$1 AND id=$2',[id,parse(z.uuid(),addressId)])).rowCount)throw new HttpException('نشانی یافت نشد.',404);return {ok:true};
  }
  @Get('orders') async orders(@Req() req:Request,@Query() query:unknown){
    const {id}=await this.current(req),{page}=parse(paging,query);
    const result=await this.db.pool.query(`SELECT o.number::text AS number,o.status,o.created_at AS "createdAt",o.total::float8 AS "totalToman",
      o.document->'items'->0->>'name' AS "firstItem", jsonb_array_length(o.document->'items') AS "itemCount",
      coalesce(r.status,CASE o.document->>'paymentStatus' WHEN 'paid' THEN 'approved' WHEN 'rejected' THEN 'rejected' END) AS "receiptStatus"
      FROM orders o LEFT JOIN LATERAL (SELECT status FROM receipt_reviews WHERE order_id=o.id ORDER BY uploaded_at DESC,id DESC LIMIT 1) r ON true
      WHERE o.customer_id=$1 AND o.deleted_at IS NULL ORDER BY o.created_at DESC,o.number DESC LIMIT 21 OFFSET $2`,[id,(page-1)*20]);
    return {items:result.rows.slice(0,20),hasNext:result.rows.length>20};
  }
  @Get('orders/:number') async order(@Req() req:Request,@Param('number') number:string){
    const {id}=await this.current(req);
    const order=/^\d{6}$/.test(number)&&(await this.db.pool.query('SELECT id FROM orders WHERE number=$1 AND customer_id=$2 AND deleted_at IS NULL',[number,id])).rows[0];
    if(!order)throw new HttpException('سفارش یافت نشد.',404);
    return this.receipts.confirmation(order.id,id);
  }
  @Get('receipts') async history(@Req() req:Request,@Query() query:unknown){
    const {id}=await this.current(req),{page}=parse(paging,query);
    const result=await this.db.pool.query('SELECT '+receiptFields+',o.number::text AS "orderNumber" FROM receipt_reviews r JOIN orders o ON o.id=r.order_id WHERE o.customer_id=$1 AND o.deleted_at IS NULL ORDER BY r.uploaded_at DESC,r.id LIMIT 21 OFFSET $2',[id,(page-1)*20]);
    return {items:result.rows.slice(0,20),hasNext:result.rows.length>20};
  }
  @Post('logout') async logout(@Req()req:Request,@Res({passthrough:true})res:Response){if(typeof req.cookies?.poostikal_customer==='string')await this.db.pool.query('DELETE FROM customer_sessions WHERE token_hash=$1',[digest(req.cookies.poostikal_customer)]);res.clearCookie('poostikal_customer',{path:'/'});res.clearCookie('poostikal_customer',{path:'/api'});return {ok:true};}
}
