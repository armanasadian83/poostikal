import { existsSync, mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { delimiter, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import process from 'node:process';

const host = '127.0.0.1';
const port = 56379;
export const localRedisUrl = `redis://${host}:${port}`;

function ping() {
  return new Promise(resolve => {
    const socket = connect({ host, port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(500, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('close', () => resolve(false));
    socket.once('connect', () => socket.write('PING\r\n'));
    let reply = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      reply += chunk;
      if (reply.includes('\r\n') || reply.length > 32) finish(reply === '+PONG\r\n');
    });
  });
}

function findRedis(root) {
  const windows = process.platform === 'win32';
  const filenames = windows ? ['memurai.exe', 'redis-server.exe', 'valkey-server.exe'] : ['redis-server', 'valkey-server'];
  const directories = [resolve(root, '.data/redis-bin/server')];
  if (windows && process.env.ProgramFiles) directories.push(resolve(process.env.ProgramFiles, 'Memurai'));
  directories.push(...(process.env.PATH || '').split(delimiter).filter(Boolean));
  return directories.flatMap(directory => filenames.map(filename => resolve(directory, filename))).find(existsSync);
}

export async function ensureLocalRedis(root, launch) {
  if (await ping()) return true;
  const executable = findRedis(root);
  if (!executable) return false;
  const state = resolve(root, '.data/redis');
  mkdirSync(state, { recursive: true });
  const child = launch(executable, [
    '--bind', host, '--port', String(port), '--protected-mode', 'yes',
    '--save', '', '--appendonly', 'no', '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction',
  ], state);
  let failed = false;
  child.once('error', () => { failed = true; });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await ping()) return true;
    if (failed || child.exitCode !== null) break;
    await pause(100);
  }
  return false;
}
