import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';

test('migrate old trash and fulfilled holds, then reallocate supplier variants only on restore',async()=>{
  const name='poostikal_trash_'+randomUUID().replaceAll('-','');
  const secrets=JSON.parse(await readFile('../.data/database-secrets.json','utf8'));
  const owner=new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});
  await owner.connect();await owner.query('CREATE DATABASE '+name+' OWNER poostikal');
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  const db=new Client({connectionString:url.toString()});await db.connect();
  try {
    const migration='015_trash_inventory.sql';
    for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.query(await readFile('migrations/'+file,'utf8'));
    const simple='local-item',linked='raboteb-240',variant='raboteb-241',shared='raboteb-242';
    const variantDocs=[{id:variant,priceToman:100,stock:0},{id:shared,priceToman:100,stock:0,stockFromParent:true}];
    for(const [id,stock,variants] of [[simple,2,[]],[linked,0,variantDocs]]){
      const status=stock?'active':'out-of-stock';
      await db.query('INSERT INTO products(id,name,slug,status,price,stock,document) VALUES($1,$1,$1,$2,100,$3,$4)',[id,status,stock,{id,status,stock,variants}]);
      for(const v of variants)await db.query('INSERT INTO variants(id,product_id,price,stock,document) VALUES($1,$2,100,0,$3)',[v.id,id,v]);
    }
    const raw={type:'variable',published:true,inStock:true,stock:5,variants:[{id:241,inStock:true,stock:4},{id:242,inStock:true,stock:5,stockFromParent:true}]};
    await db.query('INSERT INTO supplier_products(source_id,product_id,snapshot) VALUES(240,$1,$2)',[linked,raw]);
    const hold=(id,n)=>({productId:id,quantity:n,variants:id===linked?[{id:variant,quantity:n}]:[]});
    const archived=randomUUID();
    for(const [id,status,trash,quantity] of [[archived,'delivered',true,3],[randomUUID(),'pending',false,1]]){
      const items=[{productId:'catalog-240',variantId:'catalog-241',quantity},{productId:simple,variantId:simple+'-default',quantity}];
      await db.query('INSERT INTO orders(id,status,deleted_at,total,document) VALUES($1,$2,$3,100,$4)',[id,status,trash?new Date():null,{id,items,inventory:[hold(linked,quantity),hold(simple,quantity)]}]);
    }
    await db.query('INSERT INTO retired_order_inventory VALUES($1,$2)',[randomUUID(),JSON.stringify([hold(simple,2),hold(linked,4)])]);
    await db.query('BEGIN');await db.query(await readFile('migrations/'+migration,'utf8'));await db.query('COMMIT');
    const verify=async(local,total,individual)=>{
      const {rows}=await db.query('SELECT id,stock,document FROM products ORDER BY id');
      assert.equal(rows[0].stock,local);assert.equal(rows[1].stock,total);
      assert.equal(rows[1].document.stock,total);assert.deepEqual(rows[1].document.variants.map(v=>v.stock),[individual,total]);
      assert.deepEqual((await db.query('SELECT stock FROM variants ORDER BY id')).rows.map(v=>v.stock),[individual,total]);
    };
    await verify(7,4,3);
    assert.deepEqual((await db.query('SELECT document FROM orders WHERE id=$1',[archived])).rows[0].document.inventory,[]);
    await db.query('UPDATE orders SET deleted_at=NULL WHERE id=$1',[archived]);await verify(4,1,0);
    await db.query('UPDATE orders SET deleted_at=now() WHERE id=$1',[archived]);await verify(7,4,3);
    await db.query('DELETE FROM orders WHERE id=$1',[archived]);await verify(7,4,3);
    assert.equal((await db.query('SELECT count(*)::int n FROM retired_order_inventory')).rows[0].n,0);
  } finally{
    await db.end();await owner.query('DROP DATABASE '+name+' WITH (FORCE)');await owner.end();
  }
});
