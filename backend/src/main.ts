import { SupportController } from './support.js';
import { CustomerHistoryController } from './customer-history.js';
import { StockEvents, StockEventsController } from './stock-events.js';
import { BasketController } from './baskets.js';
import {AnalysisController,AnalysisUploadGuard} from './analysis.js';
import {RouteAccessGuard} from './route-access.js';
import 'reflect-metadata';
import {SiteSettingsController,SiteSettingsService} from './site-settings.js';
import {IntegrationController,IntegrationSettings} from './integration-settings.js';
import { Module, Catch, ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction, json } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { Database } from './database.js';
import { AdminGuard, UploadGuard, hashPassword, RateLimiter, requireSameOrigin } from './security.js';
import { CatalogService } from './catalog.js';
import { PublicController, AdminController, AIController } from './controllers.js';
import { AnimationController, AnimationService } from './animations.js';
import { RabotebController, RabotebService } from './raboteb.js';
import { ReceiptController, ReceiptService, ReceiptBuyerGuard } from './payment-receipts.js';
import { CustomerController } from './customers.js';
import { OrderController, OrderService } from './orders.js';
import { AdminAccounts, AdminAccountsController, adminPasswordMinLength } from './admin-accounts.js';
import { TrashController, TrashService } from './trash.js';
import { ThemeController, ThemeService } from './theme.js';
@Module({controllers:[BasketController,StockEventsController,CustomerHistoryController,SupportController,AnalysisController,ReceiptController,SiteSettingsController,IntegrationController,PublicController,AdminController,AIController,CustomerController,AnimationController,RabotebController,OrderController,AdminAccountsController,TrashController,ThemeController],providers:[{provide:APP_GUARD,useClass:RouteAccessGuard},StockEvents,AnalysisUploadGuard,ReceiptService,ReceiptBuyerGuard,SiteSettingsService,IntegrationSettings,Database,AdminGuard,UploadGuard,RateLimiter,CatalogService,AnimationService,RabotebService,OrderService,AdminAccounts,TrashService,ThemeService]}) class AppModule {}
@Catch() class Errors implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const response=host.switchToHttp().getResponse<Response>();
    if(error instanceof HttpException) {const value=error.getResponse();response.status(error.getStatus()).json(typeof value==='object'?value:{message:value});return;}
    const code=(error as {code?:string}).code;
    if(code==='23505') {response.status(409).json({message:'نام، نامک یا کد کالا تکراری است.'});return;}
    if((code==='23503'||code==='23001')) {response.status(409).json({message:'این رکورد به محصول یا دسته‌بندی دیگری وابسته است.'});return;}
    if(code==='22P02'||code==='23514') {response.status(400).json({message:'اطلاعات معتبر نیست.'});return;}
    console.error('Request failed:', error instanceof Error ? error.name : 'unknown',code??'', error instanceof Error && /timeout|timed out/i.test(error.message) ? 'database timeout' : '');
    response.status(500).json({message:'ذخیره یا دریافت اطلاعات انجام نشد؛ دوباره امتحان کن.'});
  }
}
async function main() {
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if(process.env.NODE_ENV==='production'){
    if(process.env.TRUST_PROXY?.split(',').some(v=>['true','0.0.0.0/0','::/0','*'].includes(v.trim())))throw new Error('TRUST_PROXY must identify trusted proxy addresses');
    const origin=new URL(process.env.APP_ORIGIN||'');
    if(origin.protocol!=='https:'||origin.origin!==process.env.APP_ORIGIN)throw new Error('Production APP_ORIGIN must be a canonical HTTPS origin');
  }
  const app=await NestFactory.create(AppModule,{bodyParser:false});
  app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'}}));
  if(process.env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy',process.env.TRUST_PROXY);
  app.use(['/api/admin','/api/customer','/api/auth','/api/orders','/api/order-payment','/api/chat','/api/support'],(_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','private, no-store');next();});
  app.use((req:Request,res:Response,next:NextFunction)=>{try{if(!['GET','HEAD','OPTIONS'].includes(req.method))requireSameOrigin(req);next();}catch{res.status(403).json({message:'مبدأ درخواست مجاز نیست.'});}});
  app.use(json({limit:'1mb'}));app.use(cookieParser());
  app.useGlobalFilters(new Errors());app.enableShutdownHooks();await app.init();
  const db=app.get(Database);
  await db.transaction(async client => {
    // Multiple API workers may start against a newly provisioned database.
    await client.query('SELECT pg_advisory_xact_lock(834630)');
    if ((await client.query('SELECT 1 FROM admins LIMIT 1')).rowCount) return;
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < adminPasswordMinLength) {
      throw new Error(`Set ADMIN_PASSWORD to at least ${adminPasswordMinLength} characters`);
    }
    await client.query("INSERT INTO admins(id,email,password_hash,name,role) VALUES($1,$2,$3,'سازنده سایت','owner')",
      [randomUUID(), (process.env.ADMIN_EMAIL || 'admin@poostikal.local').toLowerCase(), await hashPassword(password)]);
  });
  const purgeReceipts=()=>db.pool.query('DELETE FROM payment_receipts WHERE expires_at<=now()');
  await purgeReceipts();
  const receiptCleanup=setInterval(()=>{void purgeReceipts().catch(()=>console.error('Expired receipt cleanup failed'));},60000);receiptCleanup.unref();
  const cleanup=setInterval(()=>{
    void Promise.all([
      db.pool.query('DELETE FROM sessions WHERE expires_at<now()'),
      db.pool.query('DELETE FROM customer_sessions WHERE expires_at<now()'),
      db.pool.query('DELETE FROM otp_challenges WHERE expires_at<now()'),
      db.pool.query('DELETE FROM rate_limits WHERE reset_at<now()'),
      db.pool.query(`WITH expired AS (
        SELECT customer_id FROM customer_baskets
        WHERE expires_at<=now() ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
      ) UPDATE customer_baskets b SET lines='[]',expires_at=NULL,revision=gen_random_uuid()
        FROM expired WHERE b.customer_id=expired.customer_id`),
    ]).catch(()=>console.error('Expired session cleanup failed'));
  },3600000);cleanup.unref();
  const server=app.getHttpServer();
  server.keepAliveTimeout=65000;
  server.headersTimeout=66000;
  await app.listen(Number(process.env.PORT||4000),process.env.HOST||'127.0.0.1');
}
main().catch(error=>{console.error('API startup failed:',error.message);process.exit(1);});


