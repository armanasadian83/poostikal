import {buyerSession} from './customer-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { Database } from '../dist/database.js';
import { RabotebService, sourceUrl } from '../dist/raboteb.js';
import {SupplierRequestError} from '../dist/supplier-http.js';
import { storefrontRichText } from '@poostikal/rich-text';
import { CatalogService } from '../dist/catalog.js';
import { OrderService } from '../dist/orders.js';
import { readCsv, fromWoo, currentPrice, descriptionHtml, sourceCurrency, pricesInToman } from '../dist/raboteb-mapping.js';
import {sealSupplierCredentials,openSupplierCredentials} from '../dist/supplier-credentials.js';

test('supplier credentials are authenticated encrypted data, never plaintext',()=>{
  const original=process.env.SUPPLIER_ENCRYPTION_KEY;process.env.SUPPLIER_ENCRYPTION_KEY='a'.repeat(64);
  try{
    const input={consumerKey:'ck_'+'1'.repeat(40),consumerSecret:'cs_'+'2'.repeat(40)};
    const sealed=sealSupplierCredentials(input);assert.deepEqual(openSupplierCredentials(sealed),input);
    assert.doesNotMatch(JSON.stringify(sealed),/ck_|cs_/);
    assert.notEqual(sealSupplierCredentials(input).data,sealed.data);
    assert.throws(()=>openSupplierCredentials({...sealed,tag:Buffer.alloc(16).toString('base64')}));
    process.env.SUPPLIER_ENCRYPTION_KEY='b'.repeat(64);assert.throws(()=>openSupplierCredentials(sealed));
  }finally{if(original===undefined)delete process.env.SUPPLIER_ENCRYPTION_KEY;else process.env.SUPPLIER_ENCRYPTION_KEY=original;}
});

test('supplier sync validates source data and converts rials without changing quantities',()=>{
  const remote={id:20,name:'Remote',type:'simple',status:'publish',stock_status:'instock',manage_stock:true,stock_quantity:8,regular_price:'1200000',sale_price:'1000000'};
  const source=fromWoo(remote);assert.equal(pricesInToman(source,sourceCurrency('IRR')).regular,120000);
  assert.equal(pricesInToman(source,'IRR').sale,100000);assert.equal(pricesInToman(source,'IRR').stock,8);
  assert.equal(pricesInToman(source,'IRT').regular,1200000);
  assert.equal(currentPrice(pricesInToman(fromWoo({...remote,price:'1200000'}),'IRR')).price,120000,
    'Use the price WooCommerce is currently charging, even if sale metadata differs');
  assert.equal(currentPrice(fromWoo({...remote,price:''})).price,0);
  assert.throws(()=>sourceCurrency('USD'));assert.throws(()=>pricesInToman({...source,regular:11},'IRR'));
  assert.throws(()=>fromWoo({...remote,manage_stock:undefined}));assert.throws(()=>fromWoo({...remote,stock_status:undefined}));
  // WooCommerce can retain an old quantity after stock tracking is disabled.
  for(const stock_status of ['instock','outofstock']){
    const availabilityOnly=fromWoo({...remote,manage_stock:false,stock_status,stock_quantity:43});
    assert.equal(availabilityOnly.stock,null);
    assert.equal(availabilityOnly.inStock,stock_status==='instock');
  }
});

const csv=(rows)=>Buffer.from(rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'));
test('supplier CSV preserves quantities, variants, HTML, brands and sale dates',()=>{
  const data=readCsv(csv([
    ['ID','Type','SKU','Name','Published','In stock?','Stock','Regular price','Sale price','Parent','Brands','Attribute 1 name','Attribute 1 value(s)','Description','Images'],
    [10,'variable','parent','Test',1,1,12,'','','','','برند','نمونه','<h2>Details</h2><script>bad()</script>','https://raboteb.com/wp-content/uploads/p.jpg'],
    [11,'variation','v1','Test small',1,1,'parent',1000,900,'id:10','','Size','Small','',''],
    [12,'variation','v2','Test large',1,0,0,2000,'','parent','','Size','Large','',''],
    [13,'simple','','Untracked',1,1,'',3000,'','','','','','',''],
  ]));
  assert.equal(data.length,2);assert.equal(data[0].variants.length,2);
  assert.equal(data[0].variants[0].stock,12);assert.equal(data[0].variants[0].stockFromParent,true);
  assert.equal(data[0].variants[1].stock,0);assert.equal(data[1].stock,null);
  assert.deepEqual(data[0].brands,['نمونه']);assert.equal(data[0].description,'<h2>Details</h2>');
  const p={...data[0].variants[0],saleFrom:'2026-11-10T00:00:00Z',saleTo:'2026-11-11T23:59:59Z'};
  assert.equal(currentPrice(p,Date.parse('2026-11-09T00:00:00Z')).price,1000);
  assert.equal(currentPrice(p,Date.parse('2026-11-10T12:00:00Z')).price,900);
  assert.equal(currentPrice(p,Date.parse('2026-11-12T00:00:00Z')).price,1000);
  const remote=fromWoo({id:20,name:'Remote',type:'variable',status:'publish',stock_status:'instock',manage_stock:true,stock_quantity:8},[{id:21,status:'publish',stock_status:'instock',manage_stock:'parent',regular_price:'20000.00'}]);
  assert.equal(remote.variants[0].stock,8);assert.equal(remote.variants[0].regular,20000);
  assert.throws(()=>readCsv(csv([['ID','Regular price'],[1,'oops']])));
});
test('WordPress descriptions become clean readable HTML',()=>{
  const value=descriptionHtml('<h4>Title</h4>[caption id="1"]Caption[/caption]<table><tr><th>Size</th><td>30ml</td></tr></table>[video mp4="https://raboteb.com/wp-content/uploads/demo.mp4"][/video]');
  assert.doesNotMatch(value,/\[caption|\[video|<table|<h4/);assert.match(value,/<h3>Title<\/h3>/);assert.match(value,/Size · 30ml/);assert.match(value,/demo.mp4/);
});
test('supplier downloads are restricted to the source media host and path',()=>{
  assert.equal(sourceUrl('http://raboteb.com/wp-content/uploads/a.jpg').protocol,'https:');
  for(const url of ['https://evil.test/wp-content/uploads/a.jpg','https://raboteb.com.evil.test/wp-content/uploads/a.jpg','http://127.0.0.1/a.jpg','https://user:secret@raboteb.com/wp-content/uploads/a.jpg','https://raboteb.com:444/wp-content/uploads/a.jpg','https://raboteb.com/wp-admin/','https://raboteb.com/wp-content/uploads/../../admin/'])assert.throws(()=>sourceUrl(url));
});
test('supplier imports are idempotent and sync updates price/stock without replacing local descriptions',{timeout:30000},async()=>{
  const original=process.env.DATABASE_URL;
  const secrets=JSON.parse(await readFile('../.data/database-secrets.json','utf8'));
  const name='poostikal_supplier_test_'+randomUUID().replaceAll('-','');
  const owner=new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});await owner.connect();
  await owner.query(`CREATE DATABASE ${name} OWNER poostikal`);
  const url=new URL(original);url.pathname='/'+name;process.env.DATABASE_URL=url.toString();
  const db=new Database();process.env.DATABASE_URL=original;
  try{
    await db.onModuleInit();const admin=randomUUID(),media=randomUUID();
    await db.pool.query('INSERT INTO admins VALUES($1,$2,$3,now())',[admin,'test@example.test','unused']);
    await db.pool.query('INSERT INTO media(id,filename,mime,bytes,sha256) VALUES($1,$2,$3,1,$4)',[media,media+'.webp','image/webp','test']);
    const service=new RabotebService(db);service.image=async()=>`/api/media/${media}.webp`;
    const p=fromWoo({id:100,name:'Source product',slug:'source-product',type:'simple',status:'publish',stock_status:'instock',manage_stock:false,regular_price:'100000',sale_price:'90000',description:'<p>Source details</p>',short_description:'<p>Summary</p>',categories:[{name:'Category'}],brands:[{name:'Brand'}],images:[{src:'https://raboteb.com/wp-content/uploads/p.jpg',alt:'Source product'}]});
    await service.importProduct(p,admin,false);await service.importProduct(p,admin,false);
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM products')).rows[0].n,1);
    const catalog=new CatalogService(db);let saved=(await db.pool.query('SELECT document FROM products')).rows[0].document;
    assert.equal(saved.stock,null);assert.equal(saved.priceToman,90000);
    assert.equal((await catalog.list({ids:'catalog-100'})).items[0].id,'catalog-100');
    assert.equal((await catalog.list({ids:'raboteb-100'},true)).items[0].id,'raboteb-100');
    saved=await catalog.saveProduct({...saved,description:'<p>Local editorial</p>',priceToman:1,regularPriceToman:1,stock:999,supplier:{name:'raboteb',sourceId:999,url:'https://evil.test',checkedAt:''}},admin);
    assert.equal(saved.priceToman,90000);assert.equal(saved.stock,null);assert.equal(saved.supplier.sourceId,100);
    await service.importProduct({...p,regular:120000,sale:undefined,stock:4},admin,true);
    let synced=(await db.pool.query('SELECT document FROM products')).rows[0].document;
    assert.equal(synced.priceToman,120000);assert.equal(synced.stock,4);assert.equal(synced.discountPriceToman,undefined);assert.equal(synced.description,'<p>Local editorial</p>');
    await assert.rejects(()=>catalog.saveProduct(saved,admin),/تغییر/);
    await service.importProduct({...p,inStock:false,stock:null},admin,true);
    synced=await catalog.product('source-product');assert.equal(synced.status,'out-of-stock');assert.equal(synced.stock,0);
    assert.equal(synced.variants[0].stock,0);
    await service.importProduct(p,admin,true);
    synced=await catalog.product('source-product');assert.equal(synced.status,'active');assert.equal(synced.stock,null);
    assert.equal(synced.variants[0].stock,null,'Returning to availability-only stock must not invent a quantity');
    await service.importProduct({...p,regular:0,sale:undefined,stock:null},admin,true);
    synced=await catalog.product('source-product');assert.equal(synced.priceToman,0);assert.equal(synced.stock,null);
    const recordingId=randomUUID();await db.pool.query('INSERT INTO media(id,filename,mime,bytes,sha256,duration_seconds) VALUES($1,$2,$3,1,$4,60)',[recordingId,recordingId+'.wav','audio/wav','test']);
    const local=(await db.pool.query('SELECT document FROM products')).rows[0].document;
    const audio={url:`/api/media/${recordingId}.wav`,durationSeconds:60,transcript:'معرفی محلی'};
    await catalog.saveProduct({...local,audio},admin);
    for(const commerceOnly of [true,false]){await service.importProduct(p,admin,commerceOnly);assert.deepEqual((await catalog.product('source-product')).audio,audio);}

    // A source refresh must not undo local sales, and cancellation must not
    // resurrect a product that became unavailable at the source in the meantime.
    const shipping={id:randomUUID(),name:'Test shipping',description:'',type:'collect',feeToman:0,active:true,sortOrder:0};
    const orders=new OrderService(db,catalog);await orders.saveShipping(shipping,admin);
    const orderInput={requestId:randomUUID(),shippingMethodId:shipping.id,expectedShippingFeeToman:0,expectedShippingType:'collect',recipient:{name:'Test buyer',phone:'09120000000',province:'Tehran',city:'Tehran',address:'Test address number 123',postalCode:'1234567890',note:''},items:[{productId:'catalog-100',variantId:'catalog-100-default',quantity:2,expectedUnitPriceToman:90000}]};
    await service.importProduct({...p,stock:5},admin,true);
    orderInput.items[0].variantId=(await catalog.product('source-product')).variants[0].id;
    const buyer=await buyerSession(db.pool);
    const first=await orders.submit(orderInput,buyer.req);
    assert.equal((await catalog.product('source-product')).stock,3);
    for(let n=0;n<2;n++){await service.importProduct({...p,stock:7},admin,true);assert.equal((await catalog.product('source-product')).stock,5,'Repeated sync retains local reservation exactly once');}
    await service.importProduct({...p,stock:0,inStock:false},admin,true);
    await orders.status(first.id,{status:'cancelled'},admin);
    assert.equal((await catalog.product('source-product')).stock,0,'Cancellation cannot invent supplier stock');
    assert.equal((await catalog.product('source-product')).status,'out-of-stock');
    await service.importProduct({...p,stock:7},admin,true);
    const second=await orders.submit({...orderInput,requestId:randomUUID()},buyer.req);
    await service.importProduct({...p,stock:9},admin,true);
    assert.equal((await catalog.product('source-product')).stock,7);
    await orders.status(second.id,{status:'cancelled'},admin);
    assert.equal((await catalog.product('source-product')).stock,9);

    // Connection validation is performed before saving; only masked status is
    // returned. This fixture never calls or changes the live supplier.
    const originalKey=process.env.SUPPLIER_ENCRYPTION_KEY;process.env.SUPPLIER_ENCRYPTION_KEY='d'.repeat(64);
    const oldWoo=service.woo;service.tick=async()=>{};
    service.woo=async path=>path.startsWith('settings')?[{id:'woocommerce_currency',value:'IRT'}]:[];
    try{
      const credentials={consumerKey:'ck_'+'1'.repeat(40),consumerSecret:'cs_'+'2'.repeat(40)};
      const connected=await service.saveConnection(credentials,admin);
      assert.equal(connected.configured,true);assert.equal(connected.enabled,true);assert.equal(connected.currency,'IRT');
      assert.doesNotMatch(JSON.stringify(connected),/ck_|cs_|credentials/);
      const stored=(await db.pool.query("SELECT document FROM settings WHERE id='raboteb-connection'")).rows[0].document;
      assert.doesNotMatch(JSON.stringify(stored),/ck_|cs_/);
      service.woo=async()=>{throw new Error('auth failed');};
      await assert.rejects(()=>service.saveConnection({...credentials,consumerSecret:'cs_'+'3'.repeat(40)},admin));
      assert.deepEqual((await db.pool.query("SELECT document FROM settings WHERE id='raboteb-connection'")).rows[0].document,stored);
      assert.equal((await service.setEnabled({enabled:false},admin)).enabled,false);
      await assert.rejects(()=>service.enqueue('sync',admin),/فعال/);
      await service.setEnabled({enabled:true},admin);
      const worker=new RabotebService(db);
      const remote={id:100,name:'Remote changed name',slug:'different-remote-slug',type:'simple',status:'publish',stock_status:'instock',manage_stock:true,stock_quantity:12,regular_price:'170000',sale_price:'',images:[]};
      worker.woo=async path=>path.startsWith('settings')?[{id:'woocommerce_currency',value:'IRT'}]:[remote];
      await Promise.all([worker.tick(),worker.tick()]);
      const success=(await db.pool.query("SELECT status,processed,imported,progress,updated_at,finished_at FROM supplier_jobs WHERE kind='sync' ORDER BY created_at DESC LIMIT 1")).rows[0];
      assert.equal(success.status,'complete');assert.equal(success.processed,1);assert.equal(success.imported,1);
      assert.equal(success.progress.stage,'finished');assert.equal(success.progress.retry,null);
      assert.equal(new Date((await worker.status()).lastSuccessfulSync).getTime(),success.finished_at.getTime());
      const latest=await catalog.product('source-product');
      assert.equal(latest.priceToman,170000);assert.equal(latest.stock,12);assert.equal(latest.name,'Source product');assert.deepEqual(latest.audio,audio);
      const beforeFailure=(await db.pool.query('SELECT document FROM products WHERE id=$1',['raboteb-100'])).rows[0].document;
      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '16 minutes' WHERE kind='sync'");
      const priorSuccess=(await worker.status()).lastSuccessfulSync;
      worker.woo=async()=>{await worker.retry({attempt:4,maxAttempts:4,nextAttemptAt:new Date().toISOString(),message:'Retrying',code:'CONNECTION_TIMEOUT'});throw new SupplierRequestError('Connection unavailable','CONNECTION_TIMEOUT',true,undefined,undefined,4);};
      await worker.tick();
      const failed=(await db.pool.query("SELECT * FROM supplier_jobs WHERE kind='sync' ORDER BY created_at DESC LIMIT 1")).rows[0];
      assert.equal(failed.status,'failed');assert.equal(failed.total,0);assert.equal(failed.processed,0);
      assert.equal(failed.progress.stage,'currency');assert.equal(failed.progress.retry,null);
      assert.equal(failed.errors[0].code,'CONNECTION_TIMEOUT');assert.equal(failed.errors[0].attempts,4);
      const health=await worker.status();assert.deepEqual(health.lastSuccessfulSync,priorSuccess);
      assert.equal(new Date(health.nextAutomaticCheck).getTime(),failed.finished_at.getTime()+15*60_000);
      assert.deepEqual((await db.pool.query('SELECT document FROM products WHERE id=$1',['raboteb-100'])).rows[0].document,beforeFailure);
      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '16 minutes' WHERE kind='sync'");
      worker.woo=async path=>path.startsWith('settings')?[{id:'woocommerce_currency',value:'IRT'}]:[];
      await worker.tick();
      assert.equal((await db.pool.query("SELECT status FROM supplier_jobs WHERE kind='sync' ORDER BY created_at DESC LIMIT 1")).rows[0].status,'failed');
      assert.deepEqual((await db.pool.query('SELECT document FROM products WHERE id=$1',['raboteb-100'])).rows[0].document,beforeFailure,'Empty remote response must not wipe stock');
      // A new worker inherits both clocks. Frequent price refreshes cannot postpone daily discovery.
      const restarted = new RabotebService(db);
      restarted.image = service.image;
      const product = (id, overrides = {}) => ({...remote, id, name:'Product '+id, slug:'product-'+id,
        description:'<p>Catalog details</p>', images:[{src:'https://raboteb.com/wp-content/uploads/item.jpg'}], ...overrides});
      const source = [remote, product(200), product(201), product(202,{status:'draft'}),
        product(203,{stock_status:'outofstock'}), product(204)];
      await db.pool.query('INSERT INTO supplier_exclusions(source_id) VALUES(204)');
      const requests = [];
      restarted.woo = async path => {
        if (path.startsWith('settings')) return [{id:'woocommerce_currency',value:'IRT'}];
        const include = new URLSearchParams(path.split('?')[1]).get('include');
        requests.push(include);
        return include ? source.filter(item => include.split(',').includes(String(item.id))) : source;
      };

      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '14 minutes' WHERE kind='sync'");
      await restarted.tick();
      assert.deepEqual(requests, [], 'Linked products are not refreshed before 15 minutes');
      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '15 minutes' WHERE kind='sync'");
      await restarted.tick();
      assert.deepEqual(requests, ['100']);
      assert.equal((await restarted.status()).linkedProducts, 1);
      await restarted.tick();
      assert.equal(requests.length, 1, 'No immediate repeat');

      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '25 hours' WHERE discover_products");
      await restarted.tick();
      let status = await restarted.status();
      assert.deepEqual(requests, ['100', null]);
      assert.equal(status.jobs[0].status, 'complete');
      assert.equal(status.jobs[0].discover_products, true);
      assert.equal(status.linkedProducts, 3);
      assert.equal((await catalog.product('product-200')).description, '<p>Catalog details</p>');
      assert.equal((await catalog.product('product-201')).image, `/api/media/${media}.webp`);
      assert.equal(new Date(status.nextDiscoveryCheck).getTime(), status.jobs[0].finished_at.getTime() + 24*60*60*1000);

      await service.enqueue('sync',admin);
      await restarted.tick();
      status = await restarted.status();
      assert.deepEqual(requests, ['100', null, null], 'Manual sync also discovers products');
      assert.equal(status.jobs[0].status, 'complete');
      assert.equal((await db.pool.query('SELECT count(*)::int n FROM products')).rows[0].n, 3);

      await service.enqueue('sync',admin);
      restarted.woo = async () => { throw new Error('Temporary supplier outage'); };
      await restarted.tick();
      status = await restarted.status();
      assert.equal(status.jobs[0].status, 'failed');
      assert.equal(new Date(status.nextDiscoveryCheck).getTime(), status.jobs[0].finished_at.getTime() + 60*60*1000);
      await service.setEnabled({enabled:false},admin);
      await db.pool.query("UPDATE supplier_jobs SET finished_at=now()-interval '2 days' WHERE kind='sync'");
      await restarted.tick();
      assert.equal((await restarted.status()).jobs[0].id, status.jobs[0].id, 'A pause also stops overdue catalog checks');
    }finally{service.woo=oldWoo;if(originalKey===undefined)delete process.env.SUPPLIER_ENCRYPTION_KEY;else process.env.SUPPLIER_ENCRYPTION_KEY=originalKey;}
    await db.pool.query("INSERT INTO supplier_jobs(id,kind,status) VALUES($1,'csv','running')",[randomUUID()]);
    await assert.rejects(()=>service.enqueue('csv',admin,[p]),/هنوز/);
  }finally{await db.onModuleDestroy();await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);await owner.end();}
});

test('public catalog keeps supplier records private and removes source promotions and links',()=>{
  const catalog=new CatalogService({});
  const product={id:'raboteb-123',slug:'cream',name:'Cream',brand:'Brand',supplier:{name:'raboteb',url:'https://raboteb.com/product/cream'},sku:'PRIVATE',version:9,
    description:'<h2>Product details</h2><p>Made by <a href="https://raboteb.com/brands/brand">Brand</a>.</p><p>Buy from رابوطب.</p><p><a href="https://raboteb.com/video.mp4">مشاهده ویدئوی محصول</a></p>',shortDescription:'<p>Moisturizer</p>',image:'/api/media/image.webp',images:[{id:'raboteb-123-image-0',url:'/api/media/image.webp',alt:'Cream',description:'',fileName:'raboteb-photo.jpg'}],categoryIds:['cream'],attributes:[{key:'Size',value:'30ml'}],animation:{template:'dropper-box',dimensions:{},references:[{secret:'private upload'}]},mediaType:'photo',status:'active',stock:3,priceToman:1000,regularPriceToman:1000,variants:[{id:'raboteb-123-default',label:'30ml',priceToman:1000,stock:3,sku:'PRIVATE'}]};
  const result=catalog.publicProduct(product);
  assert.doesNotMatch(JSON.stringify(result),/raboteb|رابوطب|PRIVATE|private upload/);
  assert.equal(result.id,'catalog-123');assert.equal(result.variants[0].id,'catalog-123-default');
  assert.match(result.description,/<h2>Product details<\/h2>/);assert.match(result.description,/Made by Brand/);
  assert.equal(result.stock,3);assert.equal(result.priceToman,1000);
  assert.equal(product.supplier.name,'raboteb');assert.match(product.description,/raboteb.com/);
  assert.doesNotMatch(storefrontRichText('<p>Store <a href="https://example.test" title="رابوطب">site</a></p><script>alert(1)</script>'),/رابوطب|script|alert/);
  assert.match(storefrontRichText('<p><a href="https://manufacturer.test/specs">Manufacturer specs</a></p>'),/manufacturer.test/);
});
