import { parse } from 'csv-parse/sync';
import { richTextToPlainText, sanitizeRichText } from '@poostikal/rich-text';

export type SourceImage = { src:string; alt:string; description?:string };
export type SourceProduct = {
  id:number; parent:number; sku:string; name:string; slug:string; type:string; published:boolean;
  description:string; shortDescription:string; stock:number|null; inStock:boolean; stockFromParent?:boolean;
  regular:number; effective?:number; sale?:number; saleFrom?:string; saleTo?:string;
  categories:string[]; brands:string[]; attributes:{key:string;value:string}[];
  images:SourceImage[]; variants:SourceProduct[]; permalink:string;
};
export function splitTerms(value:string) { return value.split(/(?<!\\),/).map(s=>s.replace(/\\,/g,',').trim()).filter(Boolean); }
export function plain(value:unknown) { return richTextToPlainText(String(value??'')); }
export function descriptionHtml(value:string) {
  // WordPress shortcodes are presentation wrappers, not useful storefront copy.
  const clean=value.replace(/\[\/?caption\b[^\]]*\]/gi,'')
    .replace(/\[video\b([^\]]*)\]/gi,(_match,attributes:string)=>{
      const src=attributes.match(/(?:mp4|src)=["']([^"']+)["']/i)?.[1];
      return src&&/^https:\/\/raboteb\.com\/wp-content\/uploads\//.test(src)?`<p><a href="${src.replaceAll('&','&amp;').replaceAll('"','&quot;')}">مشاهده ویدئوی محصول</a></p>`:'';
    }).replace(/\[\/video\]/gi,'')
    .replace(/<(\/?)h[4-6]\b[^>]*>/gi,'<$1h3>')
    .replace(/<tr\b[^>]*>/gi,'<p>').replace(/<\/tr>/gi,'</p>')
    .replace(/<\/(?:td|th)>\s*<(?:td|th)\b[^>]*>/gi,' · ');
  return sanitizeRichText(clean);
}
export function slug(value:string) { return plain(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,140).replace(/-$/,''); }
export function amount(value:unknown):number {
  if(value===''||value===null||value===undefined)return 0;
  const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1e12)throw new Error('قیمت مبدأ معتبر نیست.');return n;
}
export function stock(value:unknown):number|null {
  if(value===''||value===null||value===undefined||value==='parent')return null;
  const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('موجودی مبدأ معتبر نیست.');return Math.max(0,n);
}
export function currentPrice(p:SourceProduct,now=Date.now()) {
  // WooCommerce's active price is authoritative for API records, including sale timing.
  if(p.effective!==undefined){
    const regular=Math.max(p.regular,p.effective);
    return {regular,discount:p.effective>0&&p.effective<regular?p.effective:undefined,price:p.effective};
  }
  const from=p.saleFrom?Date.parse(p.saleFrom):0, to=p.saleTo?Date.parse(p.saleTo):Infinity;
  const onSale=p.sale!==undefined&&p.sale<p.regular&&(!from||now>=from)&&(!to||now<=to);
  return {regular:p.regular,discount:onSale?p.sale:undefined,price:onSale?p.sale!:p.regular};
}
export function readCsv(buffer:Buffer):SourceProduct[] {
  const rows=parse(buffer,{bom:true,columns:true,skip_empty_lines:true,relax_column_count:true,max_record_size:2000000}) as Record<string,string>[];
  if(!rows.length||!('شناسه' in rows[0]||'ID' in rows[0]))throw new Error('فایل CSV ووکامرس معتبر نیست.');
  if(rows.length>20000)throw new Error('فایل بیش از حد بزرگ است.');
  const val=(r:Record<string,string>,fa:string,en:string)=>r[fa]??r[en]??'';
  const skuIds=new Map(rows.map(r=>[val(r,'شناسه محصول','SKU'),Number(val(r,'شناسه','ID'))]));
  const products:SourceProduct[]=rows.map(r=>{
    const attributes=[];
    for(let i=1;i<=60;i++){const key=val(r,`نام ${i} صفت`,`Attribute ${i} name`),value=val(r,`مقدار(های) ${i} صفت`,`Attribute ${i} value(s)`);if(key&&value)attributes.push({key:plain(key),value:plain(value)});}
    const parent=val(r,'مادر','Parent');
    const description=val(r,'توضیحات','Description').replace(/\\n/g,'\n');
    const shortDescription=val(r,'توضیح کوتاه','Short description').replace(/\\n/g,'\n');
    const imageUrls=splitTerms(val(r,'تصاویر','Images'));
    for(const match of (description+shortDescription).matchAll(/<img[^>]+src=["']([^"']+)["']/gi))if(!imageUrls.includes(match[1]))imageUrls.push(match[1]);
    const id=Number(val(r,'شناسه','ID'));if(!Number.isSafeInteger(id)||id<=0)throw new Error('شناسه محصول مبدأ معتبر نیست.');
    const name=plain(val(r,'نام','Name'));
    const brand=val(r,'برندها','Brands')||attributes.find(a=>/^(برند|brand|برند محصول)$/i.test(a.key))?.value||'';
    return {id,parent:parent?(parent.startsWith('id:')?Number(parent.slice(3)):skuIds.get(parent)||0):0,sku:val(r,'شناسه محصول','SKU'),name,slug:slug(name)||`raboteb-${id}`,type:val(r,'نوع','Type'),published:val(r,'منتشر شده','Published')==='1',description:descriptionHtml(description),shortDescription:descriptionHtml(shortDescription),stock:stock(val(r,'انبار','Stock')),inStock:val(r,'در انبار؟','In stock?')==='1',regular:amount(val(r,'قیمت عادی','Regular price')),sale:val(r,'قیمت فروش ویژه','Sale price')===''?undefined:amount(val(r,'قیمت فروش ویژه','Sale price')),saleFrom:val(r,'تاریخ شروع فروش ویژه','Date sale price starts'),saleTo:val(r,'تاریخ پایان فروش ویژه','Date sale price ends'),categories:splitTerms(val(r,'دسته‌ها','Categories')),brands:splitTerms(brand),attributes,images:imageUrls.map(src=>({src,alt:name})),variants:[],permalink:`https://raboteb.com/?post_type=product&p=${id}`} satisfies SourceProduct;
  });
  const parents=products.filter(p=>p.type!=='variation');
  const ids=new Set<number>();for(const p of products){if(ids.has(p.id))throw new Error('شناسه تکراری در فایل.');ids.add(p.id);}
  for(const p of parents){
    p.variants=products.filter(v=>v.type==='variation'&&v.parent===p.id&&v.published);
    for(const v of p.variants){
      const row=rows.find(r=>Number(val(r,'شناسه','ID'))===v.id)!;
      if(val(row,'انبار','Stock')==='parent'){v.stock=p.stock;v.stockFromParent=true;}
    }
  }
  return parents;
}

// WooCommerce REST v3 fields are intentionally mapped explicitly: no arbitrary remote metadata is executable.
export function fromWoo(p:Record<string,any>,variants:Record<string,any>[]=[],parent?:SourceProduct):SourceProduct {
  if(!Number.isSafeInteger(p.id)||p.id<=0||!['publish','draft','pending','private','trash'].includes(p.status)||
    !['instock','outofstock','onbackorder'].includes(p.stock_status)||![true,false,'parent'].includes(p.manage_stock)){
    throw new Error('اطلاعات قیمت یا موجودی دریافتی از مبدأ ناقص است؛ اطلاعات قبلی حفظ شد.');
  }
  const attributes=(p.attributes??[]).map((a:any)=>({key:plain(a.name),value:plain(a.option??(a.options??[]).join('، '))})).filter((a:any)=>a.key&&a.value);
  const managed=p.manage_stock===true||p.manage_stock==='parent';
  const name=plain(p.name)||parent?.name||'';
  const images=(p.images??(p.image?[p.image]:[])).map((i:any)=>({src:String(i.src),alt:plain(i.alt)||name}));
  const result:SourceProduct={id:Number(p.id),parent:Number(p.parent_id)||0,sku:p.sku||'',name,slug:slug(p.slug||name),type:p.type||'variation',published:p.status==='publish',description:descriptionHtml(p.description||''),shortDescription:descriptionHtml(p.short_description||''),stockFromParent:p.manage_stock==='parent',stock:p.manage_stock==='parent'?parent?.stock??null:managed?stock(p.stock_quantity):null,inStock:p.stock_status==='instock',regular:amount(p.regular_price),sale:p.sale_price?amount(p.sale_price):undefined,saleFrom:p.date_on_sale_from_gmt?`${p.date_on_sale_from_gmt}Z`:undefined,saleTo:p.date_on_sale_to_gmt?`${p.date_on_sale_to_gmt}Z`:undefined,categories:(p.categories??[]).map((c:any)=>plain(c.name)),brands:(p.brands??[]).map((b:any)=>plain(b.name)),attributes,images,variants:[],permalink:p.permalink||`https://raboteb.com/?post_type=product&p=${p.id}`};
  if(!result.brands.length)result.brands=splitTerms(attributes.find((a:any)=>/^(برند|brand|برند محصول)$/i.test(a.key))?.value||'');
  result.variants=variants.filter(v=>v.status==='publish').map(v=>fromWoo(v,[],result));
  if(p.price!==undefined)result.effective=amount(p.price);
  return result;
}

export function sourceCurrency(value:unknown):'IRT'|'IRR' {
  if(value!=='IRT'&&value!=='IRR')throw new Error('واحد پول مبدأ باید تومان یا ریال باشد؛ همگام‌سازی انجام نشد.');
  return value;
}

export function pricesInToman(product:SourceProduct,currency:'IRT'|'IRR'):SourceProduct {
  const convert=(value:number)=>{
    const toman=currency==='IRR'?value/10:value;
    if(!Number.isSafeInteger(toman))throw new Error('قیمت مبدأ به تومان صحیح تبدیل نمی‌شود.');
    return toman;
  };
  return {...product,regular:convert(product.regular),effective:product.effective===undefined?undefined:convert(product.effective),
    sale:product.sale===undefined?undefined:convert(product.sale),variants:product.variants.map(v=>pricesInToman(v,currency))};
}
