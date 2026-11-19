import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {Client} from 'pg';
import {buyerSession} from './customer-session-fixture.mjs';

test('customer history: ownership, completed purchases, trash, pagination and successful login dates', {timeout:120000}, async()=>{
  const secrets=JSON.parse(await readFile('../.data/database-secrets.json','utf8'));
  const name=`poostikal_history_${randomUUID().replaceAll('-','')}`;
  assert.match(name,/^poostikal_history_[a-f0-9]{32}$/);
  const owner=new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});
  await owner.connect(); await owner.query(`CREATE DATABASE ${name} OWNER poostikal`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  const db=new Client({connectionString:url.toString()});await db.connect();
  const otpSecret=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['dist/main.js'],{env:{...process.env,DATABASE_URL:url.toString(),PORT:'4129',HOST:'127.0.0.1',NODE_ENV:'development',APP_ORIGIN:'http://127.0.0.1:7777',TRUST_PROXY:'',OTP_SECRET:otpSecret,AI_ENABLED:'false',RABOTEB_CONSUMER_KEY:'',RABOTEB_CONSUMER_SECRET:''},windowsHide:true,stdio:'pipe'});
  let logs='',cookie='';child.stdout.on('data',s=>logs+=s);child.stderr.on('data',s=>logs+=s);
  const request=(path,method='GET',body,auth=cookie)=>fetch('http://127.0.0.1:4129/api'+path,{method,headers:{Origin:'http://127.0.0.1:7777',...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth}:{})},body:body?JSON.stringify(body):undefined});
  try {
    let ready=false;for(let n=0;n<240;n++){try{ready=(await request('/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,150));}assert.ok(ready,logs);
    const login=await request('/auth/login','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,201);cookie=login.headers.get('set-cookie').split(';')[0];
    const buyer=await buyerSession(db,'09125559900');const other=await buyerSession(db,'09125559901');
    const importedAt='2026-11-18T10:00:00.000Z';
    await db.query('UPDATE customers SET document=document||$2::jsonb WHERE id=$1',[buyer.id,JSON.stringify({name:'مشتری نمونه',email:'customer@example.test',joinedAt:'',legacySource:{importedAt}})]);
    const path='/admin/users/'+buyer.id+'/history';
    assert.equal((await request(path,'GET',undefined,'')).status,401);
    assert.equal((await request(path,'GET',undefined,buyer.cookie)).status,401);
    assert.equal((await request('/admin/users/bad/history')).status,400);
    assert.equal((await request('/admin/users/'+randomUUID()+'/history')).status,404);
    assert.equal((await request(path+'?page=-1')).status,400);
    assert.equal((await request(path+'?status=invalid')).status,400);
    const empty=await (await request(path)).json();assert.equal(empty.customer.joinedAt,null);assert.equal(empty.customer.lastLoginAt,null);assert.equal(empty.customer.importedAt,importedAt);assert.equal(empty.orders.total,0);assert.deepEqual(empty.topProducts,[]);
    const line=(productId,quantity,price)=>({productId,name:productId,variantId:productId+'-v',image:'/brand/poostikal-wordmark-transparent.png',quantity,unitPriceToman:price});
    const order=async(customerId,status,items,total,trash=false)=>{
      const id=randomUUID();const document={id,userId:other.id,userName:'نام گیرنده',recipient:{name:'گیرنده متفاوت',phone:other.phone || '09125559901'},items,inventory:[],paymentStatus:'paid'};
      await db.query('INSERT INTO orders(id,customer_id,status,total,document,deleted_at) VALUES($1,$2,$3,$4,$5,$6)',[id,customerId,status,total,document,trash?new Date():null]);return id;
    };
    await order(buyer.id,'delivered',[line('serum',2,100),line('cleanser',1,50)],300);
    await order(buyer.id,'delivered',[line('serum',3,120)],400);
    await order(buyer.id,'pending',[line('pending',99,100)],9900);
    await order(buyer.id,'cancelled',[line('cancelled',99,100)],9900);
    await order(buyer.id,'delivered',[line('trashed',99,100)],9900,true);
    await order(other.id,'delivered',[line('other-owner',99,100)],9900);
    const value=await (await request(path)).json();
    assert.equal(value.stats.orderCount,4);assert.equal(value.stats.completedCount,2);assert.equal(value.stats.totalSpentToman,700);assert.equal(value.stats.averageOrderToman,350);
    assert.deepEqual(value.topProducts.map(p=>[p.productId,p.quantity,p.orderCount,p.totalToman]),[['serum',5,2,560],['cleanser',1,1,50]]);
    assert.equal(value.orders.total,4);assert.ok(value.orders.items.every(o=>o.recipientPhone==='09125559901'),'Recipient phone must not decide ownership');
    const completed=await (await request(path+'?status=delivered')).json();assert.equal(completed.orders.total,2);assert.ok(completed.orders.items.every(o=>o.status==='delivered'));
    // Totals cover the whole history, beyond the global admin-state 1000-row limit.
    await db.query(`INSERT INTO orders(id,customer_id,status,total,document)
      SELECT gen_random_uuid(),$1,'pending',1,'{"items":[],"inventory":[]}'::jsonb FROM generate_series(1,1001)`,[buyer.id]);
    const last=await (await request(path+'?page=99999')).json();assert.equal(last.stats.orderCount,1005);assert.equal(last.orders.page,126);assert.equal(last.orders.items.length,5);
    await db.query('INSERT INTO customer_addresses(id,customer_id,document) VALUES($1,$2,$3)',[randomUUID(),buyer.id,{label:'خانه',city:'تهران',address:'نشانی آزمایشی'}]);
    assert.equal((await (await request(path)).json()).addresses.length,1);
    await db.query('UPDATE customers SET deleted_at=now() WHERE id=$1',[buyer.id]);assert.equal((await request(path)).status,404);
    const phone='09123456789',code='407381';
    const verify=attempt=>request('/customer/verify','POST',{phone,code:attempt},'');
    const legacy=await buyerSession(db,phone);
    await db.query('UPDATE customers SET local_test=true WHERE id=$1',[legacy.id]);
    assert.equal((await request('/customer/session','GET',undefined,legacy.cookie)).status,401);
    const hash=createHmac('sha256',otpSecret).update(`${phone}:${code}`).digest('hex');
    const seedChallenge=()=>db.query("INSERT INTO otp_challenges(phone,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[phone,hash]);
    await seedChallenge();
    assert.equal((await verify('000000')).status,401);
    const verification=await verify(code);
    assert.equal(verification.status,201);
    const account=(await db.query('SELECT id,last_login_at FROM customers WHERE phone=$1 AND NOT local_test',[phone])).rows[0];assert.ok(account.last_login_at);
    assert.notEqual(account.id,legacy.id);
    assert.equal((await verification.json()).customerId,account.id);
    const saved=account.last_login_at.toISOString();assert.equal((await verify(code)).status,401);
    assert.equal((await db.query('SELECT last_login_at FROM customers WHERE id=$1',[account.id])).rows[0].last_login_at.toISOString(),saved);
    await db.query("UPDATE customers SET status='blocked' WHERE id=$1",[account.id]);await seedChallenge();assert.equal((await verify(code)).status,401);
    assert.equal((await db.query('SELECT last_login_at FROM customers WHERE id=$1',[account.id])).rows[0].last_login_at.toISOString(),saved);
    assert.match((await request('/admin/users/'+account.id+'/history')).headers.get('cache-control'),/no-store/);
  } finally {
    child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
    await db.end();await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);await owner.end();
  }
});
