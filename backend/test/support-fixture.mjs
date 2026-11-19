import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function checkSupport(base, adminCookie) {
  const call = (path, cookie, data, method = data ? 'POST' : 'GET') => fetch(base + path, {
    method,
    headers: { ...(cookie ? { Cookie:cookie } : {}), ...(data ? {'Content-Type':'application/json'} : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });

  async function guest() {
    const response = await call('/support/open', '', {phone:'09000000020'});
    assert.equal(response.status, 201);
    return {id:(await response.json()).threadId, cookie:response.headers.get('set-cookie').split(';')[0]};
  }
  const [one,two] = await Promise.all([guest(), guest()]);
  assert.notEqual(one.id,two.id);
  const history = '/support/' + one.id + '/messages';
  const content = {body:'پیام مشتری',clientId:randomUUID()};
  assert.equal((await call('/admin/support',one.cookie)).status,401);
  assert.equal((await call(history,two.cookie)).status,404);
  assert.equal((await call(history,two.cookie,content)).status,404);
  const sent = await Promise.all([call(history,one.cookie,content),call(history,one.cookie,content)]);
  for (const response of sent) assert.equal(response.status,201);
  const first=(await sent[0].json()).id;
  assert.equal(first,(await sent[1].json()).id);
  const likePath=history+'/'+first+'/like';
  assert.equal((await call(likePath,two.cookie,{liked:true})).status,404);
  const otherHistory='/support/'+two.id+'/messages';
  assert.equal((await call(otherHistory,two.cookie,{replyTo:first,body:'سلام',clientId:randomUUID()})).status,404);
  assert.equal((await call(history,one.cookie,{stickerId:'unknown',clientId:randomUUID()})).status,400);
  const reply = await call('/admin'+history,adminCookie,{replyTo:first,body:'پاسخ پشتیبانی 💜',clientId:randomUUID()});
  assert.equal(reply.status,201);
  const list = await (await call(history,one.cookie)).json();
  assert.deepEqual(list.messages.map(m=>m.sender),['customer','staff']);
  assert.equal(list.messages[1].replyTo.body,content.body);
  const sticker = await (await call(history,one.cookie,{stickerId:'kiss',replyTo:list.messages[1].id,clientId:randomUUID()})).json();
  assert.equal(sticker.stickerId,'kiss');
  assert.equal(sticker.replyTo.body,'پاسخ پشتیبانی 💜');
  const versions=await Promise.all([call(likePath,one.cookie,{liked:true}),call(likePath,one.cookie,{liked:true})]);
  for (const response of versions) assert.equal((await response.json()).likeCount,1);
  assert.equal((await (await call('/admin'+likePath,adminCookie,{liked:true})).json()).likeCount,2);
  const delta=await (await call(history+'?after='+sticker.id+'&since='+list.likeCursor,one.cookie)).json();
  assert.equal(delta.messages.length,0);
  assert.deepEqual(delta.updates.map(u=>[u.id,u.likeCount,u.liked]),[[first,2,true]]);
  await call(likePath,one.cookie,{liked:false});
  const latest=await (await call(history+'?after='+sticker.id+'&since='+delta.likeCursor,one.cookie)).json();
  assert.deepEqual(latest.updates.map(u=>[u.id,u.likeCount,u.liked]),[[first,1,false]]);
  const inbox = await (await call('/admin/support?q=09000000020',adminCookie)).json();
  assert.deepEqual(inbox.threads.map(thread=>thread.id),[one.id]);
  assert.equal(inbox.threads[0].pinned,false);
  await call(otherHistory,two.cookie,{body:'گفت‌وگوی دوم',clientId:randomUUID()});
  const threadPath='/admin/support/'+one.id;
  const pin = pinned => call(threadPath+'/pin',adminCookie,{pinned},'PATCH');
  const order = async () => (await (await call('/admin/support?q=09000000020',adminCookie)).json()).threads.map(t=>t.id);
  assert.equal((await call(threadPath+'/pin',one.cookie,{pinned:true},'PATCH')).status,401);
  assert.equal((await call(threadPath,one.cookie,undefined,'DELETE')).status,401);
  assert.deepEqual(await order(),[two.id,one.id]);
  for(let i=0;i<2;i++) assert.deepEqual(await (await pin(true)).json(),{pinned:true});
  assert.deepEqual(await order(),[one.id,two.id]);
  assert.deepEqual(await (await pin(false)).json(),{pinned:false});
  assert.deepEqual(await order(),[two.id,one.id]);

  await pin(true);
  assert.equal((await call(threadPath,adminCookie,undefined,'DELETE')).status,200);
  assert.deepEqual(await order(),[two.id]);
  assert.equal((await call('/admin'+history+'?since=0',adminCookie)).status,404);
  assert.equal((await call(history,one.cookie)).status,404);
  assert.deepEqual(await (await call('/support/open',one.cookie,{})).json(),{threadId:null});
}
