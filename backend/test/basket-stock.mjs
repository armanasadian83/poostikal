import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {connect, createServer} from 'node:net';
import test from 'node:test';
import {setTimeout as pause} from 'node:timers/promises';
import {Client} from 'pg';
import {createClient} from 'redis';
import {buyerSession} from './customer-session-fixture.mjs';

const recipient = {
  name:'مشتری آزمایشی', phone:'09123456780', province:'تهران', city:'تهران',
  address:'نشانی آزمایشی، خیابان نمونه، پلاک ۱', postalCode:'1234567890', note:'',
};
const line = (productId, quantity = 1, variantId = productId + '-default') => ({productId, variantId, quantity});
const basketPath = '/customer/basket';
const streamPath = '/customer/stock-events';

test('basket, stock events and checkout under concurrent edits and purchases', {timeout:120000}, async t => {
  const secrets = JSON.parse(await readFile('../.data/database-secrets.json', 'utf8'));
  const name = 'poostikal_basket_' + randomUUID().replaceAll('-', '');
  const owner = new Client({host:'127.0.0.1',port:55432,user:'poostikal_owner',password:secrets.owner,database:'postgres'});
  await owner.connect();
  await owner.query(`CREATE DATABASE ${name} OWNER poostikal`);
  const children = [];
  const connections = new Set();
  let redisProxy;
  let redisOffline = false;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/' + name;
  const db = new Client({connectionString:url.toString()});
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const done = once(child, 'exit');
      child.kill();
      await done;
    }));
    for (const socket of connections) socket.destroy();
    if (redisProxy) await new Promise(resolve => redisProxy.close(resolve));
    await db.end();
    await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await owner.end();
  });
  const redisUrl = process.env.TEST_REDIS_URL || '';
  let brokerUrl = redisUrl;
  if (redisUrl) {
    const target = new URL(redisUrl);
    if (target.protocol === 'redis:' && target.hostname === '127.0.0.1') {
      const targetPort = Number(target.port || 6379);
      redisProxy = createServer(client => {
        if (redisOffline) { client.destroy(); return; }
        const server = connect({host:target.hostname,port:targetPort});
        for (const socket of [client,server]) {
          connections.add(socket);
          socket.once('close', () => { connections.delete(socket); (socket===client ? server : client).destroy(); });
          socket.on('error', () => socket.destroy());
        }
        client.pipe(server).pipe(client);
      });
      redisProxy.listen(0,'127.0.0.1');
      await once(redisProxy,'listening');
      target.port = String(redisProxy.address().port);
      brokerUrl = target.toString();
    }
  }
  const channel = name + ':stock:v1';
  await db.connect();

  async function startApi(port, connection) {
    const child = spawn(process.execPath,['dist/main.js'],{
      env:{...process.env,DATABASE_URL:url.toString(),PORT:String(port),HOST:'127.0.0.1',
        APP_ORIGIN:'http://127.0.0.1:7777',REDIS_URL:connection,REDIS_NAMESPACE:name,
        RABOTEB_CONSUMER_KEY:'',RABOTEB_CONSUMER_SECRET:'',AI_ENABLED:'false'},
      windowsHide:true,stdio:'pipe',
    });
    children.push(child);
    let logs = '';
    child.stdout.on('data', value => { logs += value; });
    child.stderr.on('data', value => { logs += value; });
    const call = (path, customer, {method='GET',body,signal,headers={}}={}) => fetch(
      `http://127.0.0.1:${port}/api${path}`, {method,signal:signal??AbortSignal.timeout(10000),headers:{
        Origin:'http://127.0.0.1:7777',...(customer?{Cookie:customer.cookie}:{}),
        ...(body?{'Content-Type':'application/json'}:{}),...headers,
      },body:body?JSON.stringify(body):undefined},
    );
    for (let attempt=0;attempt<160;attempt++) {
      try { if ((await call('/health')).ok) return call; } catch {}
      if (child.exitCode !== null) break;
      await pause(100);
    }
    assert.fail('Test API did not start: ' + logs.split('\n').slice(-8).join('\n'));
  }

  const [request,fallback] = await Promise.all([startApi(4132,brokerUrl),startApi(4133,'redis://127.0.0.1:1')]);
  const buyer = await buyerSession(db,'09125559800');
  const other = await buyerSession(db,'09125559801');
  const shippingId = randomUUID();
  await db.query("INSERT INTO shipping_methods(id,name,type,fee) VALUES($1,'پیک','flat',100)",[shippingId]);

  async function product(id,stock,variants=[]) {
    const doc = {id,slug:id,name:id,brand:'Test',status:stock>0?'active':'out-of-stock',
      stock,priceToman:1000,regularPriceToman:1000,shortDescription:'',description:'',
      images:[],categoryIds:[],attributes:[],variants,mediaType:'photo',animation:{template:'dropper-box',dimensions:{}}};
    await db.query('INSERT INTO products(id,slug,name,status,price,stock,document) VALUES($1,$1,$1,$2,1000,$3,$4)',[id,doc.status,stock,doc]);
    for (const v of variants) await db.query('INSERT INTO variants(id,product_id,price,stock,document) VALUES($1,$2,1000,$3,$4)',[v.id,id,v.stock,v]);
  }
  const stock = async id => {
    const row = (await db.query('SELECT stock,document FROM products WHERE id=$1',[id])).rows[0];
    assert.equal(row.stock,row.document.stock);
    return row.stock;
  };
  const json = async (response, status=200) => {
    const value = await response.json();
    assert.equal(response.status,status,JSON.stringify(value));
    return value;
  };
  const read = customer => request(basketPath,customer).then(r=>json(r));
  const write = (customer,revision,lines,api=request) => api(basketPath,customer,{
    method:'PUT',body:{customerId:customer.id, revision, lines},
  });
  const save = (customer,revision,lines) => write(customer,revision,lines).then(r=>json(r));
  const order = (basket,changes={}) => ({
    requestId:randomUUID(),basketRevision:basket.revision,shippingMethodId:shippingId,
    expectedShippingFeeToman:100,expectedShippingType:'flat',recipient,
    items:basket.lines.map(item=>({...item,expectedUnitPriceToman:1000})),...changes,
  });
  const checkout = (customer,body,api=request) => api('/orders',customer,{method:'POST',body,headers:{'X-Checkout-Account':customer.id}});

  await t.test('authentication, cross-account guards, and stale concurrent edits', async () => {
    assert.equal((await request(basketPath)).status,401);
    assert.equal((await request(streamPath)).status,401);
    await product('shared-edit',5);
    const empty = await read(buyer);
    assert.equal(empty.revision,null);
    assert.equal((await request(basketPath,buyer,{method:'PUT',body:{customerId:other.id,revision:null,lines:[line('shared-edit')]}})).status,409);
    assert.equal((await request(basketPath,buyer,{method:'PUT',headers:{Origin:'https://example.com'},body:{customerId:buyer.id,revision:null,lines:[]}})).status,403);
    const updates = await Promise.all([
      write(buyer,empty.revision,[line('shared-edit',2)]),
      write(buyer,empty.revision,[line('shared-edit',3)],fallback),
    ]);
    assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);
    const saved = await json(updates.find(r=>r.ok));
    assert.deepEqual((await read(buyer)).lines,saved.lines);
    assert.deepEqual((await read(other)).lines,[]);
    assert.equal(await stock('shared-edit'),5);
    assert.equal((await request(basketPath,buyer,{method:'PUT',body:{
      customerId:buyer.id,revision:saved.revision,lines:[line('shared-edit',20)],requireFull:true,
    }})).status,409);
    assert.equal((await read(buyer)).revision,saved.revision);
    assert.equal((await read(buyer)).expiresAt,saved.expiresAt,'Reads leave the inactivity deadline unchanged');
    assert.ok(Date.parse(saved.expiresAt)-Date.now()>86_390_000);
  });

  await t.test('stock reduction reconciles variants and expiration never reserves stock', async () => {
    const choices = ['rose', 'violet'].map(id=>({id,label:id,stock:3,priceToman:1000,stockFromParent:true}));
    await product('shared-parent',3,choices);
    const saved = await save(buyer,(await read(buyer)).revision,[line('shared-parent',2,'rose'),line('shared-parent',2,'violet')]);
    assert.equal(saved.lines.reduce((n,item)=>n+item.quantity,0),3);
    assert.equal(saved.adjustments.find(item=>item.variantId==='violet')?.reason,'stock');
    const original = await read(buyer);
    await db.query("UPDATE products SET stock=0,status='out-of-stock',version=version+1,document=document||'{\"stock\":0,\"status\":\"out-of-stock\"}'::jsonb WHERE id='shared-parent'");
    const depleted = await read(buyer);
    assert.deepEqual(depleted.lines,[]);
    assert.notEqual(depleted.revision,original.revision);
    assert.equal(depleted.adjustments.length,2);
    const fresh = await save(buyer,depleted.revision,[line('shared-edit')]);
    await db.query("UPDATE customer_baskets SET expires_at=now()-interval '1 second' WHERE customer_id=$1",[buyer.id]);
    assert.equal((await checkout(buyer,order(fresh))).status,409);
    const expired = await read(buyer);
    assert.deepEqual(expired.lines,[]);
    assert.equal(expired.adjustments[0]?.reason,'expired');
    assert.equal((await write(buyer,fresh.revision,[line('shared-edit')])).status,409);
    assert.equal(await stock('shared-edit'),5);
  });

  await t.test('one basket can commit once across servers, and the receipt can be recovered', async () => {
    const saved = await save(buyer,(await read(buyer)).revision,[line('shared-edit',2)]);
    const requests = [order(saved),order(saved)];
    assert.equal((await checkout(buyer,{...requests[0],basketRevision:undefined})).status,409);
    const submissions = await Promise.all([checkout(buyer,requests[0]),checkout(buyer,requests[1],fallback)]);
    assert.deepEqual(submissions.map(r=>r.status).sort(),[201,409]);
    const winner = submissions.findIndex(r=>r.ok);
    const confirmation = await json(submissions[winner],201);
    const replays = await Promise.all([checkout(buyer,requests[winner]),checkout(buyer,requests[winner],fallback)]);
    for (const response of replays) assert.equal((await json(response,201)).id,confirmation.id);
    const lookup = '/customer/order-attempts/'+requests[winner].requestId;
    assert.equal((await json(await request(lookup,buyer))).id,confirmation.id);
    assert.equal((await request(lookup,other)).status,404);
    assert.deepEqual((await read(buyer)).lines,[]);
    assert.equal(await stock('shared-edit'),3);
  });

  await t.test('eight buyers race for three units without negative stock or a partial checkout', async () => {
    await product('limited-stock',3);
    const buyers = [];
    for (let i=0;i<8;i++) buyers.push(await buyerSession(db,'0912555981'+i));
    const baskets = await Promise.all(buyers.map(user=>save(user,null,[line('limited-stock')])));
    assert.equal(await stock('limited-stock'),3);
    const responses = await Promise.all(buyers.map((user,index)=>checkout(user,order(baskets[index]),index%2?fallback:request)));
    assert.equal(responses.filter(r=>r.status===201).length,3);
    assert.equal(responses.filter(r=>r.status===409).length,5);
    assert.equal(await stock('limited-stock'),0);
    const count = await db.query("SELECT count(*)::int AS total FROM orders WHERE document->'items' @> '[{\"productId\":\"limited-stock\"}]'::jsonb");
    assert.equal(count.rows[0].total,3);
    await product('atomic-a',1);
    await product('atomic-z',1);
    const saved = await save(other,null,[line('atomic-a'),line('atomic-z')]);
    const stale = order(saved);
    stale.items[1].expectedUnitPriceToman = 999;
    assert.equal((await checkout(other,stale,fallback)).status,409);
    assert.equal(await stock('atomic-a'),1);
    assert.equal(await stock('atomic-z'),1);
    assert.equal((await read(other)).revision,saved.revision);
    assert.equal((await checkout(other,order(saved,{items:[stale.items[0]]}))).status,409);
  });

  await t.test('a supplier stock reduction holds the same product lock as checkout', async () => {
    const productId = 'raboteb-9142';
    const variantId = 'raboteb-91421';
    await product(productId,4,[{id:variantId,label:'آزمایشی',stock:4,priceToman:1000,stockFromParent:true}]);
    const selection = line('catalog-9142',3,'catalog-91421');
    const saved = await save(buyer,(await read(buyer)).revision,[selection]);
    const source = {published:true,inStock:true,stock:2,type:'variable',
      variants:[{id:91421,inStock:true,stock:2,stockFromParent:true}]};
    // The sync code locks the product before projecting a newly fetched supplier snapshot.
    await db.query('BEGIN');
    let response;
    try {
      await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[productId]);
      const checkoutDuringSync = checkout(buyer,order(saved));
      let waiting = false;
      for (let attempt=0;attempt<50&&!waiting;attempt++) {
        const locks = await owner.query(`SELECT 1 FROM pg_stat_activity WHERE datname=$1
          AND wait_event_type='Lock' AND query LIKE 'SELECT id,document FROM products%'`,[name]);
        waiting = Boolean(locks.rowCount);
        if (!waiting) await pause(20);
      }
      assert.ok(waiting,'Checkout is waiting for the supplier product lock');
      await db.query(`SELECT write_order_stock(id, supplier_available_inventory(id,document->'variants',$2,NULL))
        FROM products WHERE id=$1`,[productId,source]);
      await db.query('COMMIT');
      response = await checkoutDuringSync;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    assert.equal(response.status,409);
    assert.equal(await stock(productId),2);
    const revalidated = await read(buyer);
    assert.deepEqual(revalidated.lines,[{...selection,quantity:2}]);
    assert.equal(revalidated.adjustments[0]?.reason,'stock');
  });

  await t.test('an edit competing with checkout commits once without losing the winning state', async () => {
    await product('edit-during-checkout',4);
    const saved = await save(other,(await read(other)).revision,[line('edit-during-checkout')]);
    const [edited,submitted] = await Promise.all([
      write(other,saved.revision,[line('edit-during-checkout',2)],fallback),
      checkout(other,order(saved)),
    ]);
    const current = await read(other);
    if (edited.status===200) {
      assert.equal(submitted.status,409);
      assert.deepEqual(current.lines,[line('edit-during-checkout',2)]);
      assert.equal(await stock('edit-during-checkout'),4);
    } else {
      assert.equal(edited.status,409);
      assert.equal(submitted.status,201);
      assert.deepEqual(current.lines,[]);
      assert.equal(await stock('edit-during-checkout'),3);
    }
    assert.notEqual(current.revision,saved.revision);
  });

  await t.test('stock events reach connected baskets, including when Redis is unavailable', async () => {
    let redis;
    let messages = 0;
    const streamAbort = new AbortController();
    try {
      if (redisUrl) {
        redis = createClient({url:redisUrl,socket:{connectTimeout:2000,reconnectStrategy:false}});
        redis.on('error',()=>{});
        await redis.connect();
        await redis.subscribe(channel,()=>{messages++;});
      }
      const decoder = new TextDecoder();
      async function open(api) {
        const response = await api(streamPath,buyer,{signal:AbortSignal.any([streamAbort.signal,AbortSignal.timeout(12000)])});
        assert.equal(response.status,200);
        assert.match(response.headers.get('content-type'),/text\/event-stream/);
        assert.match(response.headers.get('cache-control'),/no-store/);
        const reader = response.body.getReader();
        let buffered = '';
        return async revision => {
          while (!buffered.includes(`event: stock\ndata: ${revision}\n\n`)) {
            const next = await reader.read();
            assert.equal(next.done,false,'Stock event stream ended early');
            buffered += decoder.decode(next.value);
          }
        };
      }
      const initial = (await db.query('SELECT revision FROM storefront_revision')).rows[0].revision;
      const streams = await Promise.all([open(request),open(fallback)]);
      await Promise.all(streams.map(wait=>wait(initial)));
      await product('committed-stock',1);
      const updated = (await db.query('SELECT revision FROM storefront_revision')).rows[0].revision;
      assert.notEqual(updated,initial);
      await Promise.all(streams.map(wait=>wait(updated)));
      if (redisUrl) assert.ok(messages>0,'Redis subscriber received committed stock invalidation');
      if (redisProxy) {
        redisOffline = true;
        for (const socket of connections) socket.destroy();
        await pause(120);
        const beforeOutage = messages;
        await product('during-outage',1);
        const outageRevision = (await db.query('SELECT revision FROM storefront_revision')).rows[0].revision;
        await Promise.all(streams.map(wait=>wait(outageRevision)));
        assert.equal(messages,beforeOutage,'PostgreSQL still updates browsers during Redis disconnect');
        redisOffline = false;
        for (let attempt=0;attempt<50&&messages===beforeOutage;attempt++) {
          await db.query('UPDATE storefront_revision SET revision=gen_random_uuid() WHERE singleton');
          await pause(100);
        }
        assert.ok(messages>beforeOutage,'Redis publishes again after reconnecting');
      }
    } finally {
      streamAbort.abort();
      if (redis?.isOpen) redis.destroy();
    }
  });
});
