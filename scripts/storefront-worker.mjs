import http from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';
import { error as logError } from 'node:console';
import { createProxyServer } from 'http-proxy-3';
import { publicResponses } from './public-responses.mjs';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 7777);
const origin = 'http://' + host + ':' + process.env.POOSTIKAL_RENDER_PORT;
const agent = new http.Agent({ keepAlive: true, maxFreeSockets: 64 });
const proxy = createProxyServer({ target: origin, agent });
const servePublic = publicResponses({
  origin, api: (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, ''),
  canonicalHost: new URL(process.env.SITE_URL || 'https://poostikal.ir').host, agent,
});
function upstreamError(_error, _req, res) {
  if (res.destroyed) return;
  if (!res.writeHead || res.headersSent) { res.destroy(); return; }
  res.writeHead(502, { 'Cache-Control': 'no-store' });
  res.end();
}
proxy.on('error', upstreamError);
const listener = http.createServer(async (req, res) => {
  try { if (await servePublic(req, res)) return; }
  catch { /* An unavailable validator or render falls back to the live application. */ }
  if (!res.destroyed) proxy.web(req, res);
});
listener.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});
listener.keepAliveTimeout = 65000;
listener.headersTimeout = 66000;
listener.on('error', error => { logError(error.message); process.exit(1); });
listener.listen({ port, host, backlog: 2048 });
process.on('disconnect', () => {
  listener.close();
  listener.closeAllConnections();
  agent.destroy();
  process.exit(0);
});

