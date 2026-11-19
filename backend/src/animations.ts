import { BadRequestException, Body, Controller, Injectable, Post, Req, HttpException, UseGuards } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import sharp from 'sharp';
import { Database } from './database.js';
import { AdminGuard, AdminRequest, RateLimiter } from './security.js';
import { productSchema, parse, ProductDocument } from './validation.js';
import { animationFingerprint, defaultAppearance, pouchAppearance, defaultArtwork } from './animation-schema.js';

type Point=[number,number];
/** Inverse projective mapping of the selected print face; preserves actual lettering. */
export async function rectifyArtwork(input:Buffer,corners:Point[],width:number,height:number) {
  const {data,info}=await sharp(input,{limitInputPixels:40_000_000}).rotate().flatten({background:'#fff'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const p=corners.map(([x,y])=>[x*(info.width-1),y*(info.height-1)]);
  const [p0,p1,p2,p3]=p;
  const dx1=p1[0]-p2[0],dx2=p3[0]-p2[0],dx3=p0[0]-p1[0]+p2[0]-p3[0];
  const dy1=p1[1]-p2[1],dy2=p3[1]-p2[1],dy3=p0[1]-p1[1]+p2[1]-p3[1];
  const det=dx1*dy2-dx2*dy1;
  if(Math.abs(det)<1e-6)throw new BadRequestException('محدودهٔ انتخاب‌شده معتبر نیست.');
  const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
  const a=p1[0]-p0[0]+g*p1[0],b=p3[0]-p0[0]+h*p3[0];
  const d=p1[1]-p0[1]+g*p1[1],e=p3[1]-p0[1]+h*p3[1];
  const out=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++) {
    const v=y/(height-1);
    for(let x=0;x<width;x++) {
      const u=x/(width-1),den=g*u+h*v+1;
      const sx=Math.max(0,Math.min(info.width-1,(a*u+b*v+p0[0])/den));
      const sy=Math.max(0,Math.min(info.height-1,(d*u+e*v+p0[1])/den));
      const ix=Math.floor(sx),iy=Math.floor(sy),nx=Math.min(ix+1,info.width-1),ny=Math.min(iy+1,info.height-1),fx=sx-ix,fy=sy-iy;
      for(let c=0;c<3;c++)out[(y*width+x)*3+c]=Math.round(
        (data[(iy*info.width+ix)*3+c]*(1-fx)+data[(iy*info.width+nx)*3+c]*fx)*(1-fy)+
        (data[(ny*info.width+ix)*3+c]*(1-fx)+data[(ny*info.width+nx)*3+c]*fx)*fy);
    }
    // Yield between strips so preparing artwork doesn't stall catalog requests.
    if(y%64===0)await setImmediate();
  }
  const sourceWidth=Math.min(Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),Math.hypot(p2[0]-p3[0],p2[1]-p3[1]));
  const sourceHeight=Math.min(Math.hypot(p3[0]-p0[0],p3[1]-p0[1]),Math.hypot(p2[0]-p1[0],p2[1]-p1[1]));
  return {buffer:await sharp(out,{raw:{width,height,channels:3}}).webp({lossless:true}).toBuffer(),lowResolution:Math.min(sourceWidth,sourceHeight)<256};
}

@Injectable()
export class AnimationService {
  private active=0;
  private pending=new Map<string,Promise<ProductDocument['animation']>>();
  constructor(private readonly db:Database) {}

  async prepare(input:unknown,adminId:string) {
    const parsed=parse(productSchema.shape.animation,input);
    const config=parse(productSchema.shape.animation,{...parsed,artwork:parsed.artwork??defaultArtwork,appearance:parsed.appearance??(parsed.template==='pouch-box'?pouchAppearance:defaultAppearance)});
    if(config.template==='custom')throw new BadRequestException('برای فرم اختصاصی فایل GLB یا MP4 را بارگذاری کن.');
    const defaults={
      'dropper-box':{boxWidth:45,boxHeight:85,boxDepth:32,productHeight:75,productDiameter:24},
      'pump-box':{boxWidth:65,boxHeight:180,boxDepth:65,productHeight:165,productDiameter:52},
      'jar-box':{boxWidth:80,boxHeight:65,boxDepth:80,productHeight:55,productDiameter:65},
      'pouch-box':{boxWidth:160,boxHeight:105,boxDepth:16,productWidth:150,productHeight:96,productDepth:5},
    };
    config.dimensions={...defaults[config.template],...config.dimensions};
    const d=config.dimensions as Required<typeof config.dimensions>;
    if(config.template==='pouch-box') {
      config.openingSide??='left';
      if(d.productHeight>d.boxHeight*.94 || d.productWidth>d.boxWidth*.96 || d.productDepth>d.boxDepth*.8)throw new BadRequestException('پاکت باید داخل جعبه جا شود؛ عرض، ارتفاع و ضخامت پاکت را کوچک‌تر از فضای داخلی جعبه وارد کن.');
      if(d.boxWidth/d.boxHeight<.5 || d.boxWidth/d.boxHeight>3 || d.boxDepth/d.boxHeight<.04 || d.boxDepth/d.boxHeight>.5 || d.productDepth/Math.min(d.productWidth,d.productHeight)>.2 || Math.min(d.productWidth/d.boxWidth,d.productHeight/d.boxHeight)<.25)throw new BadRequestException('این قالب برای جعبهٔ کم‌عمق و پاکت تخت است؛ تناسب اندازه‌ها را بررسی کن.');
    } else {
      if(d.productHeight>d.boxHeight*.98 || d.productDiameter>Math.min(d.boxWidth,d.boxDepth)*.94)throw new BadRequestException('محصول باید داخل جعبه جا شود؛ ارتفاع و قطر محصول و اندازه‌های جعبه را بررسی کن.');
      if(d.boxWidth/d.boxHeight>2 || d.boxDepth/d.boxHeight>2 || d.boxWidth/d.boxHeight<.15 || d.boxDepth/d.boxHeight<.15)throw new BadRequestException('تناسب این جعبه با قالب آماده سازگار نیست؛ ابعاد را بررسی کن یا مدل اختصاصی اضافه کن.');
    }
    if(config.references.length!==4||new Set(config.references.map(r=>r.slot)).size!==4||config.references.some(r=>!r.image))throw new BadRequestException('هر چهار تصویر مرجع را اضافه کن.');
    const fingerprint=animationFingerprint(config),key=adminId+fingerprint;
    const existing=await this.db.pool.query('SELECT document FROM animation_builds WHERE created_by=$1 AND fingerprint=$2',[adminId,fingerprint]);
    if(existing.rowCount)return {...config,build:existing.rows[0].document,reviewConfirmed:false,assetUrl:undefined,assetType:undefined};
    if(this.pending.has(key))return this.pending.get(key)!;
    if(this.active>=2)throw new HttpException('دو محصول در حال آماده‌سازی‌اند؛ کمی بعد دوباره امتحان کن.',429);
    this.active++;
    const promise=this.build(config,adminId,fingerprint).finally(()=>{this.active--;this.pending.delete(key);});
    this.pending.set(key,promise);
    return promise;
  }

  private async build(config:ProductDocument['animation'],adminId:string,fingerprint:string) {
    const folder=resolve(process.env.MEDIA_DIR||'../.data/media');await mkdir(folder,{recursive:true});
    const created:{id:string;filename:string;buffer:Buffer}[]=[];
    try {
      for(const ref of config.references) {
        if(!(await this.db.pool.query('SELECT 1 FROM media WHERE filename=$1 AND mime=$2',[ref.image!.url.split('/').pop(),'image/webp'])).rowCount)throw new BadRequestException('تصویر مرجع در مخزن پیدا نشد.');
      }
      const warnings:string[]=[];
      for(const surface of ['carton','label'] as const) {
        const selection=config.artwork![surface];
        const image=config.references.find(r=>r.slot===selection.slot)!.image!;
        const file=await readFile(resolve(folder,image.url.split('/').pop()!));
        const ratio=surface==='carton'?(config.dimensions.boxWidth??45)/(config.dimensions.boxHeight??85):config.template==='pouch-box'?(config.dimensions.productWidth??150)/(config.dimensions.productHeight??96):1.5;
        const width=Math.round(Math.min(2048,Math.max(512,1536*ratio))),height=surface==='carton'?1536:1024;
        const result=await rectifyArtwork(file,selection.corners,width,height);
        if(result.lowResolution)warnings.push(surface==='carton'?'جزئیات عکس جعبه کم است؛ برای نوشته‌های واضح‌تر، عکس نزدیک‌تر انتخاب کن.':'جزئیات برچسب کم است؛ عکس نزدیک‌تر از برچسب، کیفیت بهتری می‌دهد.');
        const id=randomUUID(),filename=`${id}.webp`;
        created.push({id,filename,buffer:result.buffer});await writeFile(resolve(folder,filename),result.buffer,{flag:'wx'});
      }
      const build={id:randomUUID(),version:1 as const,cartonUrl:`/api/media/${created[0].filename}`,labelUrl:`/api/media/${created[1].filename}`,warnings};
      await this.db.transaction(async client=>{
        for(const asset of created)await client.query('INSERT INTO media(id,filename,mime,bytes,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6)',[asset.id,asset.filename,'image/webp',asset.buffer.length,createHash('sha256').update(asset.buffer).digest('hex'),adminId]);
        await client.query('INSERT INTO animation_builds(id,fingerprint,document,created_by) VALUES($1,$2,$3,$4)',[build.id,fingerprint,build,adminId]);
        await client.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[adminId,'animation.prepare',build.id]);
      });
      return {...config,build,reviewConfirmed:false,assetUrl:undefined,assetType:undefined};
    } catch(error) {await Promise.all(created.map(asset=>unlink(resolve(folder,asset.filename)).catch(()=>{})));throw error;}
  }
}

@Controller('api/admin/animations') @UseGuards(AdminGuard)
export class AnimationController {
  constructor(private readonly animations:AnimationService,private readonly rate:RateLimiter) {}
  @Post('prepare') async prepare(@Body() body:unknown,@Req() req:AdminRequest) {
    await this.rate.check(`animation:${req.adminId}`,20,60);
    return this.animations.prepare(body,req.adminId);
  }
}
