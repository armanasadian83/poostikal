import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {Client} from 'pg';
test('website settings: validated sections, conflict protection, private credentials and persistence',{timeout:90000},async()=>{
 const defaults=JSON.parse(await readFile('src/site-defaults.json','utf8'));
 const secrets=JSON.parse(await readFile('../.data/database-secrets.json','utf8'));
 const name=`poostikal_settings_${randomUUID().replaceAll('-','')}`;
 assert.match(name,/^poostikal_settings_[a-f0-9]{32}$/);
 const owner=new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});
 await owner.connect();await owner.query(`CREATE DATABASE ${name} OWNER poostikal`);
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
 let child,cookie='';const encryptionKey=randomBytes(32).toString('hex');
 const start=()=>child=spawn(process.execPath,['dist/main.js'],{env:{...process.env,DATABASE_URL:url.toString(),PORT:'4109',AI_ENABLED:'false',OPENROUTER_API_KEY:'',OTP_SECRET:randomBytes(32).toString('hex'),SUPPLIER_ENCRYPTION_KEY:encryptionKey,RABOTEB_CONSUMER_KEY:'',RABOTEB_CONSUMER_SECRET:''},windowsHide:true,stdio:['ignore','ignore','inherit']});
 const stop=async()=>{if(child&&child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}};
 const request=(path,method='GET',body,admin=false,origin='http://127.0.0.1:7777')=>fetch('http://127.0.0.1:4109/api'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(admin?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const ready=async()=>{for(let i=0;i<300;i++){try{if((await request('/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('API startup timeout');};
 try{
  start();await ready();const response=await request('/site-settings');const initial=await response.json();assert.equal(initial.version,0);assert.deepEqual(initial.settings,defaults);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await request('/admin/site-settings/navbar','PUT',{version:0,value:defaults.navbar})).status,401);
  const login=await request('/auth/login','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,201);cookie=login.headers.get('set-cookie').split(';')[0];
  let version=0;
  for(const [section,value] of Object.entries(defaults)) {const result=await request('/admin/site-settings/'+section,'PUT',{version,value},true);assert.equal(result.status,200,section+' '+await result.text());version++;}
  for(const target of ['javascript:alert(1)','//evil.example','/\\evil.example','data:text/html,bad'])assert.equal((await request('/admin/site-settings/navbar','PUT',{version,value:{...defaults.navbar,links:[{label:'bad',href:target}]}},true)).status,400);
  assert.equal((await request('/admin/site-settings/home','PUT',{version,value:{...defaults.home,productLimit:200}} ,true)).status,400);
  assert.equal((await request('/admin/site-settings/branding','PUT',{version,value:{...defaults.branding,logo:'/api/media/../secret.png'}},true)).status,400);
  assert.equal((await request('/admin/site-settings/navbar','PUT',{version,value:defaults.navbar},true,'https://evil.example')).status,403);
  const changes={...defaults.navbar,searchPlaceholder:'جستجوی تازه'};
  const race=await Promise.all([request('/admin/site-settings/navbar','PUT',{version,value:changes},true),request('/admin/site-settings/navbar','PUT',{version,value:changes},true)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);version++;
  assert.equal((await request('/admin/sms')).status,401);
  assert.equal((await request('/admin/integrations/openrouter')).status,401);
  const blankSms={templateId:null,parameterName:null,keyConfigured:false,storageReady:true,otpReady:true};
  assert.deepEqual(await (await request('/admin/sms','GET',undefined,true)).json(),blankSms);
  assert.equal((await request('/customer/otp','POST',{phone:'09125559909'})).status,503);
  assert.equal((await request('/admin/sms','PUT',{templateId:271,parameterName:'OtpToken'},true)).status,400);
  assert.equal((await request('/admin/sms','PUT',{templateId:0,parameterName:'OtpToken',apiKey:'sample-key'},true)).status,400);
  assert.equal((await request('/admin/sms','PUT',{templateId:271,apiKey:'sample-key'},true)).status,400);
  assert.equal((await request('/admin/sms','PUT',{templateId:271,parameterName:' ## ',apiKey:'sample-key'},true)).status,400);
  const testKey='test-private-key-'+randomBytes(12).toString('hex');
  const keyResponse=await request('/admin/integrations/openrouter','PUT',{apiKey:testKey},true);assert.equal(keyResponse.status,200);assert.equal((await keyResponse.json()).keyConfigured,true);
  const smsResponse=await request('/admin/sms','PUT',{templateId:271,parameterName:' #OtpToken# ',apiKey:testKey},true);assert.equal(smsResponse.status,200);
  assert.deepEqual(await smsResponse.json(),{...blankSms,templateId:271,parameterName:'OtpToken',keyConfigured:true});
  const inspect=new Client({connectionString:url.toString()});await inspect.connect();
  try{
    // Settings previously saved without a parameter still have a usable key once the name is entered.
    await inspect.query("UPDATE settings SET document=document-'parameterName' WHERE id='integration-sms-ir'");
    assert.deepEqual(await (await request('/admin/sms','GET',undefined,true)).json(),{...blankSms,templateId:271,keyConfigured:true});
    assert.equal((await request('/customer/otp','POST',{phone:'09125559909'})).status,503);
    const smsUpdate=await request('/admin/sms','PUT',{templateId:272,parameterName:'LoginOTP'},true);assert.equal(smsUpdate.status,200);
    assert.deepEqual(await smsUpdate.json(),{...blankSms,templateId:272,parameterName:'LoginOTP',keyConfigured:true});
    const records=await inspect.query("SELECT document FROM settings WHERE id LIKE 'integration-%'");
    assert.ok(!JSON.stringify(records.rows).includes(testKey));assert.ok(records.rows.every(r=>r.document.credentials.tag));
  }finally{await inspect.end();}
  for(const path of ['/site-settings','/admin/ai','/admin/sms','/admin/integrations/openrouter']){const result=await request(path,'GET',undefined,true);const json=await result.text();assert.ok(!json.includes(testKey));assert.ok(!json.includes('credentials'));}
  const saved=await(await request('/site-settings')).json();await stop();start();await ready();assert.deepEqual(await(await request('/site-settings')).json(),saved);
  const previousKey=process.env.SUPPLIER_ENCRYPTION_KEY;process.env.SUPPLIER_ENCRYPTION_KEY=encryptionKey;
  const persisted=new Client({connectionString:url.toString()});await persisted.connect();
  try{const {IntegrationSettings}=await import('../dist/integration-settings.js');const integrations=new IntegrationSettings({pool:persisted});assert.deepEqual(await integrations.smsCredentials(),{apiKey:testKey,templateId:272,parameterName:'LoginOTP'});assert.equal(await integrations.apiKey('openrouter'),testKey);}finally{await persisted.end();if(previousKey===undefined)delete process.env.SUPPLIER_ENCRYPTION_KEY;else process.env.SUPPLIER_ENCRYPTION_KEY=previousKey;}

 }finally{await stop();await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);await owner.end();}
});
