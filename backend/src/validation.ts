import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { artworkSchema, appearanceSchema, buildSchema } from './animation-schema.js';
import { DESCRIPTION_LIMITS, richTextLength, sanitizeRichText } from '@poostikal/rich-text';
const text = z.string().trim().max(5000);
const id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const money = z.number().int().min(0).max(1_000_000_000_000);
const mediaUrl = z.string().regex(/^\/api\/media\/[a-f0-9-]{36}\.(webp|mp4|glb)$/);
const imageUrl = z.string().regex(/^\/api\/media\/[a-f0-9-]{36}\.webp$/);
const image = z.object({ id, url: imageUrl, alt: text.max(300), description: text, fileName: text.optional() });
const attribute = z.object({ id, key: text.min(1).max(100), value: text.min(1).max(5000) });
const variant = z.object({ id, stockFromParent:z.boolean().optional(),description:z.string().max(DESCRIPTION_LIMITS.raw).optional(), label: text.min(1).max(150), priceToman: money, originalPriceToman: money.optional(), regularPriceToman: money.optional(), discountPriceToman: money.optional(), stock: z.number().int().min(0).max(1_000_000).nullable().default(0), sku: text.max(100).optional(), image: imageUrl.optional(), attributes: z.array(attribute).max(30).optional() });
export const productSchema = z.object({ audio:z.object({url:z.string().regex(/^\/api\/media\/[a-f0-9-]{36}\.(mp3|wav|m4a)$/),durationSeconds:z.number().positive().max(91),transcript:z.string().trim().max(10000).default(''),fileName:text.max(300).optional()}).nullable().optional(), id, sku:text.max(100).optional(), supplier:z.object({name:z.literal('raboteb'),sourceId:z.number().int().positive(),url:z.url(),checkedAt:z.string()}).optional(), version: z.number().int().positive().optional(), slug: text.min(1).max(160).regex(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u), name: text.min(1).max(250), brand: text.max(150), brandId: z.union([id,z.literal('')]), category: text.max(120), categoryIds: z.array(id).max(30), image: z.union([mediaUrl,z.literal('')]), images: z.array(image).max(100), description: z.string().trim().max(DESCRIPTION_LIMITS.raw), shortDescription: z.string().trim().max(DESCRIPTION_LIMITS.raw), attributes: z.array(attribute).max(50), regularPriceToman: money, discountPriceToman: money.optional(), priceToman: money, stock: z.number().int().min(0).max(1_000_000).nullable(), status: z.enum(['draft','active','out-of-stock']), variants: z.array(variant).max(100), mediaType: z.enum(['photo','animation']), animation: z.object({ thumbnail:image.nullable().optional(), artwork:artworkSchema.optional(), appearance:appearanceSchema.optional(), build:buildSchema.optional(), openingSide:z.enum(['left','right']).optional(), template: z.enum(['dropper-box','pump-box','jar-box','pouch-box','custom']), references: z.array(z.object({ slot:z.enum(['closed','open','product','angle']), image:image.nullable() })).length(4), dimensions:z.object({ boxWidth:z.number().positive().max(10000).optional(),boxHeight:z.number().positive().max(10000).optional(),boxDepth:z.number().positive().max(10000).optional(),productHeight:z.number().positive().max(10000).optional(),productDiameter:z.number().positive().max(10000).optional(),productWidth:z.number().positive().max(10000).optional(),productDepth:z.number().positive().max(10000).optional() }), reviewConfirmed:z.boolean(), assetUrl:mediaUrl.optional(), assetType:z.enum(['video','model']).optional() }) });
export type ProductDocument = z.infer<typeof productSchema>;
export const taxonomySchema = z.object({id,name:text.min(1).max(150),slug:text.min(1).max(160).regex(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u),description:text,image:imageUrl.optional(),parentId:id.nullable().optional()});
export const settingsSchema = z.object({storeName:text.min(1).max(100),storeDescription:text.max(300),email:z.union([z.email(),z.literal('')]),orderNotifications:z.boolean(),lowStockAlerts:z.boolean(),stockThreshold:z.number().int().min(0).max(999),compactTables:z.boolean()});
export function parse<T>(schema:z.ZodType<T>,value:unknown):T { const result=schema.safeParse(value); if(!result.success) throw new BadRequestException(`اطلاعات معتبر نیست: ${result.error.issues.map(issue=>issue.path.join('.')).slice(0,4).join('، ')}`); return result.data; }
export function validateProduct(p:ProductDocument,external=false) {
  p.description = sanitizeRichText(p.description);
  p.shortDescription = sanitizeRichText(p.shortDescription);
  const shortLength = richTextLength(p.shortDescription);
  const fullLength = richTextLength(p.description);
  if (!external && (shortLength > DESCRIPTION_LIMITS.short || fullLength > DESCRIPTION_LIMITS.full)) throw new BadRequestException('توضیحات کوتاه حداکثر ۵۰۰ و توضیحات کامل حداکثر ۲۰٬۰۰۰ نویسه باشد.');
  if (!shortLength) p.shortDescription = '';
  if (!fullLength) p.description = '';
  if(new Set(p.variants.map(v=>v.id)).size!==p.variants.length || new Set(p.categoryIds).size!==p.categoryIds.length) throw new BadRequestException('شناسه‌های تکراری مجاز نیستند.');
  if(new Set(p.animation.references.map(ref=>ref.slot)).size!==4) throw new BadRequestException('چهار نمای متفاوت انیمیشن لازم است.');
  if(!external) {
    if(p.discountPriceToman!==undefined && p.discountPriceToman>=p.regularPriceToman) throw new BadRequestException('قیمت تخفیف باید کمتر از قیمت اصلی باشد.');
    p.priceToman=p.discountPriceToman??p.regularPriceToman;
    for(const variant of p.variants) {
      const regular=variant.regularPriceToman??p.regularPriceToman;
      const discount=variant.discountPriceToman??(variant.regularPriceToman===undefined?p.discountPriceToman:undefined);
      if(discount!==undefined&&discount>=regular) throw new BadRequestException('قیمت تخفیف تنوع معتبر نیست.');
      variant.priceToman=discount??regular;
      variant.originalPriceToman=discount!==undefined?regular:undefined;
    }
    if(p.stock===null||p.variants.some(variant=>variant.stock===null)) throw new BadRequestException('موجودی را وارد کن.');
    if(p.variants.length) p.stock=p.variants.reduce((sum,variant)=>sum+(variant.stock??0),0);
  }
  if(p.stock!==null&&p.stock>1_000_000) throw new BadRequestException('موجودی بیش از حد مجاز است.');
  if(p.animation.assetUrl && !p.animation.assetUrl.endsWith(p.animation.assetType==='model'?'.glb':'.mp4')) throw new BadRequestException('نوع فایل انیمیشن درست نیست.');
  if(p.status!=='draft') {
    if(!external&&(!p.brandId||!p.categoryIds.length||!p.description||!p.shortDescription||p.regularPriceToman<=0)) throw new BadRequestException('برای انتشار، برند، دسته‌بندی، توضیحات و قیمت را کامل کن.');
    const images=p.mediaType==='photo'?p.images:p.animation.references.map(ref=>ref.image);
    if(!images.length||images.some(img=>!img?.alt)) throw new BadRequestException('تصاویر و متن جایگزین را کامل کن.');
    if(p.mediaType==='animation' && (!p.animation.reviewConfirmed || (!p.animation.assetUrl && !p.animation.build))) throw new BadRequestException('انیمیشن را بساز، پیش‌نمایش را بررسی کن و تأیید کن.');
    if(p.mediaType==='animation' && p.animation.template==='custom' && !p.animation.assetUrl) throw new BadRequestException('بسته‌بندی اختصاصی به فایل نهایی نیاز دارد.');
    if(!external&&p.status==='active'&&p.stock===0) throw new BadRequestException('محصول فعال باید موجودی داشته باشد.');
  }
  if(p.status!=='draft' && p.animation.thumbnail && !p.animation.thumbnail.alt.trim()) throw new BadRequestException('متن جایگزین تصویر بندانگشتی را بنویس.');
  p.image=(p.mediaType==='animation' ? p.animation.thumbnail?.url ?? p.images[0]?.url : p.images[0]?.url) ?? '';
}

