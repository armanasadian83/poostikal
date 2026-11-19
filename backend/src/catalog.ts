import { storefrontRichText, storefrontText } from '@poostikal/rich-text';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { animationFingerprint } from './animation-schema.js';
import { Database } from './database.js';
import { ProductDocument, parse, productSchema, taxonomySchema, validateProduct } from './validation.js';
export const storefrontId = (id: string) => id.replace(/^raboteb-/, 'catalog-');
const internalId = (id: string) => id.replace(/^catalog-(?=\d+(?:-|$))/, 'raboteb-');
export const hiddenCategoryIdsSql='ARRAY(SELECT id FROM categories WHERE deleted_at IS NOT NULL ORDER BY id)';
export const defaultSettings={storeName:'پوستیکال',storeDescription:'مراقبت تخصصی پوست، مو و زیبایی',email:'',orderNotifications:true,lowStockAlerts:true,stockThreshold:5,compactTables:false};
@Injectable()
export class CatalogService {
  constructor(private readonly db:Database) {}
  // Store only sanitized public listings; PostgreSQL validates the ordered row revisions on every hit.
  private readonly pages = new Map<string, { stamp:string; items:ReturnType<CatalogService['publicProduct']>[]; bytes:number }>();
  private cacheBytes = 0;
  private remember(key:string, entry:{stamp:string; items:ReturnType<CatalogService['publicProduct']>[]; bytes:number}) {
    const previous=this.pages.get(key);
    if(previous){this.cacheBytes-=previous.bytes;this.pages.delete(key);}
    if(entry.bytes>2*1024*1024)return;
    this.pages.set(key,entry); this.cacheBytes+=entry.bytes;
    while(this.pages.size>256 || this.cacheBytes>24*1024*1024) {
      const first=this.pages.keys().next().value!;this.cacheBytes-=this.pages.get(first)!.bytes;this.pages.delete(first);
    }
  }
  publicProduct(p:ProductDocument,summary=false,hiddenCategories:readonly string[]=[]) {
    // Explicit public shape: never serialize supplier credentials, provenance, source filenames,
    // reference uploads, admin workflow state or supplier-specific IDs to a customer.
    const variants=p.variants.length?p.variants:[{id:`${p.id}-default`,label:'بسته‌بندی اصلی',priceToman:p.priceToman,originalPriceToman:p.discountPriceToman!==undefined?p.regularPriceToman:undefined,stock:p.stock}];
    const cover=p.mediaType==='animation' ? p.animation.thumbnail ?? p.images[0] : p.images[0];
    const shortDescription=storefrontRichText(p.shortDescription);
    const collections=p.categoryIds.filter(id=>!hiddenCategories.includes(id));
    return {
      id:storefrontId(p.id),slug:p.slug,name:storefrontText(p.name),brand:storefrontText(p.brand),
      description:summary?shortDescription:storefrontRichText(p.description),shortDescription,
      audio:!summary&&p.audio?{url:p.audio.url,durationSeconds:p.audio.durationSeconds,transcript:storefrontText(p.audio.transcript)}:undefined,
      image:cover?.url||(p.mediaType==='animation'?p.animation.build?.cartonUrl:p.image)||'/brand/poostikal-wordmark-transparent.png',imageAlt:storefrontText(cover?.alt||p.name),
      images:(summary?p.images.slice(0,1):p.images).map(image=>({id:storefrontId(image.id),url:image.url,alt:storefrontText(image.alt),description:storefrontText(image.description)})),
      mediaType:p.mediaType,animation:summary?undefined:{template:p.animation.template,dimensions:p.animation.dimensions,openingSide:p.animation.openingSide,appearance:p.animation.appearance,artwork:p.animation.artwork,build:p.animation.build,assetUrl:p.animation.assetUrl,assetType:p.animation.assetType},
      category:collections[0]??'',collections,
      highlights:p.attributes.map(a=>storefrontText(`${a.key}: ${a.value}`)).filter(Boolean),
      skinTypes:[],concerns:[],featured:true,recommendationEligible:false,status:p.status,stock:p.stock,
      priceToman:p.priceToman,regularPriceToman:p.regularPriceToman,discountPriceToman:p.discountPriceToman,
      variants:variants.map(v=>({id:storefrontId(v.id),label:storefrontText(v.label),priceToman:v.priceToman,originalPriceToman:v.originalPriceToman,stock:v.stock,image:'image' in v?v.image:undefined})),
    };
  }
  async list(query:Record<string,string>,admin=false) {
    for(const value of Object.values(query)) if(typeof value!=='string'||value.length>10000) throw new BadRequestException('پارامتر جستجو معتبر نیست.');
    const limit=Math.floor(Math.min(100,Math.max(1,Number(query.limit)||24))); const page=Math.floor(Math.min(10000,Math.max(1,Number(query.page)||1)));
    const values:unknown[]=[]; const where:string[]=["p.deleted_at IS NULL"]; const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
    if(!admin) where.push("p.status<>'draft'");
    if (query.available==='1' || query.maxPrice !== undefined) {
      const ceiling = query.maxPrice;
      if (ceiling !== undefined && !/^\d{1,10}$/.test(ceiling)) throw new BadRequestException('سقف قیمت معتبر نیست.');
      const max = ceiling !== undefined ? bind(Number(ceiling)) : null;
      const basePrice = max ? ' AND p.price<='+max : '';
      const variantPrice = max ? " AND (v->>'priceToman')::bigint<="+max : '';
      where.push(`p.status='active' AND (
        (jsonb_array_length(coalesce(p.document->'variants','[]'::jsonb))=0 AND (p.stock IS NULL OR p.stock>0) AND p.price>0${basePrice})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.document->'variants') v WHERE
          (v->>'stock' IS NULL OR (v->>'stock')::int>0) AND (v->>'priceToman')::bigint>0${variantPrice})
      )`);
    }
    if (query.multiUse==='1') where.push(`p.name ~* '(چند[ ‌-]?(کاره|منظوره)|(دو|سه|چهار|[۲۳۴2-4])[ ‌-]*در[ ‌-]*(یک|[۱1])|all[ -]in[ -]one|multi[ -]?purpose|[2-4][ -]?in[ -]?1)'`);
    if(query.ids) where.push(`p.id=ANY(${bind(query.ids.split(',').slice(0,100).map(id=>admin?id:internalId(id)))}::text[])`);
    if(query.q) { const term=bind(`%${query.q.slice(0,150).replace(/[%_\\]/g,'\\$&')}%`);where.push(`(p.name ILIKE ${term} OR b.name ILIKE ${term})`); }
    if(query.brand) where.push(`b.name=${bind(query.brand)}`);
    if(query.category&&query.category!=='all') where.push(`EXISTS(SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE c.deleted_at IS NULL AND pc.product_id=p.id AND (c.id=${bind(query.category)} OR c.slug=$${values.length}))`);
    const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
    const brands='LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL';
    const sortKey=query.sort==='low'||query.sort==='high'?'price':'created_at';
    const direction=query.sort==='low'?'ASC':'DESC';
    const order=(prefix:string)=>`${prefix}.${sortKey} ${direction},${prefix}.id`;
    const countSql=`SELECT count(*)::int AS total FROM products p ${query.q||query.brand?brands:''} ${clause}`;
    const limitVar=bind(limit),offsetVar=bind((page-1)*limit);
    if(admin){
      const [count,rows]=await Promise.all([
        this.db.pool.query(countSql,values.slice(0,-2)),
        this.db.pool.query(`SELECT p.document,p.version,b.name brand FROM products p ${brands} ${clause} ORDER BY ${order('p')} LIMIT ${limitVar} OFFSET ${offsetVar}`,values)
      ]);
      return {items:rows.rows.map(r=>({...r.document,version:r.version,brand:r.brand??''})),total:count.rows[0].total,page,limit};
    }
    const key=JSON.stringify([clause,sortKey,direction,values]),cached=this.pages.get(key);
    const stampVar=bind(cached?.stamp??null);
    // One statement, hence one MVCC snapshot for both membership and price/stock. On a hit the
    // lateral branch does not read the JSON documents. A change on any API instance is visible.
    const result=await this.db.pool.query(`WITH picked AS MATERIALIZED (
      SELECT p.id,p.xmin::text AS revision,p.${sortKey},coalesce(b.name,'') AS brand FROM products p ${brands} ${clause}
      ORDER BY ${order('p')} LIMIT ${limitVar} OFFSET ${offsetVar}
    ), hidden AS (SELECT ${hiddenCategoryIdsSql} AS ids), signature AS (
      SELECT md5(json_build_array((SELECT ids FROM hidden),json_agg(json_build_array(k.id,k.revision,k.brand) ORDER BY ${order('k')}))::text) AS stamp FROM picked k
    ) SELECT t.total,s.stamp,d.document,d.brand,(SELECT ids FROM hidden) AS hidden_categories FROM (${countSql}) t CROSS JOIN signature s
    LEFT JOIN LATERAL (
      SELECT p.document,k.brand,k.id,k.${sortKey} FROM picked k JOIN products p ON p.id=k.id
      WHERE s.stamp IS DISTINCT FROM ${stampVar}::text
    ) d ON true ORDER BY ${order('d')}`,values);
    const {total,stamp}=result.rows[0];
    if(cached && cached.stamp===stamp) {
      // Concurrent misses may already have replaced this entry; only touch the current object.
      if(this.pages.get(key)===cached){this.pages.delete(key);this.pages.set(key,cached);}
      return {items:cached.items,total,page,limit};
    }
    const items=result.rows.filter(r=>r.document).map(r=>this.publicProduct({...r.document,brand:r.brand},true,r.hidden_categories));
    this.remember(key,{stamp,items,bytes:Buffer.byteLength(JSON.stringify(items))+Buffer.byteLength(key)});
    return {items,total,page,limit};
  }
  async product(slug:string) { const result=await this.db.pool.query(`SELECT p.document,b.name brand,${hiddenCategoryIdsSql} AS hidden_categories FROM products p LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL WHERE p.slug=$1 AND p.status<>'draft' AND p.deleted_at IS NULL`,[slug]); if(!result.rowCount) throw new NotFoundException(); return this.publicProduct({...result.rows[0].document,brand:result.rows[0].brand??''},false,result.rows[0].hidden_categories); }
  async sitemap() {
    const [products, brands, categories] = await Promise.all([
      this.db.pool.query<{slug: string}>("SELECT slug FROM products WHERE deleted_at IS NULL AND status <> 'draft' ORDER BY slug"),
      this.db.pool.query<{name: string}>(`SELECT b.name FROM brands b WHERE b.deleted_at IS NULL AND EXISTS
        (SELECT 1 FROM products p WHERE p.brand_id=b.id AND p.deleted_at IS NULL AND p.status<>'draft') ORDER BY b.name`),
      this.db.pool.query<{slug: string}>(`SELECT c.slug FROM categories c WHERE c.deleted_at IS NULL AND EXISTS
        (SELECT 1 FROM product_categories pc JOIN products p ON p.id=pc.product_id
         WHERE pc.category_id=c.id AND p.deleted_at IS NULL AND p.status<>'draft') ORDER BY c.slug`),
    ]);
    return { products: products.rows.map(p => p.slug), brands: brands.rows.map(b => b.name), categories: categories.rows.map(c => c.slug) };
  }

  async adminIndex() {
    // Lists, reports and order entry need only the cover and selectable variants.
    const result=await this.db.pool.query(`SELECT p.id,p.slug,p.name,coalesce(b.name,'') brand,coalesce(p.brand_id,'') "brandId",
      p.status,p.stock,p.price::float8 "priceToman",p.document->'regularPriceToman' AS "regularPriceToman",
      p.document->'discountPriceToman' AS "discountPriceToman",p.document->>'category' AS category,p.document->'categoryIds' AS "categoryIds",
      coalesce(p.document#>>'{animation,thumbnail,url}',nullif(p.document->>'image',''),p.document#>>'{images,0,url}','') image,
      coalesce(p.document#>>'{animation,thumbnail,alt}',p.document#>>'{images,0,alt}',p.name) "imageAlt",
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label','stock',v->'stock','priceToman',v->'priceToman') ORDER BY ord)
          FROM jsonb_array_elements(p.document->'variants') WITH ORDINALITY AS a(v,ord)),'[]'::jsonb) variants
      FROM products p LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC,p.id`);
    return result.rows;
  }
  async taxonomy(kind:'brands'|'categories',admin=true) {
    const values=(await this.db.pool.query(`SELECT document FROM ${kind} WHERE deleted_at IS NULL ORDER BY name`)).rows.map(row=>row.document);
    return admin?values:values.map(t=>({id:t.id,name:storefrontText(t.name),slug:t.slug,description:storefrontRichText(t.description),image:t.image,parentId:t.parentId}));
  }
  async forAssistant(message:string) {
    const ignored=new Set(['سلام','محصول','محصولات','برای','دارید','دارین','میخوام','می‌خوام','لطفا','لطفاً','کدام','چطور','میشه','درباره','پیشنهاد','است','هست','with','what','the','for','have','your']);
    const terms=[...new Set(message.toLowerCase().split(/[^\p{L}\p{M}\p{N}\u200c]+/u).filter(word=>word.length>=3&&!ignored.has(word)))].slice(0,12).map(word=>`%${word}%`);
    if(!terms.length) return this.list({limit:'8'});
    const rows=await this.db.pool.query(`SELECT p.document,b.name brand,${hiddenCategoryIdsSql} AS hidden_categories FROM products p LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.status<>'draft' AND (p.name ILIKE ANY($1::text[]) OR b.name ILIKE ANY($1::text[]) OR p.document->>'shortDescription' ILIKE ANY($1::text[]))
      ORDER BY p.created_at DESC LIMIT 8`,[terms]);
    return {items:rows.rows.map(row=>this.publicProduct({...row.document,brand:row.brand??''},false,row.hidden_categories))};
  }
  async saveProduct(input:unknown,adminId:string) {
    // Supplier ownership is determined by persisted state, never by a client flag.
    const candidate=input as Record<string,unknown>;
    const id=parse(productSchema.shape.id,candidate?.id);
    return this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      const {rows:[current]}=await client.query(`SELECT p.version,p.deleted_at,p.document,
        EXISTS (SELECT 1 FROM supplier_products s WHERE s.product_id=p.id) AS linked
        FROM products p WHERE p.id=$1 FOR UPDATE OF p`,[id]);
      if(current?.deleted_at)throw new ConflictException('ابتدا محصول را از سطل زباله بازیابی کن.');
      if(current && candidate.version!==current.version) throw new ConflictException('محصول تغییر کرده؛ صفحه را تازه کن و دوباره ویرایش کن.');
      const isLinked=Boolean(current?.linked);
      const source:ProductDocument|undefined=isLinked?current.document:undefined;
      const owned=source?{
        supplier:source.supplier,sku:source.sku,status:source.status,stock:source.stock,
        regularPriceToman:source.regularPriceToman,discountPriceToman:source.discountPriceToman,
        priceToman:source.priceToman,variants:source.variants,
      }:{supplier:undefined};
      const p=parse(productSchema,{...candidate,...owned});
      validateProduct(p,isLinked);
      if(p.animation.build) {
        const prepared=await client.query('SELECT fingerprint,document FROM animation_builds WHERE id=$1',[p.animation.build.id]);
        if(!prepared.rowCount||prepared.rows[0].fingerprint!==animationFingerprint(p.animation))throw new BadRequestException('تصاویر یا تنظیمات تغییر کرده‌اند؛ انیمیشن را دوباره بساز.');
        p.animation.build=prepared.rows[0].document;
      }
      const urls=[...(p.animation.thumbnail?[p.animation.thumbnail.url]:[]),...p.images.map(i=>i.url),...p.animation.references.flatMap(r=>r.image?[r.image.url]:[]),...p.variants.flatMap(v=>v.image?[v.image]:[]),...(p.animation.assetUrl?[p.animation.assetUrl]:[])];
      const files=[...new Set(urls.map(url=>url.split('/').pop()))];
      if(files.length && (await client.query('SELECT filename FROM media WHERE filename=ANY($1::text[])',[files])).rowCount!==files.length)throw new BadRequestException('فایل تصویر در مخزن وجود ندارد.');
      if(p.audio) {
        const recording=await client.query("SELECT duration_seconds FROM media WHERE filename=$1 AND mime IN ('audio/mpeg','audio/wav','audio/mp4') AND duration_seconds IS NOT NULL",[p.audio.url.split('/').pop()]);
        if(!recording.rowCount) throw new BadRequestException('فایل معرفی صوتی در مخزن وجود ندارد.');
        p.audio.durationSeconds=recording.rows[0].duration_seconds;
      }
      const version=(current?.version??0)+1;
      p.version=version;
      await client.query(`INSERT INTO products(id,slug,name,brand_id,status,price,stock,document,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,brand_id=EXCLUDED.brand_id,status=EXCLUDED.status,price=EXCLUDED.price,stock=EXCLUDED.stock,document=EXCLUDED.document,version=EXCLUDED.version,updated_at=now()`,[p.id,p.slug,p.name,p.brandId||null,p.status,p.priceToman,p.stock,p,version]);
      await client.query('DELETE FROM product_categories WHERE product_id=$1',[p.id]);
      if(p.categoryIds.length) await client.query('INSERT INTO product_categories(product_id,category_id) SELECT $1,unnest($2::text[])',[p.id,p.categoryIds]);
      await client.query('DELETE FROM variants WHERE product_id=$1',[p.id]);
      if(p.variants.length) await client.query(`INSERT INTO variants(id,product_id,sku,price,stock,document)
        SELECT v->>'id',$1,nullif(v->>'sku',''),(v->>'priceToman')::bigint,(v->>'stock')::int,v FROM jsonb_array_elements($2::jsonb) v`,[p.id,JSON.stringify(p.variants)]);
      await client.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,'product.save',p.id]);
      return p;
    });
  }
  async saveTaxonomy(kind:'brands'|'categories',input:unknown,adminId:string) {
    const value=parse(taxonomySchema,input);
    return this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(834623)');
      if((await client.query(`SELECT 1 FROM ${kind} WHERE id=$1 AND deleted_at IS NOT NULL`,[value.id])).rowCount)throw new ConflictException('ابتدا این مورد را از سطل زباله بازیابی کن.');
      if(value.image && !(await client.query('SELECT 1 FROM media WHERE filename=$1 AND mime=$2',[value.image.split('/').pop(),'image/webp'])).rowCount) throw new BadRequestException('تصویر در مخزن وجود ندارد.');
      if(kind==='categories') {
        if(value.parentId) { const loop=await client.query('WITH RECURSIVE parents AS (SELECT id,parent_id FROM categories WHERE id=$1 UNION SELECT c.id,c.parent_id FROM categories c JOIN parents p ON p.parent_id=c.id) SELECT id FROM parents',[value.parentId]); if(!loop.rowCount||loop.rows.some(row=>row.id===value.id)) throw new BadRequestException('دسته‌بندی مادر معتبر نیست.'); }
        await client.query('INSERT INTO categories(id,name,slug,parent_id,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,parent_id=EXCLUDED.parent_id,document=EXCLUDED.document',[value.id,value.name,value.slug,value.parentId??null,value]);
      } else await client.query('INSERT INTO brands(id,name,slug,document) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,document=EXCLUDED.document',[value.id,value.name,value.slug,value]);
      await client.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,`${kind}.save`,value.id]); return value;
    });
  }
  async remove(kind:'brands'|'categories'|'products',id:string,adminId:string) { return this.db.transaction(async client=>{const result=await client.query(`UPDATE ${kind} SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`,[id]);if(!result.rowCount) throw new NotFoundException();await client.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,`${kind}.trash`,id]);return {ok:true};}); }
}

