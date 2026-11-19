import {spawn} from 'node:child_process';
import {connect} from 'node:net';
import {resolve} from 'node:path';
import process from 'node:process';
import {setTimeout, clearTimeout} from 'node:timers';
import {log} from 'node:console';
import {existsSync, readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {ensureLocalRedis, localRedisUrl} from './dev-redis.mjs';
/* global fetch, AbortSignal */
const root=resolve(import.meta.dirname,'..');const children=[];
function launch(file,args,cwd=root,stdio='inherit',env=process.env){const child=spawn(file,args,{cwd,windowsHide:true,stdio,env});children.push(child);return child;}
function start(args,cwd=root,stdio='inherit',env=process.env){return launch(process.execPath,args,cwd,stdio,env);}
const backend=resolve(root,'backend');
const backendEnv=resolve(backend,'.env');
const redisUrl=process.env.REDIS_URL ?? (existsSync(backendEnv) ? parseEnv(readFileSync(backendEnv,'utf8')).REDIS_URL : undefined) ?? localRedisUrl;
if(redisUrl===localRedisUrl){
  const available=await ensureLocalRedis(root,launch);
  log(available?'Redis is ready at 127.0.0.1:56379.':'Local Redis is unavailable. Poostikal will use its database fallback.');
}
async function healthy(url){try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}}
async function waitFor(url){for(let n=0;n<100;n++){if(await healthy(url))return;await new Promise(r=>setTimeout(r,300));}throw new Error(`Service did not start: ${url}`);}
async function checkAdminApi() {
  // The current API exposes this protected route even before a user signs in.
  const response = await fetch('http://127.0.0.1:4000/api/admin/session', {signal: AbortSignal.timeout(4000)});
  if (response.status !== 401) {
    throw new Error(`The API on port 4000 is incompatible (admin session returned ${response.status}, expected 401). Stop the old Poostikal API and run npm run dev again.`);
  }
}
const webHost = '127.0.0.1';
const webPort = 7777;
const webUrl = `http://${webHost}:${webPort}`;
function webPortIsOpen() {
  return new Promise(available => {
    const socket = connect({host:webHost, port:webPort});
    const finish = open => { socket.destroy(); available(open); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}
async function reuseStorefront() {
  if (!await webPortIsOpen()) return false;
  try {
    // A cold Next.js homepage can take longer to compile than the health probe.
    const response = await fetch(webUrl + '/api/health', {
      signal:AbortSignal.timeout(12000), redirect:'error',
    });
    if (response.ok) {
      const health = await response.json();
      if (health.status === 'ok' && health.database === 'postgresql') return true;
    }
  } catch { /* An open socket alone does not identify a healthy Poostikal frontend. */ }
  throw new Error(`Port ${webPort} is occupied, but Poostikal's health check did not respond. Check the process using ${webUrl} before starting another server.`);
}
if(!await healthy('http://127.0.0.1:4000/api/health')){
  const database=start(['scripts/database.mjs'],resolve(root,'backend'),['inherit','pipe','inherit']);
  await new Promise((accept,reject)=>{const timer=setTimeout(()=>reject(new Error('Database startup timed out')),60000);database.stdout.on('data',data=>{process.stdout.write(data);if(String(data).includes('PostgreSQL is ready')){clearTimeout(timer);accept();}});database.on('error',reject);database.on('exit',code=>{if(code)reject(new Error('Database failed to start'));});});
  const compile=start(['node_modules/typescript/bin/tsc','-p','tsconfig.json'],resolve(root,'backend'));
  if(await new Promise(r=>compile.on('exit',r)))throw new Error('Backend compilation failed');
  start(['--watch','--env-file=.env','dist/main.js'],backend,'inherit',{...process.env,REDIS_URL:redisUrl});await waitFor('http://127.0.0.1:4000/api/health');
}
await checkAdminApi();
if (await reuseStorefront()) log(`Poostikal is already running at ${webUrl}`);
else start(['node_modules/next/dist/bin/next','dev','--hostname',webHost,'--port',String(webPort)]);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{children.forEach(child=>{if(child.exitCode===null)child.kill();});process.exit(0);});
