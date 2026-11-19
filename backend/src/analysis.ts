import { BadRequestException, Body, CanActivate, ConflictException, Controller, Delete, ExecutionContext, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createRequire } from 'node:module';
const definitions: typeof import('./analysis-options.json') = createRequire(import.meta.url)('./analysis-options.json');
import { Database } from './database.js';
import { CatalogService, hiddenCategoryIdsSql } from './catalog.js';
import { analysisFamilies, rankAnalysisProducts } from './analysis-matching.js';
import { optimizePrivatePhoto, MAX_INPUT_BYTES } from './receipt-image.js';
import { RateLimiter, digest, type AdminRequest } from './security.js';
import { parse } from './validation.js';

const text = z.string().trim().max(800);
const id = z.string().max(40);
const ids = z.array(id).max(32).refine(v => new Set(v).size === v.length);
const scalpChoices = definitions.guides.hair.scalpGroups.flatMap(group => group.choices);
const scalpConditions = ids.min(1).refine(values =>
  values.every(value => scalpChoices.some(choice => choice.id === value))
  && (!values.includes('unsure') || values.length === 1)
);
const answersSchema = z.object({
  audience:id, topic:z.enum(['skin','hair']), profile:id, profileNote:text,
  goals:ids, note:text, packageId:id, areas:ids.min(1), areaNote:text,
  scalpConditions:scalpConditions.optional(), scalpNote:text.optional(),
});
type Answers = z.infer<typeof answersSchema>;
const form = z.object({ id:z.uuidv4(), name:z.string().trim().max(80), phone:z.string().trim().max(24).transform(value => value.replace(/[۰-۹٠-٩]/g,d => String(d.charCodeAt(0) - (d >= '۰' ? 0x06f0 : 0x0660))).replace(/[\s()-]/g,'').replace(/^(?:\+98|0098)(?=9)/,'0')).pipe(z.string().regex(/^09\d{9}$/)), answers:answersSchema });
const includes = (items: {id:string}[], value:string) => items.some(item => item.id === value);
function validate(a:Answers) {
  const guide = definitions.guides[a.topic];
  const validAreas = a.topic === 'hair' ? [...definitions.hairAreas.scalp, ...definitions.hairAreas.structure] : definitions.areas;
  const goals = guide.groups.flatMap(group => group.goals);
  if (!includes(definitions.audiences,a.audience) || !includes(guide.profiles,a.profile)
    || (a.profile === 'other' && !a.profileNote) || (!a.goals.length && !a.note)
    || !a.goals.every(v => includes(goals,v)) || !includes(definitions.packages,a.packageId)
    || !a.areas.every(v => includes(validAreas,v))
    || (a.topic !== 'hair' && (a.scalpConditions !== undefined || a.scalpNote !== undefined))) {
    throw new BadRequestException('پاسخ‌های پرسش‌نامه کامل نیست.');
  }
}
@Injectable()
export class AnalysisUploadGuard implements CanActivate {
  constructor(private readonly rate: RateLimiter) {}
  async canActivate(ctx:ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    await this.rate.check('analysis:'+req.ip,12,600);
    return true;
  }
}
@Controller('api')
export class AnalysisController {
  constructor(private readonly db:Database, private readonly catalog:CatalogService) {}

  @Post('analyses/recommendations')
  async recommendations(@Body() body:unknown, @Res({passthrough:true}) res:Response) {
    const answers=parse(answersSchema.pick({topic:true,profile:true,goals:true,packageId:true,scalpConditions:true}),body);
    if(answers.topic !== 'hair' && answers.scalpConditions)throw new BadRequestException('وضعیت پوست سر فقط برای مو و اسکالپ ثبت می‌شود.');
    const guide=definitions.guides[answers.topic];
    const catalogs=[...new Set(analysisFamilies[answers.topic].map(family=>family.catalog))];
    const {rows}=await this.db.pool.query(`SELECT p.document, coalesce(b.name,'') AS brand,
      ARRAY(SELECT c.name FROM product_categories pc JOIN categories c ON c.id=pc.category_id
        WHERE pc.product_id=p.id AND c.deleted_at IS NULL) AS categories, ${hiddenCategoryIdsSql} AS hidden
      FROM products p LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.status='active' AND EXISTS (
        SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id
        WHERE pc.product_id=p.id AND c.deleted_at IS NULL AND c.name=ANY($1::text[])
      )`,[catalogs]);
    const entries=rows.map(row=>({categories:row.categories,product:this.catalog.publicProduct({...row.document,brand:row.brand},false,row.hidden)}));
    res.setHeader('Cache-Control','private, no-store');
    return {items:rankAnalysisProducts(answers,guide,entries)};
  }

  @Post('analyses') @UseGuards(AnalysisUploadGuard)
  @UseInterceptors(FileInterceptor('photo',{limits:{fileSize:MAX_INPUT_BYTES,files:1,fields:1,fieldSize:18000,parts:3}}))
  async submit(@Body('submission') field:unknown,@UploadedFile() file:{buffer:Buffer} | undefined,@Res({passthrough:true}) res:Response) {
    let raw:unknown;
    try { raw=JSON.parse(typeof field==='string' ? field : ''); } catch { throw new BadRequestException('فرم قابل خواندن نیست.'); }
    const data = parse(form,raw);
    validate(data.answers);
    const hash = createHash('sha256').update(JSON.stringify(data)).update(file?.buffer ?? '').digest('hex');
    const clientRef = digest('analysis-contact:'+data.phone).slice(0,16);
    const photo = file ? await optimizePrivatePhoto(file.buffer) : null;
    await this.db.pool.query(`INSERT INTO analysis_submissions(id,request_hash,client_ref,client_name,phone,answers,photo)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [data.id,hash,clientRef,data.name,data.phone,data.answers,photo]);
    res.setHeader('Cache-Control','private, no-store');
    const result = await this.db.pool.query('SELECT id,status,guidance FROM analysis_submissions WHERE id=$1 AND request_hash=$2 AND deleted_at IS NULL',[data.id,hash]);
    if (!result.rowCount) throw new ConflictException('پاسخ‌ها تغییر کرده‌اند. لطفاً دوباره ثبت کن.');
    return result.rows[0];
  }

  @Get('admin/analyses') async list(@Query() q:Record<string,string>) {
    const input=parse(z.object({q:z.string().trim().max(100).default(''), client:z.string().regex(/^[a-f0-9]{16}$/).optional(), status:z.enum(['pending','guided','reviewed']).optional(), photo:z.literal('1').optional(),page:z.coerce.number().int().min(1).max(1000000).default(1)}),q);
    const values:string[]=[];
    const clauses=['deleted_at IS NULL'];
    if (input.photo) clauses.push('photo IS NOT NULL');
    if (input.client) clauses.push('client_ref=$'+values.push(input.client));
    if (input.status) clauses.push('status=$'+values.push(input.status));
    if (input.q) {
      // Use substring matching literally, including punctuation supplied by staff.
      const p='$'+values.push(input.q);
      clauses.push(`(strpos(lower(client_name),lower(${p}))>0 OR strpos(phone,${p})>0 OR strpos(client_ref,lower(${p}))>0 OR strpos(id::text,lower(${p}))>0)`);
    }
    const where=' WHERE '+clauses.join(' AND ');
    const [count, rows]=await Promise.all([
      this.db.pool.query('SELECT count(*)::int AS total FROM analysis_submissions'+where,values),
      this.db.pool.query(`SELECT id,client_ref AS "clientRef",client_name AS name,phone,answers,status,guidance,review_note AS "reviewNote",photo IS NOT NULL AS "hasPhoto",created_at AS "createdAt" FROM analysis_submissions`+where+` ORDER BY created_at DESC,id LIMIT 20 OFFSET $${values.length+1}`,[...values,(input.page-1)*20]),
    ]);
    return {total:count.rows[0].total,items:rows.rows};
  }
  @Get('admin/analyses/:id/photo') async photo(@Param('id',ParseUUIDPipe) id:string,@Res() res:Response) {
    const row=(await this.db.pool.query('SELECT photo FROM analysis_submissions WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
    if (!row?.photo) throw new NotFoundException();
    res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(row.photo);
  }
  @Put('admin/analyses/:id/review') async review(@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown) {
    const {note}=parse(z.object({note:z.string().trim().min(1).max(2000)}),body);
    const row=await this.db.pool.query("UPDATE analysis_submissions SET review_note=$2,status='reviewed' WHERE id=$1 AND deleted_at IS NULL RETURNING id",[id,note]);
    if (!row.rowCount) throw new NotFoundException();
    return {ok:true};
  }
  @Delete('admin/analyses/:id') async remove(@Param('id',ParseUUIDPipe) id:string,@Req() req:AdminRequest) {
    return this.db.transaction(async client=>{
      const updated=await client.query('UPDATE analysis_submissions SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL',[id]);
      if(!updated.rowCount)throw new NotFoundException();
      await client.query("INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,'analyses.trash',$2)",[req.adminId,id]);
      return {ok:true};
    });
  }
}
