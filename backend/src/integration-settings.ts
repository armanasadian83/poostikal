import {Body,Controller,Get,Injectable,Put,Req,UseGuards,BadRequestException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {Database} from './database.js';
import {AdminGuard,type AdminRequest} from './security.js';
import {parse} from './validation.js';
type Sealed={iv:string;tag:string;data:string};
type SmsSettings={templateId?:number;parameterName?:string;credentials?:Sealed};
const smsIntegration='sms-ir';
const smsSettingId=`integration-${smsIntegration}`;
const templateIdSchema=z.union([z.number(),z.string().trim().regex(/^\d{1,10}$/).transform(Number)])
  .pipe(z.number().int().positive().max(2_147_483_647));
const parameterNameSchema=z.string().trim().max(130)
  .transform(value=>value.replace(/^#([^#]*)#$/u,'$1').trim())
  .pipe(z.string().min(1).max(128).refine(value=>!/[#\p{Cc}]/u.test(value)));
@Injectable()
export class IntegrationSettings {
  constructor(private readonly db:Database){}
  storageReady(){return /^[a-f\d]{64}$/i.test(process.env.SUPPLIER_ENCRYPTION_KEY??'');}
  private seal(name:string,value:string):Sealed {
    if(!this.storageReady())throw new ServiceUnavailableException('کلید رمزگذاری سرویس‌ها روی سرور تنظیم نشده است.');
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.SUPPLIER_ENCRYPTION_KEY!,'hex'),iv);
    cipher.setAAD(Buffer.from(`poostikal:service:${name}:v1`));
    const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
  }
  private open(name:string,value:Sealed) {
    try {const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.SUPPLIER_ENCRYPTION_KEY!,'hex'),Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(`poostikal:service:${name}:v1`));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8');}
    catch {throw new ServiceUnavailableException('کلید سرویس قابل خواندن نیست؛ تنظیمات رمزگذاری سرور را بررسی کن.');}
  }
  private async row(name:string){return (await this.db.pool.query('SELECT document FROM settings WHERE id=$1',[`integration-${name}`])).rows[0]?.document;}
  async apiKey(name:'openrouter') {const row=await this.row(name);if(row?.credentials)return this.open(name,row.credentials);return process.env.OPENROUTER_API_KEY||'';}
  private smsSummary(row?:SmsSettings) {
    return {templateId:row?.templateId??null,parameterName:row?.parameterName??null,keyConfigured:!!row?.credentials,storageReady:this.storageReady(),otpReady:!!process.env.OTP_SECRET};
  }
  async sms(){return this.smsSummary(await this.row(smsIntegration));}
  async smsCredentials():Promise<{apiKey:string;templateId:number;parameterName:string}|null> {
    const row:SmsSettings|undefined=await this.row(smsIntegration);
    if(!row?.templateId||!row.parameterName||!row.credentials)return null;
    return {apiKey:this.open(smsIntegration,row.credentials),templateId:row.templateId,parameterName:row.parameterName};
  }
  async saveSms(body:unknown){
    const {templateId,parameterName,apiKey}=parse(z.object({
      templateId:templateIdSchema,
      parameterName:parameterNameSchema,
      apiKey:z.string().trim().max(500).regex(/^[!-~]*$/).optional(),
    }).strict(),body);
    if(!this.storageReady()||!process.env.OTP_SECRET)throw new ServiceUnavailableException('رمزگذاری تنظیمات و کلید امنیت ورود روی سرور باید فعال باشند.');
    const saved=apiKey
      ? await this.db.pool.query<{document:SmsSettings}>(`INSERT INTO settings(id,document) VALUES($1,$2)
          ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document RETURNING document`,[smsSettingId,{templateId,parameterName,credentials:this.seal(smsIntegration,apiKey)}])
      : await this.db.pool.query<{document:SmsSettings}>(`UPDATE settings SET document=document || $2::jsonb
          WHERE id=$1 AND jsonb_typeof(document->'credentials')='object' RETURNING document`,[smsSettingId,{templateId,parameterName}]);
    if(!saved.rowCount)throw new BadRequestException('برای راه‌اندازی پیامک، کلید API را وارد کن.');
    return this.smsSummary(saved.rows[0].document);
  }
  async openrouter(){const row=await this.row('openrouter');return {keyConfigured:!!(row?.credentials||process.env.OPENROUTER_API_KEY),storageReady:this.storageReady()};}
  async saveOpenrouter(body:unknown){const {apiKey}=parse(z.object({apiKey:z.string().min(16).max(500).regex(/^[a-zA-Z0-9_-]+$/)}).strict(),body);await this.db.pool.query("INSERT INTO settings VALUES('integration-openrouter',$1) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document",[{credentials:this.seal('openrouter',apiKey)}]);return this.openrouter();}
}
@Controller('api/admin') @UseGuards(AdminGuard)
export class IntegrationController {
  constructor(private readonly service:IntegrationSettings){}
  @Get('sms') sms(@Req() req:AdminRequest){
    if(req.adminRole!=='owner')throw new ForbiddenException('فقط سازنده سایت می‌تواند تنظیمات پیامک را ببیند.');
    return this.service.sms();
  }
  @Put('sms') saveSms(@Body() body:unknown){return this.service.saveSms(body);}
  @Get('integrations/openrouter') openrouter(){return this.service.openrouter();}
  @Put('integrations/openrouter') saveOpenrouter(@Body() body:unknown){return this.service.saveOpenrouter(body);}
}
