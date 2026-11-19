import { fork } from 'node:child_process';
import { Agent, get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import { log, error } from 'node:console';
/* global fetch, AbortSignal */

const workers = 4;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const file = fileURLToPath(import.meta.url);

// Discover real catalog and build URLs, then check the response contents before and after the run.
async function routeMix(port) {
  const base = 'http://127.0.0.1:' + port;
  async function read(path) {
    const res = await fetch(base + path, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) throw Error(path + ' returned ' + res.status);
    return res;
  }
  const [home, products] = await Promise.all([
    read('/').then(r => r.text()), read('/api/products?limit=12').then(r => r.json()),
  ]);
  const styles = [...new Set(Array.from(home.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g), m => m[1]))].slice(0, 5);
  const shop = await read('/shop').then(r => r.text());
  const images = [...new Set(Array.from(shop.matchAll(/\/_next\/image\?url=%2Fapi%2Fmedia%2F[a-f0-9-]+\.webp&amp;w=384&amp;q=95/gi), m => m[0].replaceAll('&amp;', '&')))].slice(0, 8);
  if (!styles.length || !images.length || !products.items?.length) throw Error('A built storefront and public products with images are required');
  const paths = Array.from({ length: 100 }, (_, i) => {
    const slug = encodeURIComponent(products.items[i % products.items.length].slug);
    if (i < 5) return '/';
    if (i < 10) return '/shop';
    if (i < 20) return '/products/' + slug;
    if (i < 30) return '/api/products?page=' + (1 + i % 3) + '&limit=12';
    if (i < 40) return '/api/products/' + slug;
    if (i < 45) return '/api/catalog';
    if (i < 50) return '/api/site-settings';
    if (i < 60) return '/api/theme';
    if (i < 80) return images[i % images.length];
    return styles[i % styles.length];
  });
  for (const path of new Set(paths)) {
    const res = await read(path);
    if (path.startsWith('/api/')) {
      const data = await res.json();
      const valid = path.startsWith('/api/products/') ? encodeURIComponent(data.slug) === path.slice(14) :
        path.startsWith('/api/products?') ? Array.isArray(data.items) :
        path === '/api/theme' ? data.palette : path === '/api/catalog' ? Array.isArray(data.categories) : data.settings;
      if (!valid) throw Error('Unexpected catalog content at ' + path);
    } else if (path.startsWith('/_next/image?')) {
      if (!res.headers.get('content-type')?.startsWith('image/') || !(await res.arrayBuffer()).byteLength) throw Error('Missing product image');
    } else {
      const body = await res.text();
      if (path.endsWith('.css') ? !body.includes('{') : !body.includes('<html') || !body.includes('id="main-content"')) throw Error('Unexpected page at ' + path);
    }
  }
  return paths;
}

async function measure({port, rate, seconds, paths, start, index}) {
  const maxActive = 160;
  const intervalMs = 20;
  const agent = new Agent({keepAlive:true, maxSockets:maxActive});
  const total = rate * seconds;
  const result = { issued:0, sentInWindow:0, success:0, dropped:0, bytes:0, errors:{}, perSecond:Array(seconds).fill(0), latency:[] };
  let pending = 0;
  function send(i) {
    pending++;
    result.issued++;
    const due = start + Math.floor(1000*i/rate/intervalMs)*intervalMs;
    const request = get({host:'127.0.0.1',port,path:paths[(i*37+index*23)%paths.length],agent,headers:{'Accept-Encoding':'gzip'}});
    const timeout = setTimeout(() => request.destroy(Error('timeout')), 5000);
    let done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      pending--;
      if (reason) { result.errors[reason]=(result.errors[reason]||0)+1; return; }
      const now=Date.now(), bucket=Math.floor((now-start)/1000);
      result.success++;
      result.latency.push(now-due);
      if (bucket >= 0 && bucket < seconds) result.perSecond[bucket]++;
    }
    request.once('finish', () => { if (Date.now() < start + seconds*1000) result.sentInWindow++; });
    request.once('error', e => finish(e.code || e.message));
    request.once('response', res => {
      let bytes=0;
      res.on('data', chunk => { bytes+=chunk.length; result.bytes+=chunk.length; });
      res.once('error', e => finish(e.code || e.message));
      res.once('end', () => finish(res.statusCode === 200 && bytes && res.complete ? null : 'HTTP '+res.statusCode+' or incomplete'));
    });
  }
  let i=0;
  while (i < total) {
    const now=Date.now(), interval=Math.floor((now-start)/intervalMs);
    const due=interval<0?0:Math.min(total,Math.ceil((interval+1)*intervalMs*rate/1000));
    for (;i<due;i++) {
      if (pending >= maxActive || now >= start+seconds*1000 || now-start-i*1000/rate>150) result.dropped++;
      else send(i);
    }
    if (i < total) await pause(1);
  }
  while (pending) await pause(5);
  result.finished = Date.now();
  agent.destroy();
  return result;
}

async function main() {
  const [port, rps, seconds] = process.argv.slice(2).map(Number);
  if (![port,rps,seconds].every(Number.isInteger) || port<1 || port>65535 || rps<4 || rps>5000 || seconds<1 || seconds>120)
    throw Error('Use node scripts/load-storefront.mjs PORT REQUESTS_PER_SECOND SECONDS (local production instance, 4–5000 RPS, 1–120 seconds)');
  const productSpike = process.argv[5] === '--product-spike';
  let paths;
  if (productSpike) {
    const reply = await fetch('http://127.0.0.1:'+port+'/api/catalog/sitemap', {redirect:'error',signal:AbortSignal.timeout(5000)});
    if (!reply.ok) throw Error('Could not retrieve product slugs');
    const { products } = await reply.json();
    if (!products?.length) throw Error('The public catalog needs products');
    paths=products.map(slug => '/products/'+encodeURIComponent(slug));
  } else {
    paths=await routeMix(port);
  }
  const children=Array.from({length:workers},()=>fork(file, ['worker'], {windowsHide:true,serialization:'advanced'}));
  try {
    const start=Date.now()+1200;
    const parts=await Promise.all(children.map((child,index)=>new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('exit',code=>reject(Error('Load worker exited: '+code)));
      child.once('message',resolve);
      child.send({port,rate:Math.floor(rps/workers)+(index<rps%workers?1:0),seconds,paths,start,index});
    })));
    const elapsedMs=Math.max(...parts.map(p=>p.finished))-start;
    const sum=field=>parts.reduce((n,p)=>n+p[field],0);
    const samples=parts.flatMap(p=>p.latency).sort((a,b)=>a-b);
    const quantile=f=>samples.length?Math.ceil(samples[Math.ceil(samples.length*f)-1]):null;
    const errors={};
    for (const part of parts) for (const [key,n] of Object.entries(part.errors)) errors[key]=(errors[key]||0)+n;
    const probeStart=Date.now();
    await routeMix(port);
    const output={profile:productSpike?'product-pages':'mixed-storefront',targetRps:rps,seconds,scheduled:rps*seconds,issued:sum('issued'),sentInWindow:sum('sentInWindow'),successful:sum('success'),
      dropped:sum('dropped'),errors,responseBytes:sum('bytes'),elapsedMs,p50ms:quantile(.5),p95ms:quantile(.95),p99ms:quantile(.99),
      completionsPerSecond:Array.from({length:seconds},(_,i)=>parts.reduce((n,p)=>n+p.perSecond[i],0)),recoveryProbeMs:Date.now()-probeStart};
    log(JSON.stringify(output,null,2));
    if (output.successful!==output.scheduled || output.sentInWindow!==output.scheduled) process.exitCode=1;
  } finally { for(const child of children) child.kill(); }
}
if(process.argv[2]==='worker') process.once('message',async job=>process.send(await measure(job)));
else main().catch(e=>{error(e.message);process.exitCode=1;});
