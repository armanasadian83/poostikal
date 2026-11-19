import test from 'node:test';
import assert from 'node:assert/strict';
import {Response} from 'undici';
import {supplierRemote,supplierRequestError,SupplierRequestError} from '../dist/supplier-http.js';

const url=new URL('https://example.test/catalog');
const network=code=>new TypeError('fetch failed: private credential', {cause:Object.assign(new Error('private URL'),{code})});

test('transient connection failures retry with backoff and clear progress on success',async()=>{
  let calls=0;const delays=[],progress=[];
  const result=await supplierRemote(url,{fetcher:async()=>{if(++calls<3)throw network('ECONNRESET');return new Response('[1]');},sleep:async ms=>delays.push(ms),onRetry:async value=>progress.push(value)});
  assert.equal(result.buffer.toString(),'[1]');assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
  assert.deepEqual(progress.filter(Boolean).map(item=>item.attempt),[2,3]);assert.equal(progress.at(-1),null);
  assert.doesNotMatch(JSON.stringify(progress),/private|example\.test/);
});

test('authentication rejection fails immediately without repeated requests',async()=>{
  let calls=0;const response=new Response('Forbidden',{status:403});
  await assert.rejects(()=>supplierRemote(url,{fetcher:async()=>{calls++;return response;},sleep:async()=>assert.fail('must not retry')}),error=>error.code==='HTTP_403'&&!error.retryable&&error.attempts===1);
  assert.equal(calls,1);assert.equal(response.bodyUsed,true);
});

test('rate limits respect Retry-After and server errors recover',async()=>{
  let calls=0;const delays=[];
  await supplierRemote(url,{fetcher:async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'8'}}):calls===2?new Response('',{status:503}):new Response('ok'),sleep:async ms=>delays.push(ms)});
  assert.deepEqual(delays,[8000,2000]);assert.equal(calls,3);
});

test('persistent timeouts terminate after four attempts with safe useful diagnostics',async()=>{
  let calls=0;const delays=[];
  await assert.rejects(()=>supplierRemote(url,{fetcher:async()=>{calls++;throw network('UND_ERR_CONNECT_TIMEOUT');},sleep:async ms=>delays.push(ms)}),error=>{
    assert.ok(error instanceof SupplierRequestError);assert.equal(error.code,'CONNECTION_TIMEOUT');assert.equal(error.attempts,4);assert.equal(error.retryable,true);
    assert.doesNotMatch(error.message,/private|fetch failed/);return true;
  });
  assert.equal(calls,4);assert.deepEqual(delays,[1000,2000,4000]);
});

test('response size limits and invalid certificates are not retried',async()=>{
  for(const headers of [{},{'content-length':'50'}])await assert.rejects(()=>supplierRemote(url,{limit:2,fetcher:async()=>new Response('oversize',{headers}),sleep:async()=>assert.fail('must not retry')}),error=>error.code==='RESPONSE_TOO_LARGE'&&!error.retryable);
  await assert.rejects(()=>supplierRemote(url,{fetcher:async()=>{throw network('CERT_HAS_EXPIRED');},sleep:async()=>assert.fail('must not retry')}),error=>error.code==='TLS_CERTIFICATE'&&!error.retryable);
  const proxy=supplierRequestError(network('ECONNREFUSED'),true);assert.equal(proxy.code,'CONNECTION_REFUSED');assert.match(proxy.message,/پراکسی/);
});

test('an interrupted response body is downloaded again rather than returned partially',async()=>{
  let calls=0;
  const result=await supplierRemote(url,{fetcher:async()=>++calls===1?new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('partial'));controller.error(network('UND_ERR_SOCKET'));}})):new Response('complete'),sleep:async()=>{}});
  assert.equal(result.buffer.toString(),'complete');assert.equal(calls,2);
});
