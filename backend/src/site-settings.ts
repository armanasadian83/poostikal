import { Body, Controller, Get, Injectable, Param, Put, Res, UseGuards, ConflictException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {createRequire} from 'node:module';
const defaults:typeof import('./site-defaults.json')=createRequire(import.meta.url)('./site-defaults.json');
import { Database } from './database.js';
import { ReadBatch } from './read-batch.js';
import { AdminGuard } from './security.js';
import { parse } from './validation.js';
import { defaultSettings } from './catalog.js';

const text = z.string().max(5000);
const label = z.string().min(1).max(200);
// No executable protocols, protocol-relative links, or remote media in public settings.
const href = z.string().max(1500).refine(value => !/[\x00-\x1f\\]/.test(value) && (/^\/(?!\/)/.test(value) || /^#[a-z][\w-]*$/i.test(value) || /^https:\/\/[^/]+/i.test(value) || /^(mailto:[^\s@]+@[^\s@]+|tel:\+?[\d-]+)$/.test(value)), 'نشانی لینک معتبر نیست.');
const image = z.string().max(500).regex(/^\/(?:images|brand|api\/media)\/[\w./-]+\.(?:png|jpg|jpeg|webp|ico)$/i).refine(value => !value.includes('..'));
const link = z.object({label, href}).strict();
const links = z.array(link).max(15);
const schemas = {
  cart:z.object({title:label,description:text,continueLabel:label,itemsTitle:label,summaryTitle:label,checkoutLabel:label,paymentNote:text,emptyTitle:label,emptyDescription:text,emptyLabel:label,assistanceText:label,showAssistance:z.boolean()}).strict(),
  orbit:z.object({items:z.array(z.object({id:z.string().regex(/^[\w-]+$/),name:label,image}).strict()).max(20).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'شناسه تصاویر نباید تکراری باشد.')}).strict(),
  branding: z.object({logo:image,logoAlt:label,favicon:image,tagline:text,footerTagline:text,seoTitle:label,seoDescription:text,searchIndexing:z.boolean()}).strict(),
  navbar: z.object({announcement:text,announcementVisible:z.boolean(),searchPlaceholder:label,accountLabel:label,categoriesLabel:label,askLabel:label,showCategories:z.boolean(),showSearch:z.boolean(),showFavorites:z.boolean(),showAsk:z.boolean(),sticky:z.boolean(),links,mobileDescription:text,quizTitle:label,quizDescription:text,quizButton:label}).strict(),
  footer: z.object({visible:z.boolean(),title:text,description:text,analysisLabel:label,showAnalysis:z.boolean(),shopTitle:label,shopLinks:links,discoverTitle:label,discoverLinks:links,showAsk:z.boolean(),askTitle:label,askDescription:text,askLabel:label,askCaption:text,signature:text,backTopLabel:label,notice:text}).strict(),
  home: z.object({heroTitle:label,heroDescription:text,primaryLabel:label,primaryHref:href,secondaryLabel:label,secondaryHref:href,showHero:z.boolean(),showOrbit:z.boolean(),showBrands:z.boolean(),showCollection:z.boolean(),collectionTitle:label,moreLabel:label,productLimit:z.number().int().min(1).max(8),categoryLimit:z.number().int().min(1).max(8),showQuiz:z.boolean(),quizTitle:label,quizDescription:text,quizButton:label,showStory:z.boolean(),brands:z.array(z.object({id:z.string().regex(/^[\w-]+$/),name:label,image,href}).strict()).max(12).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'شناسه برندها نباید تکراری باشد.')}).strict(),
  story: z.object({image,alt:text,chapters:z.array(z.object({title:label,steps:z.array(z.object({icon:z.enum(['sun','sparkles','lips','leaf','search','clipboard','pump','drop','cream','pipette','grid','refresh']),title:label,copy:text}).strict()).min(1).max(5)}).strict()).max(8)}).strict(),
  login: z.object({intro:text,codeIntro:text,phoneLabel:label,phonePlaceholder:label,sendLabel:label,verifyLabel:label,editLabel:label,codeLabel:label,help:text,showLips:z.boolean()}).strict(),
  shop: z.object({title:label,description:text,pageSize:z.number().int().min(4).max(48),showAudio:z.boolean(),audioTitle:label,showRelated:z.boolean(),relatedTitle:label,showQuiz:z.boolean(),quizLabel:label}).strict(),
  checkout: z.object({title:label,description:text,recipientTitle:label,recipientDescription:text,submitLabel:label,successTitle:label,successDescription:text,note:text}).strict(),
  chat: z.object({title:label,welcome:label,description:text,placeholder:label,newChatLabel:label,suggestions:z.array(z.object({text:label}).strict()).max(6)}).strict(),
  contact: z.object({aboutTitle:text,aboutDescription:text,phone:z.string().max(40),email:z.union([z.email(),z.literal('')]),address:text,socialLinks:links}).strict(),
  effects: z.object({cursor:z.boolean(),waves:z.boolean(),lipTransition:z.boolean()}).strict(),
};
export type SiteSection = keyof typeof schemas;
export type SiteDocument = typeof defaults;
const inputSchema = z.object({version:z.number().int().min(0),value:z.unknown()}).strict();
@Injectable()
export class SiteSettingsService {
  private readonly reads = new ReadBatch();
  constructor(private readonly db:Database) {}
  get() { return this.reads.read('settings', () => this.readSettings()); }
  private async readSettings() {
    const rows = (await this.db.pool.query("SELECT id,document FROM settings WHERE id IN ('website','store')")).rows;
    const saved=rows.find(row=>row.id==='website')?.document;
    const store=rows.find(row=>row.id==='store')?.document??defaultSettings;
    return {version:saved?.version??0,settings:{...defaults,...saved?.settings} as SiteDocument,store:{name:store.storeName,description:store.storeDescription}};
  }
  async save(section:string,body:unknown) {
    if(!Object.hasOwn(schemas,section))throw new BadRequestException('بخش تنظیمات معتبر نیست.');
    const {version,value}=parse(inputSchema,body);
    const result=schemas[section as SiteSection].safeParse(value);
    if(!result.success)throw new BadRequestException('اطلاعات معتبر نیست؛ طول متن، تعداد موارد و نشانی لینک‌ها را بررسی کن.');
    await this.db.transaction(async client=>{
      await client.query("INSERT INTO settings(id,document) VALUES('website',$1) ON CONFLICT(id) DO NOTHING",[{version:0,settings:defaults}]);
      const current=(await client.query("SELECT document FROM settings WHERE id='website' FOR UPDATE")).rows[0].document;
      if(current.version!==version)throw new ConflictException('تنظیمات در پنجره دیگری تغییر کرده است. تازه‌سازی کن و دوباره ذخیره کن.');
      await client.query("UPDATE settings SET document=$1 WHERE id='website'",[{version:version+1,settings:{...current.settings,[section]:result.data}}]);
    });
    return this.get();
  }
}
@Controller('api')
export class SiteSettingsController {
  constructor(private readonly service:SiteSettingsService) {}
  @Get('site-settings') get(@Res({passthrough:true}) res:Response) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Poostikal-Public','1');
    return this.service.get();
  }
  @Put('admin/site-settings/:section') @UseGuards(AdminGuard) save(@Param('section') section:string,@Body() body:unknown) {return this.service.save(section,body);}
}
