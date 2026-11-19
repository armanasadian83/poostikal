import {Body,Controller,ForbiddenException,Get,HttpException,Injectable,Param,Post,Put,Req,UseGuards} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database} from './database.js';
import {AdminGuard,AdminRequest,hashPassword} from './security.js';
import {parse} from './validation.js';
export const adminPasswordMinLength = 10;
const schema=z.object({name:z.string().trim().min(2).max(100),email:z.email().max(200).transform(s=>s.toLowerCase()),password:z.string().min(adminPasswordMinLength).max(200).optional(),active:z.boolean().default(true),version:z.number().int().positive().optional()}).strict();
const columns='id,name,email,role,active,version,created_at AS "createdAt"';
@Injectable()
export class AdminAccounts {
  constructor(private readonly db:Database){}
  async list(){return (await this.db.pool.query(`SELECT ${columns} FROM admins ORDER BY role DESC,created_at`)).rows;}
  async save(id:string|undefined,body:unknown,actor:string){
    const input=parse(schema,body);if(id)parse(z.uuid(),id);
    if(!id&&!input.password)throw new HttpException('رمز ورود حداقل ۱۰ نویسه باشد.',400);
    const password=input.password?await hashPassword(input.password):undefined;
    return this.db.transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(834629)');
      const me=(await c.query('SELECT role,active FROM admins WHERE id=$1',[actor])).rows[0];
      if(!me?.active)throw new ForbiddenException();
      const current=id?(await c.query('SELECT * FROM admins WHERE id=$1 FOR UPDATE',[id])).rows[0]:undefined;
      if(id&&!current)throw new HttpException('ادمین پیدا نشد.',404);
      if(me.role!=='owner'&&(!id||id!==actor||current?.role==='owner'||input.active!==current?.active))throw new ForbiddenException('فقط سازنده سایت می‌تواند حساب ادمین‌های دیگر را تغییر دهد.');
      if(current&&current.version!==input.version)throw new HttpException('حساب تغییر کرده؛ صفحه را تازه کن.',409);
      if(current?.role==='owner'&&!input.active)throw new HttpException('حساب سازنده سایت غیرفعال نمی‌شود.',400);
      if(current){
        await c.query('UPDATE admins SET name=$2,email=$3,password_hash=COALESCE($4,password_hash),active=$5,version=version+1 WHERE id=$1',[id,input.name,input.email,password??null,input.active]);
        if(password||input.email!==current.email||input.active!==current.active)await c.query('DELETE FROM sessions WHERE admin_id=$1',[id]);
      }else{
        id=randomUUID();await c.query('INSERT INTO admins(id,name,email,password_hash,role,active) VALUES($1,$2,$3,$4,\'admin\',$5)',[id,input.name,input.email,password,input.active]);
      }
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[actor,current?'admin.update':'admin.create',id]);
      return (await c.query(`SELECT ${columns} FROM admins WHERE id=$1`,[id])).rows[0];
    });
  }
}
@Controller('api/admin/accounts') @UseGuards(AdminGuard)
export class AdminAccountsController {
  constructor(private readonly accounts:AdminAccounts){}
  @Get() list(){return this.accounts.list();}
  @Post() create(@Body() body:unknown,@Req() req:AdminRequest){return this.accounts.save(undefined,body,req.adminId);}
  @Put(':id') save(@Param('id') id:string,@Body() body:unknown,@Req() req:AdminRequest){return this.accounts.save(id,body,req.adminId);}
}
