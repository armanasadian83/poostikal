import { BadRequestException, Body, Controller, Get, Injectable, OnApplicationBootstrap, OnModuleDestroy, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors, ConflictException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {supplierRemote,SupplierRequestError,type SupplierRetry} from './supplier-http.js';
import type { Pool, PoolClient } from 'pg';
import type { ProductDocument } from './validation.js';
import { Database } from './database.js';
import { AdminGuard, AdminRequest, UploadGuard } from './security.js';
import { currentPrice, fromWoo, readCsv, slug, SourceProduct, sourceCurrency, pricesInToman } from './raboteb-mapping.js';
import { applySupplierInventory } from './supplier-inventory.js';
import { canStoreSupplierCredentials, openSupplierCredentials, sealSupplierCredentials, type SupplierCredentials } from './supplier-credentials.js';
import { z } from 'zod';
import { parse } from './validation.js';

export function sourceUrl(raw:string) {
  const url=new URL(raw);if(!['https:','http:'].includes(url.protocol)||!['raboteb.com','www.raboteb.com'].includes(url.hostname)||url.username||url.password||url.port)throw new Error('نشانی تصویر خارج از رابوطب است.');
  url.protocol='https:';url.hash='';if(!url.pathname.startsWith('/wp-content/uploads/'))throw new Error('مسیر تصویر مبدأ مجاز نیست.');return url;
}

const inventoryIntervalMinutes = 15;
const discoveryIntervalHours = 24;

async function syncSchedule(db: Pool | PoolClient) {
  const {rows: [schedule]} = await db.query(`
    SELECT
      (SELECT finished_at FROM supplier_jobs WHERE kind='sync' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1) AS last_sync,
      EXISTS (SELECT 1 FROM supplier_products) AS has_products,
      (SELECT finished_at + CASE WHEN status='failed' THEN interval '1 hour' ELSE $1 * interval '1 hour' END
       FROM supplier_jobs WHERE discover_products AND finished_at IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1) AS next_discovery
  `, [discoveryIntervalHours]);
  const nextInventory = schedule.has_products && schedule.last_sync
    ? schedule.last_sync.getTime() + inventoryIntervalMinutes * 60_000 : null;
  return {nextInventory, nextDiscovery: schedule.next_discovery?.getTime() ?? Date.now()};
}

@Injectable()
export class RabotebService implements OnApplicationBootstrap,OnModuleDestroy {
  private timer?:NodeJS.Timeout;private working=false;private stopping=false;private jobId?:string;
  constructor(private readonly db:Database) {}
  private async progress(value:Record<string,unknown>){if(this.jobId)await this.db.pool.query('UPDATE supplier_jobs SET progress=progress || $2::jsonb,updated_at=now() WHERE id=$1',[this.jobId,JSON.stringify(value)]);}
  private retry=(retry:SupplierRetry|null)=>this.progress({retry});
  private async connection(){return (await this.db.pool.query("SELECT document FROM settings WHERE id='raboteb-connection'")).rows[0]?.document;}
  private async credentials():Promise<SupplierCredentials|null>{
    const saved=await this.connection();
    if(saved?.credentials)return openSupplierCredentials(saved.credentials);
    return process.env.RABOTEB_CONSUMER_KEY&&process.env.RABOTEB_CONSUMER_SECRET?{consumerKey:process.env.RABOTEB_CONSUMER_KEY,consumerSecret:process.env.RABOTEB_CONSUMER_SECRET}:null;
  }
  async configured(){return !!await this.credentials();}
  private async enabled(){return (await this.connection())?.enabled!==false;}
  async onApplicationBootstrap(){this.timer=setInterval(()=>{void this.tick().catch(()=>console.error('Supplier worker failed.'));},10000);this.timer.unref();void this.tick().catch(()=>console.error('Supplier worker startup failed.'));}
  onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);}
  async status(){
    const jobs=await this.db.pool.query('SELECT id,kind,discover_products,status,total,processed,imported,errors,progress,updated_at,created_at,finished_at FROM supplier_jobs ORDER BY created_at DESC LIMIT 12');
    const count=await this.db.pool.query('SELECT count(*)::int count,max(checked_at) checked_at FROM supplier_products');
    const lastSuccess=(await this.db.pool.query("SELECT max(finished_at) finished_at FROM supplier_jobs WHERE kind='sync' AND status='complete'")).rows[0].finished_at;
    const {nextInventory, nextDiscovery} = await syncSchedule(this.db.pool);
    const connection=await this.connection();let configured=false,configurationError='';
    try{configured=await this.configured();}catch{configurationError='اتصال ذخیره‌شده قابل خواندن نیست؛ تنظیمات سرور را بررسی کن.';}
    const scheduled = configured && connection?.enabled !== false;
    const active = jobs.rows.some(job => ['queued','running'].includes(job.status));
    return {configured,lastSuccessfulSync:lastSuccess,connectionMode:process.env.RABOTEB_PROXY_URL?'proxy':'direct',
      nextAutomaticCheck:scheduled && !active ? new Date(Math.min(nextInventory ?? nextDiscovery, nextDiscovery)).toISOString() : null,
      nextDiscoveryCheck:scheduled && !jobs.rows.some(job=>job.discover_products && ['queued','running'].includes(job.status)) ? new Date(nextDiscovery).toISOString() : null,
      enabled:connection?.enabled!==false,credentialStorageReady:canStoreSupplierCredentials(),configurationError,currency:connection?.currency??null,verifiedAt:connection?.verifiedAt??null,intervalMinutes:inventoryIntervalMinutes,discoveryIntervalHours,source:'https://raboteb.com',linkedProducts:count.rows[0].count,lastProductCheck:count.rows[0].checked_at,jobs:jobs.rows};
  }
  async saveConnection(body:unknown,admin:string){
    const credentials=parse(z.object({consumerKey:z.string().trim().regex(/^ck_[a-f0-9]{40}$/),consumerSecret:z.string().trim().regex(/^cs_[a-f0-9]{40}$/)}).strict(),body);
    if(!canStoreSupplierCredentials())throw new BadRequestException('کلید رمزگذاری اتصال روی سرور تنظیم نشده است.');
    let currency:'IRT'|'IRR';
    try{
      const [settings]=await Promise.all([this.woo('settings/general?',credentials),this.woo('products?per_page=1',credentials)]);
      currency=sourceCurrency(settings.find(setting=>setting.id==='woocommerce_currency')?.value);
    }catch{throw new BadRequestException('آزمایش اتصال انجام نشد. کلید فقط‌خواندنی، دسترسی محصولات و تنظیمات، واحد پول تومان یا ریال و ارتباط سرور را بررسی کن. اتصال قبلی تغییر نکرد.');}
    await this.db.transaction(async c=>{
      if((await c.query("SELECT 1 FROM supplier_jobs WHERE status IN ('queued','running')")).rowCount)throw new ConflictException('بعد از پایان عملیات فعلی، اتصال را تغییر بده.');
      await c.query("INSERT INTO settings(id,document) VALUES('raboteb-connection',$1) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document",[{credentials:sealSupplierCredentials(credentials),enabled:true,currency,verifiedAt:new Date().toISOString()}]);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[admin,'supplier.connection.saved','raboteb']);
    });
    // The timer starts the first sync; saving does not depend on a browser session.
    void this.tick().catch(()=>console.error('Supplier worker failed.'));
    return this.status();
  }
  async setEnabled(body:unknown,admin:string){
    const {enabled}=parse(z.object({enabled:z.boolean()}).strict(),body);
    if(enabled&&!await this.configured())throw new BadRequestException('ابتدا اتصال را ثبت کن.');
    await this.db.transaction(async c=>{
      await c.query("INSERT INTO settings(id,document) VALUES('raboteb-connection',$1) ON CONFLICT(id) DO UPDATE SET document=settings.document || EXCLUDED.document",[{enabled}]);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[admin,enabled?'supplier.sync.enabled':'supplier.sync.paused','raboteb']);
    });
    return this.status();
  }
  async enqueue(kind:'csv'|'sync',admin:string|null,payload:SourceProduct[]=[]) {
    if(kind==='sync'&&(!await this.configured()||!await this.enabled()))throw new BadRequestException('ابتدا اتصال خودکار رابوطب را فعال کن.');
    const id=randomUUID();
    try{await this.db.pool.query('INSERT INTO supplier_jobs(id,kind,status,admin_id,payload,total,discover_products) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,kind,'queued',admin,JSON.stringify(payload),payload.length,kind==='sync']);}
    catch(e){if((e as {code?:string}).code==='23505')throw new ConflictException('یک عملیات هنوز در حال اجراست.');throw e;}
    void this.tick().catch(()=>console.error('Supplier worker failed.'));return {id,total:payload.length};
  }
  async csv(file:{buffer:Buffer},admin:string){if(!file?.buffer)throw new BadRequestException('فایل CSV را انتخاب کن.');let products:SourceProduct[];try{products=readCsv(file.buffer);}catch(e){throw new BadRequestException((e as Error).message);}return this.enqueue('csv',admin,products.filter(p=>p.published&&p.inStock));}
  private async woo(path:string,provided?:SupplierCredentials){
    if(!/^(?:products(?:\/\d+\/variations)?|settings\/general)\?/.test(path))throw new Error('مسیر مبدأ معتبر نیست.');
    const credentials=provided??await this.credentials();if(!credentials)throw new Error('اتصال مبدأ تنظیم نشده است.');
    const auth=Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');
    const result=await supplierRemote(new URL(`https://raboteb.com/wp-json/wc/v3/${path}`),{headers:{Authorization:`Basic ${auth}`,Accept:'application/json'},limit:25*1024*1024,onRetry:provided?undefined:this.retry});
    let data:unknown;try{data=JSON.parse(result.buffer.toString('utf8'));}catch{throw new SupplierRequestError('پاسخ مبدأ JSON معتبر نیست؛ محدودیت‌های امنیتی یا خطای سرویس رابوطب را بررسی کن.','INVALID_RESPONSE',false);}if(!Array.isArray(data))throw new SupplierRequestError('فهرست محصولات رابوطب معتبر نیست.','INVALID_RESPONSE',false);return data;
  }
  private async all(path:string){const all:Record<string,any>[]=[];for(let page=1;page<=200;page++){if(path==='products')await this.progress({stage:'catalog',message:`در حال دریافت صفحه ${page} فهرست محصولات`,page,received:all.length,retry:null});const rows=await this.woo(`${path}?per_page=100&page=${page}&orderby=id&order=asc`);all.push(...rows);if(rows.length<100)return all;}throw new Error('تعداد صفحات مبدأ از حد مجاز بیشتر است.');}
  private async linkedCatalog(ids: string[]) {
    const products: Record<string,any>[] = [];
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      await this.progress({stage:'catalog', message:'دریافت محصولات متصل از رابوطب', received:start, expected:ids.length, retry:null});
      const rows = await this.woo(`products?per_page=100&include=${batch.join(',')}&orderby=id&order=asc`);
      if (rows.some(product => !batch.includes(String(product.id)))) throw new Error('فهرست دریافتی با شناسه‌های درخواستی یکسان نیست.');
      products.push(...rows);
    }
    return products;
  }
  async tick(){
    if(this.working||this.stopping)return;this.working=true;
    let lock:PoolClient|undefined;let locked=false;
    try{
      lock=await this.db.pool.connect();
      locked=(await lock.query('SELECT pg_try_advisory_lock(834628) locked')).rows[0].locked;if(!locked)return;
      let job=(await lock.query("SELECT * FROM supplier_jobs WHERE status IN ('queued','running') ORDER BY created_at LIMIT 1")).rows[0];
      if(!job&&await this.enabled()&&await this.configured()){
        const {nextInventory, nextDiscovery} = await syncSchedule(lock);
        const now = Date.now();
        const discover = nextDiscovery <= now;
        if (discover || (nextInventory !== null && nextInventory <= now)) {
          job = (await lock.query(
            "INSERT INTO supplier_jobs(id,kind,status,discover_products) VALUES($1,'sync','queued',$2) ON CONFLICT DO NOTHING RETURNING *",
            [randomUUID(), discover]
          )).rows[0];
        }
      }
      if(!job)return;
      this.jobId=job.id;
      await lock.query("UPDATE supplier_jobs SET status='running',updated_at=now() WHERE id=$1",[job.id]);
      await this.progress({stage:'starting',message:'آماده‌سازی همگام‌سازی',retry:null});
      try{
        let payload=job.payload as SourceProduct[];
        if(job.kind==='sync'&&!payload.length){
          await this.progress({stage:'currency',message:'بررسی اتصال و واحد پول مبدأ',retry:null});
          const currency=sourceCurrency((await this.woo('settings/general?')).find(setting=>setting.id==='woocommerce_currency')?.value);
          const linked = new Set<string>((await lock.query('SELECT source_id::text FROM supplier_products ORDER BY source_id')).rows.map(r => r.source_id));
          const rows = job.discover_products ? await this.all('products') : await this.linkedCatalog([...linked]);
          if(linked.size&&!rows.length)throw new Error('فهرست مبدأ خالی دریافت شد؛ برای جلوگیری از تغییر اشتباه، موجودی قبلی حفظ شد.');
          if(rows.some(p=>!Number.isSafeInteger(p.id)||p.id<=0)||new Set(rows.map(p=>p.id)).size!==rows.length)throw new Error('فهرست مبدأ ناقص یا تکراری است؛ دوباره تلاش کن.');
          payload=[];
          const excluded = job.discover_products
            ? new Set<string>((await lock.query('SELECT source_id::text FROM supplier_exclusions')).rows.map(r => r.source_id))
            : new Set<string>();
          const relevant = rows.filter(p => !excluded.has(String(p.id)) &&
            (linked.has(String(p.id)) || (job.discover_products && p.status === 'publish' && p.stock_status === 'instock')));
          // Bound supplier traffic while avoiding a serial request per variable
          // product. Finish the complete read before changing any local stock.
          for(let index=0;index<relevant.length;index+=3){
            if(this.stopping)return;
            await this.progress({stage:'variants',message:'بررسی قیمت، موجودی و تنوع‌های محصولات',received:index,expected:relevant.length,retry:null});
            const batch=await Promise.all(relevant.slice(index,index+3).map(async p=>{
              const variants=p.type==='variable'?await this.all(`products/${p.id}/variations`):[];
              return pricesInToman(fromWoo(p,variants),currency);
            }));
            payload.push(...batch);
          }
          // A complete remote inventory is required before handling products removed at source.
          const seen = new Set(rows.map(p => String(p.id)));
          const missingIds = [...linked].filter(id => !seen.has(id));
          if (missingIds.length) {
            const missing = await lock.query('SELECT snapshot FROM supplier_products WHERE source_id = ANY($1::bigint[])', [missingIds]);
            for (const {snapshot} of missing.rows) {
              payload.push({...snapshot, published:false, inStock:false, stock:0, variants:snapshot.variants.map((v:SourceProduct)=>({...v,inStock:false,stock:0}))});
            }
          }
          await lock.query('UPDATE supplier_jobs SET payload=$2,total=$3 WHERE id=$1',[job.id,JSON.stringify(payload),payload.length]);
        }
        await this.progress({stage:'applying',message:'ثبت قیمت و موجودی در پوستیکال',received:payload.length,expected:payload.length,retry:null});
        let processed=job.processed,imported=job.imported;const errors: {sourceId:number;name:string;message:string;code?:string;retryable?:boolean;attempts?:number}[]=job.errors;
        // Checkpoint whole bounded batches. A restarted worker may replay the last
        // batch safely because source IDs and cached media make imports idempotent.
        while(processed<payload.length){
          if(this.stopping)return;
          const batch=payload.slice(processed,processed+3);
          const results=await Promise.allSettled(batch.map(p=>this.importProduct(p,job.admin_id,job.kind==='sync')));
          results.forEach((result,i)=>{if(result.status==='fulfilled')imported++;else errors.push({sourceId:batch[i].id,name:batch[i].name,message:result.reason instanceof Error?result.reason.message.slice(0,300):'ثبت محصول انجام نشد.',...(result.reason instanceof SupplierRequestError?{code:result.reason.code,retryable:result.reason.retryable,attempts:result.reason.attempts}:{})});});
          processed+=batch.length;await lock.query('UPDATE supplier_jobs SET processed=$2,imported=$3,errors=$4,updated_at=now() WHERE id=$1',[job.id,processed,imported,JSON.stringify(errors)]);
        }
        await this.progress({stage:'finished',message:errors.length?'عملیات با چند مورد نیازمند بررسی پایان یافت.':'همه محصولات با موفقیت به‌روز شدند.',retry:null});
        await lock.query('UPDATE supplier_jobs SET status=$2,finished_at=now(),updated_at=now(),payload=$3 WHERE id=$1',[job.id,errors.length?'partial':'complete','[]']);
      }catch(e){await lock.query("UPDATE supplier_jobs SET status='failed',finished_at=now(),updated_at=now(),progress=progress || '{\"retry\":null}'::jsonb,errors=$2 WHERE id=$1",[job.id,JSON.stringify([{message:e instanceof Error?e.message.slice(0,300):'ارتباط با مبدأ انجام نشد.',...(e instanceof SupplierRequestError?{code:e.code,retryable:e.retryable,attempts:e.attempts}:{})}])]);}
    }finally{try{if(locked&&lock)await lock.query('SELECT pg_advisory_unlock(834628)');}finally{lock?.release();this.jobId=undefined;this.working=false;}}
  }
  private async image(src:string,admin:string|null){
    const url=sourceUrl(src);const existing=await this.db.pool.query('SELECT m.filename FROM supplier_media s JOIN media m ON m.id=s.media_id WHERE s.source_url=$1',[url.href]);if(existing.rowCount)return `/api/media/${existing.rows[0].filename}`;
    const {buffer}=await supplierRemote(url,{onRetry:this.retry});const data=await sharp(buffer,{limitInputPixels:40_000_000}).rotate().resize(2400,2400,{fit:'inside',withoutEnlargement:true}).webp({quality:92,effort:5}).toBuffer();
    const hash=createHash('sha256').update(data).digest('hex');
    const same=(await this.db.pool.query('SELECT id,filename FROM media WHERE sha256=$1 LIMIT 1',[hash])).rows[0];
    const id=same?.id??randomUUID(),filename=same?.filename??`${id}.webp`,dir=resolve(process.env.MEDIA_DIR||'../.data/media');
    if(!same){await mkdir(dir,{recursive:true});await writeFile(resolve(dir,filename),data,{flag:'wx'});}
    try{await this.db.transaction(async c=>{if(!same)await c.query('INSERT INTO media(id,filename,mime,bytes,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,filename,'image/webp',data.length,hash,admin]);await c.query('INSERT INTO supplier_media(source_url,media_id) VALUES($1,$2) ON CONFLICT(source_url) DO NOTHING',[url.href,id]);});}
    catch(e){if(!same)await unlink(resolve(dir,filename)).catch(()=>{});throw e;}return `/api/media/${filename}`;
  }
  private async taxonomy(kind:'brands'|'categories',name:string,parentId:string|null=null){
    return this.db.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(834623)');const existing=(await c.query(`SELECT id FROM ${kind} WHERE lower(name)=lower($1)`,[name])).rows[0];if(existing)return existing.id as string;
      const id=`rb-${kind}-${createHash('sha256').update(name).digest('hex').slice(0,16)}`;let key=slug(name)||id;
      if((await c.query(`SELECT 1 FROM ${kind} WHERE slug=$1`,[key])).rowCount)key=`${key}-${id.slice(-6)}`;
      const doc={id,name,slug:key,description:'',...(kind==='categories'?{parentId}: {})};
      if(kind==='categories')await c.query('INSERT INTO categories(id,name,slug,parent_id,document) VALUES($1,$2,$3,$4,$5)',[id,name,key,parentId,doc]);else await c.query('INSERT INTO brands(id,name,slug,document) VALUES($1,$2,$3,$4)',[id,name,key,doc]);return id;});
  }
  private async importProduct(p:SourceProduct,admin:string|null,onlyCommercial:boolean){
    if(!Number.isSafeInteger(p.id)||p.id<=0||!p.name)throw new Error('نام یا شناسه محصول مبدأ ناقص است.');
    if(!['simple','variable'].includes(p.type))throw new Error('نوع محصول مبدأ پشتیبانی نمی‌شود.');
    if((await this.db.pool.query('SELECT 1 FROM supplier_exclusions WHERE source_id=$1',[p.id])).rowCount)return;
    const id=`raboteb-${p.id}`;
    const previous=(await this.db.pool.query('SELECT p.document FROM products p JOIN supplier_products s ON s.product_id=p.id WHERE s.source_id=$1',[p.id])).rows[0]?.document;
    let content=previous;
    if(!onlyCommercial||!previous){
      const brand=p.brands[0]||'';const brandId=brand?await this.taxonomy('brands',brand):'';
      const categoryIds:string[]=[];for(const path of p.categories){let parent:string|null=null;for(const name of path.split('>').map(s=>s.trim()).filter(Boolean)){parent=await this.taxonomy('categories',name,parent);if(!categoryIds.includes(parent))categoryIds.push(parent);}}
      const sources=[...p.images];for(const v of p.variants)for(const im of v.images)if(!sources.some(i=>i.src===im.src))sources.push(im);
      if(!sources.length)throw new Error('محصول مبدأ تصویر ندارد.');if(sources.length>100)throw new Error('بیش از ۱۰۰ تصویر برای یک محصول.');
      const images=[];for(const [i,im] of sources.entries()){const url=await this.image(im.src,admin);images.push({id:`${id}-image-${i}`,url,alt:im.alt||p.name,description:im.description||'',fileName:new URL(im.src).pathname.split('/').pop()});}
      const nameSlug=p.slug||slug(p.name)||id;
      const collision=(await this.db.pool.query('SELECT id FROM products WHERE slug=$1 AND id<>$2',[nameSlug,id])).rowCount;
      content={id,slug:collision?`${nameSlug}-${p.id}`:nameSlug,name:p.name,sku:p.sku,brand,brandId,category:categoryIds[0]||'',categoryIds,image:images[0].url,images,description:p.description,shortDescription:p.shortDescription,attributes:p.attributes.map((a,i)=>({id:`${id}-attr-${i}`,...a})),mediaType:'photo',animation:{template:'dropper-box',references:['closed','open','product','angle'].map(slot=>({slot,image:null})),dimensions:{},reviewConfirmed:false}};
    }
    const variants:ProductDocument['variants']=[];for(const v of p.variants){const price=currentPrice(v);const im=v.images[0];variants.push({id:`raboteb-${v.id}`,label:v.attributes.map(a=>a.value).join(' / ')||v.name||'بسته‌بندی اصلی',sku:v.sku||undefined,regularPriceToman:price.regular,discountPriceToman:price.discount,priceToman:price.price,originalPriceToman:price.discount===undefined?undefined:price.regular,stock:v.inStock?v.stock:0,stockFromParent:v.stockFromParent,description:v.description,attributes:v.attributes.map((a,i)=>({id:`rb-${v.id}-${i}`,...a})),...(im?{image:await this.image(im.src,admin)}:{})});}
    const eligible=variants.filter(v=>v.stock!==0&&v.priceToman>0);const selected=(eligible.length?eligible:variants).reduce<typeof variants[number]|undefined>((a,v)=>!a||v.priceToman<a.priceToman?v:a,undefined);
    const price=currentPrice(p);const stock=p.inStock?(p.stock!==null?p.stock:variants.length&&variants.every(v=>v.stock!==null)?variants.reduce((n,v)=>n+(v.stock??0),0):null):0;
    const commerce={regularPriceToman:selected?.regularPriceToman??price.regular,discountPriceToman:selected?selected.discountPriceToman:price.discount,priceToman:selected?.priceToman??price.price,stock,status:!p.published||!p.inStock?'out-of-stock':'active',variants};
    await this.db.transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      if((await c.query('SELECT 1 FROM supplier_exclusions WHERE source_id=$1',[p.id])).rowCount)return;
      const current=(await c.query('SELECT document,version FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
      const document={...(onlyCommercial&&current?current.document:content),audio:current?.document.audio??null,...commerce,supplier:{name:'raboteb',sourceId:p.id,url:p.permalink,checkedAt:new Date().toISOString()},version:(current?.version??0)+1};
      await applySupplierInventory(c,document,p);
      await c.query(`INSERT INTO products(id,slug,name,brand_id,status,price,stock,document,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,brand_id=EXCLUDED.brand_id,status=EXCLUDED.status,price=EXCLUDED.price,stock=EXCLUDED.stock,document=EXCLUDED.document,version=EXCLUDED.version,updated_at=now()`,[id,document.slug,document.name,document.brandId||null,document.status,document.priceToman,document.stock,document,document.version]);
      await c.query('DELETE FROM product_categories WHERE product_id=$1',[id]);for(const cat of document.categoryIds)await c.query('INSERT INTO product_categories VALUES($1,$2)',[id,cat]);
      await c.query('DELETE FROM variants WHERE product_id=$1',[id]);for(const v of document.variants)await c.query('INSERT INTO variants(id,product_id,sku,price,stock,document) VALUES($1,$2,$3,$4,$5,$6)',[v.id,id,v.sku||null,v.priceToman,v.stock,v]);
      await c.query('INSERT INTO supplier_products(source_id,product_id,snapshot) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,checked_at=now()',[p.id,id,p]);
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[admin,onlyCommercial?'raboteb.sync':'raboteb.import',id]);
    });
  }
}

@Controller('api/admin/raboteb') @UseGuards(AdminGuard)
export class RabotebController {
  constructor(private readonly service:RabotebService){}
  @Get() status(){return this.service.status();}
  @Post('import') @UseGuards(UploadGuard) @UseInterceptors(FileInterceptor('file',{limits:{fileSize:30*1024*1024,files:1,fields:0}}))
  csv(@UploadedFile() file:{buffer:Buffer},@Req() req:AdminRequest){return this.service.csv(file,req.adminId);}
  @Post('sync') sync(@Req() req:AdminRequest){return this.service.enqueue('sync',req.adminId);}
  @Put('connection') connection(@Body() body:unknown,@Req() req:AdminRequest){return this.service.saveConnection(body,req.adminId);}
  @Put('enabled') enabled(@Body() body:unknown,@Req() req:AdminRequest){return this.service.setEnabled(body,req.adminId);}
}
