import {Controller,Delete,Get,HttpException,Injectable,Param,Post,Req,UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {Database} from './database.js';
import {AdminGuard,AdminRequest} from './security.js';
import {parse} from './validation.js';
const kinds=z.enum(['products','categories','brands','orders','analyses','customers']);
@Injectable()
export class TrashService {
  constructor(private readonly db:Database){}
  async list(){return (await this.db.pool.query(`SELECT * FROM (
    SELECT id,'products' kind,name,deleted_at AS "deletedAt" FROM products WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id,'categories',name,deleted_at FROM categories WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id,'brands',name,deleted_at FROM brands WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id::text,'orders','سفارش #'||number::text,deleted_at FROM orders WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id::text,'analyses','درخواست آنالیز '||left(id::text,8),deleted_at FROM analysis_submissions WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id::text,'customers',coalesce(nullif(document->>'name',''),phone),deleted_at FROM customers WHERE deleted_at IS NOT NULL
  ) t ORDER BY "deletedAt" DESC LIMIT 2500`)).rows;}
  async change(rawKind:string,id:string,restore:boolean,actor:string){
    const kind=parse(kinds,rawKind);parse(z.string().min(1).max(150),id);if(kind==='orders'||kind==='analyses'||kind==='customers')parse(z.uuid(),id);
    const table=kind==='analyses'?'analysis_submissions':kind;
    return this.db.transaction(async c=>{
      if(kind==='products')await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      if(kind==='brands'||kind==='categories')await c.query('SELECT pg_advisory_xact_lock(834623)');
      const fields=kind==='categories'?'id,parent_id':kind==='products'?'id,brand_id':'id';
      const row=(await c.query(`SELECT ${fields} FROM ${table} WHERE id=$1 AND deleted_at IS NOT NULL FOR UPDATE`,[id])).rows[0];
      if(!row)throw new HttpException('این مورد در سطل زباله نیست.',404);
      if(restore){
        if(kind==='categories'&&row.parent_id&&(await c.query('SELECT 1 FROM categories WHERE id=$1 AND deleted_at IS NOT NULL',[row.parent_id])).rowCount)throw new HttpException('ابتدا دسته‌بندی مادر را بازیابی کن.',409);
        if(kind==='products'){
          if((await c.query('SELECT 1 FROM brands WHERE id=$1 AND deleted_at IS NOT NULL',[row.brand_id])).rowCount||(await c.query('SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 AND c.deleted_at IS NOT NULL',[id])).rowCount)throw new HttpException('ابتدا برند و دسته‌بندی‌های این محصول را بازیابی کن.',409);
        }
        try{await c.query(`UPDATE ${table} SET deleted_at=NULL${kind==='orders'||kind==='products'?',version=version+1':''} WHERE id=$1`,[id]);}
        catch(error){
          if(kind==='customers' && error instanceof Error && 'constraint' in error && error.constraint==='customers_live_phone_identity')
            throw new HttpException('با این شماره حساب دیگری ثبت شده است. بازیابی این کاربر ممکن نیست.',409);
          if(error instanceof Error && 'code' in error && error.code==='P0409')throw new HttpException(error.message,409);
          throw error;
        }
      }else{
        if(kind==='customers')await c.query('UPDATE orders SET customer_id=NULL WHERE customer_id=$1',[id]);
        if(kind==='products')await c.query('INSERT INTO supplier_exclusions(source_id) SELECT source_id FROM supplier_products WHERE product_id=$1 ON CONFLICT DO NOTHING',[id]);
        if(kind==='brands')await c.query(`UPDATE products SET brand_id=NULL,version=version+1,document=document || jsonb_build_object('brandId','','brand','') WHERE brand_id=$1`,[id]);
        if(kind==='categories'){
          await c.query(`UPDATE products p SET version=version+1,document=p.document || jsonb_build_object('categoryIds',(SELECT COALESCE(jsonb_agg(v),'[]'::jsonb) FROM jsonb_array_elements_text(p.document->'categoryIds') v WHERE v<>$1),'category',CASE WHEN p.document->>'category'=$1 THEN '' ELSE p.document->>'category' END) WHERE EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id AND pc.category_id=$1)`,[id]);
          await c.query('DELETE FROM product_categories WHERE category_id=$1',[id]);
          await c.query(`UPDATE categories SET parent_id=NULL,document=document || jsonb_build_object('parentId',null) WHERE parent_id=$1`,[id]);
        }
        await c.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
      }
      await c.query('INSERT INTO audit_log(admin_id,action,entity_id) VALUES($1,$2,$3)',[actor,`${kind}.${restore?'restore':'purge'}`,id]);return {ok:true};
    });
  }
}
@Controller('api/admin/trash') @UseGuards(AdminGuard)
export class TrashController {
  constructor(private readonly trash:TrashService){}
  @Get() list(){return this.trash.list();}
  @Post(':kind/:id/restore') restore(@Param('kind') kind:string,@Param('id') id:string,@Req() req:AdminRequest){return this.trash.change(kind,id,true,req.adminId);}
  @Delete(':kind/:id') purge(@Param('kind') kind:string,@Param('id') id:string,@Req() req:AdminRequest){return this.trash.change(kind,id,false,req.adminId);}
}
