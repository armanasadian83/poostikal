import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import sharp from 'sharp';

test('guest package analysis requires a mobile, groups private submissions, and uses no AI quota', {timeout:90000}, async () => {
  const name='poostikal_analysis_'+randomUUID().replaceAll('-','');
  const secrets=JSON.parse(await readFile('../.data/database-secrets.json','utf8'));
  const owner=new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});
  await owner.connect();
  await owner.query('CREATE DATABASE '+name+' OWNER poostikal');
  const url=new URL(process.env.DATABASE_URL); url.pathname='/'+name;
  const db=new Client({connectionString:url.toString()}); await db.connect();
  const child=spawn(process.execPath,['dist/main.js'],{
    env:{...process.env,DATABASE_URL:url.toString(),PORT:'4185',AI_ENABLED:'true',OPENROUTER_API_KEY:'',RABOTEB_CONSUMER_KEY:'',RABOTEB_CONSUMER_SECRET:''},stdio:'ignore',windowsHide:true});
  const exited=once(child,'exit');
  const base='http://127.0.0.1:4185/api';
  const skinGoals=['hydration','melasma','rosacea','rejuvenation','facial-wrinkles','cellulite','double-chin','skin-dullness'];
  const skinAreas=['hand','buttocks','shoulder-blades','under-chin'];
  const answers={audience:'home',topic:'skin',profile:'dry',profileNote:'',goals:skinGoals,note:'',packageId:'economy',areas:skinAreas,areaNote:''};
  const photo=await sharp({create:{width:500,height:500,channels:3,background:'#dbcce5'}}).png().toBuffer();
  const submission={id:randomUUID(),answers,name:'PRIVATE-TEST',phone:'09000000021'};
  const submit=(data,attachment)=>{
    const body=new FormData(); body.set('submission',JSON.stringify(data));
    if(attachment)body.set('photo',new Blob([attachment],{type:'image/png'}),'photo.png');
    return fetch(base+'/analyses',{method:'POST',body});
  };
  try {
    let ready=false;
    for(let i=0;i<100&&!ready;i++){try{ready=(await fetch(base+'/health')).ok;}catch{}if(!ready)await delay(150);}
    assert.ok(ready);
    const recommendations=await fetch(base+'/analyses/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({topic:answers.topic,profile:answers.profile,goals:answers.goals,packageId:answers.packageId})});
    assert.equal(recommendations.status,201);
    assert.deepEqual(await recommendations.json(),{items:[]});

    const response=await submit(submission,photo);assert.equal(response.status,201);
    assert.deepEqual(await response.json(),{id:submission.id,status:'pending',guidance:null});
    const retry=await submit(submission,photo); assert.equal((await retry.json()).status,'pending');
    const stored=await db.query('SELECT photo FROM analysis_submissions WHERE id=$1',[submission.id]);
    assert.equal(stored.rowCount,1);assert(stored.rows[0].photo.length<2_000_000);
    assert.equal((await sharp(stored.rows[0].photo).metadata()).format,'webp');
    const usage=(await db.query('SELECT requests FROM ai_usage WHERE day=current_date')).rows[0];
    assert.equal(Number(usage?.requests??0),0);
    assert.equal((await fetch(base+'/admin/analyses/'+submission.id+'/photo')).status,401);
    assert.equal((await fetch(base+'/admin/analyses')).status,401);
    const invalid=await submit({...submission,id:randomUUID(),answers:{...answers,packageId:'three'}});
    assert.equal(invalid.status,400);
    const second=await submit({...submission,id:randomUUID(),phone:'+۹۸۹۰۰۰۰۰۰۰۲۱',answers:{...answers,packageId:'advanced'}});
    assert.equal(second.status,201);
    const privateNote=await submit({...submission,id:randomUUID(),answers:{...answers,packageId:'undecided',note:'PRIVATE-TEST'}});
    assert.equal((await privateNote.json()).status,'pending');
    const missing=await submit({...submission,phone:''});assert.equal(missing.status,400);
    const changed=await submit({...submission,phone:'09000000022'},photo);assert.equal(changed.status,409);
    const retiredTopic=await submit({...submission,id:randomUUID(),answers:{...answers,topic:'device',profile:'facial',goals:['massage']}});
    assert.equal(retiredTopic.status,400);
    const retiredArea=await submit({...submission,id:randomUUID(),answers:{...answers,areas:['other'],areaNote:'previous write-in'}});
    assert.equal(retiredArea.status,400);
    const badPhoto=await submit({...submission,id:randomUUID()},Buffer.from('missing image'));assert.equal(badPhoto.status,400);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM analysis_submissions')).rows[0].total,3);
    const hairAreas=['scalp-crown','temple-left','hair-bulb','sebaceous-gland','hair-shaft','hair-tip'];
    const scalpConditions=['eczema','scalp','psoriasis','flakes','redness'];
    const hair={...submission,id:randomUUID(),answers:{...answers,topic:'hair',profile:'straight',goals:['thinning'],areas:hairAreas,scalpConditions,scalpNote:'بعد از شست‌وشو'}};
    assert.equal((await submit(hair)).status,201);
    assert.equal((await submit({...hair,id:randomUUID(),answers:{...hair.answers,areas:['hand']}})).status,400);
    const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
    assert.equal(login.status,201);
    const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
    const list=async query=>(await fetch(base+'/admin/analyses?'+query,{headers})).json();
    const photos=await list('photo=1');
    assert.deepEqual(photos.items.map(row=>row.id),[submission.id]);
    assert.deepEqual(photos.items[0].answers.goals,skinGoals);
    assert.deepEqual(photos.items[0].answers.areas,skinAreas);
    assert.equal((await list('q=09000000021')).total,4);
    assert.equal((await list('client='+photos.items[0].clientRef)).total,4);
    assert.equal((await list('status=pending')).total,4);
    const hairRecord=await list('q='+hair.id);
    assert.deepEqual(hairRecord.items[0].answers.areas,hairAreas);
    assert.deepEqual(hairRecord.items[0].answers.scalpConditions,scalpConditions);
    assert.equal(hairRecord.items[0].answers.scalpNote,hair.answers.scalpNote);
    for(const [topic,conditions] of [['hair',['unsure','eczema']],['hair',['unknown-option']],['skin',['eczema']]]){
      const invalidScalp=await fetch(base+'/analyses/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({topic,profile:'straight',goals:[],packageId:'economy',scalpConditions:conditions})});
      assert.equal(invalidScalp.status,400);
    }
    const file=await fetch(base+'/admin/analyses/'+submission.id+'/photo',{headers});
    assert.equal(file.headers.get('content-type'),'image/webp');
    assert.match(file.headers.get('cache-control'),/no-store/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()),stored.rows[0].photo);
    const itemUrl=base+'/admin/analyses/'+submission.id;
    const trashUrl=base+'/admin/trash/analyses/'+submission.id;
    assert.equal((await fetch(itemUrl,{method:'DELETE'})).status,401);
    assert.equal((await fetch(itemUrl,{method:'DELETE',headers})).status,200);
    assert.equal((await list('photo=1')).total,0);
    assert.equal((await list('client='+photos.items[0].clientRef)).total,3);
    assert.equal((await fetch(itemUrl+'/photo',{headers})).status,404);
    assert.equal((await fetch(itemUrl+'/review',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({note:'test'})})).status,404);
    const trash=await (await fetch(base+'/admin/trash',{headers})).json();
    assert.ok(trash.some(item=>item.kind==='analyses'&&item.id===submission.id));
    assert.equal((await fetch(trashUrl+'/restore',{method:'POST',headers})).status,201);
    assert.equal((await list('photo=1')).total,1);
    assert.deepEqual(Buffer.from(await (await fetch(itemUrl+'/photo',{headers})).arrayBuffer()),stored.rows[0].photo);
    assert.equal((await fetch(itemUrl,{method:'DELETE',headers})).status,200);
    assert.equal((await fetch(trashUrl,{method:'DELETE',headers})).status,200);
    assert.equal((await db.query('SELECT id FROM analysis_submissions WHERE id=$1',[submission.id])).rowCount,0);
    assert.equal((await fetch(trashUrl+'/restore',{method:'POST',headers})).status,404);
  }finally{
    child.kill();await exited;await db.end();await owner.query('DROP DATABASE '+name+' WITH (FORCE)');await owner.end();
  }
});
