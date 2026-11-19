import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { error as logError, log } from 'node:console';
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const project = fileURLToPath(new URL('../', import.meta.url));
const standalone = resolve(project, '.next/standalone');
const server = resolve(standalone, 'server.js');
if (!existsSync(server)) {
  logError('Run npm run build before npm start.');
  process.exit(1);
}
// Next's standalone server needs these generated/static assets beside it.
cpSync(resolve(project, 'public'), resolve(standalone, 'public'), { recursive: true });
cpSync(resolve(project, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
const host = '127.0.0.1';
const port = Number(process.env.PORT || 7777);
const reservation = net.createServer();
reservation.listen(0, host);
await once(reservation, 'listening');
const renderPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));

const child = spawn(process.execPath, [server], {
  env: { ...process.env, HOSTNAME: host, PORT: String(renderPort) }, stdio: 'inherit', windowsHide: true,
});
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const worker of Object.values(cluster.workers)) worker?.kill();
  child.kill();
  process.exitCode = code;
}
child.once('exit', code => stop(code || 1));
child.once('error', error => { logError(error.message); stop(1); });
for (const sig of ['SIGINT','SIGTERM']) process.once(sig, () => stop(0));
process.on('exit', () => child.kill());

// Wait for the renderer before advertising the public listener.
let ready = false;
for (let attempt=0; attempt<200 && !ready && !stopping; attempt++) {
  const socket = net.connect(renderPort, host);
  ready = await new Promise(resolve => {
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (!ready) await pause(100);
}
if (!ready) {
  if (!stopping) { logError('Storefront renderer could not start.'); stop(1); }
} else if (!stopping) {
  cluster.schedulingPolicy = cluster.SCHED_RR;
  cluster.setupPrimary({ exec: resolve(project, 'scripts/storefront-worker.mjs'), windowsHide: true });
  const startWorker = () => cluster.fork({ POOSTIKAL_RENDER_PORT: String(renderPort) });
  const count = availableParallelism() >= 4 ? 2 : 1;
  for (let i=0; i<count; i++) startWorker();
  let lastFailure = 0;
  cluster.on('exit', (_worker, code) => {
    if (stopping) return;
    // Exit on repeated startup failures so the deployment supervisor can report them.
    if (Date.now()-lastFailure < 10000) { stop(code || 1); return; }
    lastFailure = Date.now();
    startWorker();
  });
  cluster.once('listening', () => log('Poostikal storefront listening on http://' + host + ':' + port));
}

