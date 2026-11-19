import http from 'node:http';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';

/* global fetch, AbortController, AbortSignal */
const publicPage = /^\/(?:$|shop$|brands$|products\/[^/?]+$)/;
const publicData = /^\/api\/(?:catalog|theme|site-settings|products(?:\/[^/?]+)?)$/;
const buildAsset = /^\/_next\/static\/[a-zA-Z0-9_./~-]+$/;
const catalogImage = /^\/_next\/image\?url=%2Fapi%2Fmedia%2F[a-f0-9-]{36}\.webp&w=\d{2,4}&q=(?:75|95)$/i;
const simpleQuery = /^(?:(?:page=\d{1,4}|limit=\d{1,3}|category=all|sort=(?:low|high|featured))(?:&|$)){1,4}$/;
const maxEntry = 1024 * 1024;
const maxBytes = 48 * 1024 * 1024;
const maxEntries = 512;
const bypassHeaders = ['authorization','range','if-range','if-match','if-none-match','if-modified-since','if-unmodified-since',
  'rsc','next-url','next-action','next-router-state-tree','next-router-prefetch','next-router-segment-prefetch',
  'x-prerender-revalidate','x-nextjs-data','upgrade','transfer-encoding','content-length'];
const shopperCookie = /^(?:poostikal_customer=[A-Za-z0-9_-]{43}|poostikal_customer_scope=2)$/;

function representation(req) {
  if (req.method !== 'GET' || req.url.length > 2400) return;
  const image = catalogImage.test(req.url);
  if (!image && /\\|#|\.\.|%(?:2f|5c|2e|00)/i.test(req.url)) return;
  const [path, query, extra] = req.url.split('?');
  const asset = image || buildAsset.test(path);
  if (!asset && !(publicPage.test(path) || publicData.test(path))) return;
  // The public catalog UI hydrates account/cart state separately. Preview and
  // unrecognized cookies use Next directly. No shopper cookie is forwarded to a fill.
  if (!asset && req.headers.cookie && !req.headers.cookie.split(/;\s*/).every(cookie => shopperCookie.test(cookie))) return;
  if (extra !== undefined || (!image && query && (asset || !simpleQuery.test(query)))) return;
  if (bypassHeaders.some(name => req.headers[name] !== undefined) || /text\/x-component/i.test(req.headers.accept || '')) return;
  // Less common encodings and explicit quality preferences keep normal HTTP negotiation.
  const accepted = req.headers['accept-encoding'] || '';
  if (accepted.includes(';') || (accepted && !/(?:^|,)\s*(?:gzip|identity)\s*(?:,|$)/i.test(accepted))) return;
  const encoding = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(accepted) ? 'gzip' : 'identity';
  const accept = image ? (req.headers.accept || '*/*') : '*/*';
  if (accept.length > 256) return;
  return { asset, image, encoding, accept };
}

// All fills use a fixed local upstream and construct their own headers. Cookies,
// Next navigation state, forwarding headers and credentials never reach a fill.
async function loadPublic(origin, path, kind, agent, canonicalHost, signal) {
  const response = await new Promise((resolve, reject) => {
    const request = http.get(origin + path, {
      agent, headers: { Host: canonicalHost, Accept: kind.accept, 'Accept-Encoding': kind.encoding, 'User-Agent': 'Twitterbot/1.0' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    }, resolve);
    request.on('error', reject);
  });
  const h = response.headers;
  const policy = h['cache-control'] || '';
  const imageLifetime = kind.image && /\bpublic\b/.test(policy) && !/no-store|no-cache|private/i.test(policy)
    && h['content-type']?.startsWith('image/') ? Number(policy.match(/\bmax-age=(\d+)/i)?.[1] || 0) : 0;
  const optedIn = kind.image ? imageLifetime > 0 : kind.asset ? /\bimmutable\b/.test(policy) : h['x-poostikal-public'] === '1';
  if (response.statusCode !== 200 || !optedIn || h['set-cookie'] || h.vary?.includes('*') || Number(h['content-length']) > maxEntry) {
    response.destroy();
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > maxEntry) return;
    chunks.push(chunk);
  }
  if (!size || !response.complete) return;
  const headers = { ...h, 'content-length': String(size) };
  for (const name of ['connection','transfer-encoding','keep-alive','date','x-poostikal-public']) delete headers[name];
  const lifetime = kind.image ? Math.min(imageLifetime, 86400) : kind.asset ? 86400 : 30;
  return { headers, body: Buffer.concat(chunks, size), expires: Date.now() + lifetime*1000 };
}

export function publicResponses({ origin, api, canonicalHost, agent }) {
  const entries = new Map();
  const fills = new Map();
  const waiters = [];
  let activeFills = 0;
  let bytes = 0;
  let nextRead;
  function revision() {
    if (!nextRead) nextRead = new Promise((resolve, reject) => {
      setTimeout(async () => {
        // Only share the check among callers that arrived before it started.
        nextRead = undefined;
        try {
          const reply = await fetch(api + '/api/storefront-revision', { signal: AbortSignal.timeout(2000), redirect: 'error' });
          const token = reply.headers.get('x-storefront-revision');
          if (reply.status !== 204 || !/^[a-f0-9-]{36}$/.test(token || '')) throw Error('Revision unavailable');
          resolve(token);
        } catch (error) { reject(error); }
      }, 2);
    });
    return nextRead;
  }
  function remove(key) {
    const entry = entries.get(key);
    if (entry) { bytes -= entry.body.length; entries.delete(key); }
  }
  async function fill(key, path, kind, signal) {
    if (activeFills < 24) activeFills++;
    else await new Promise(resolve => waiters.push(resolve));
    let entry;
    try {
      if (signal.aborted) return;
      entry = await loadPublic(origin, path, kind, agent, canonicalHost, signal);
    }
    finally {
      const next = waiters.shift();
      if (next) next();
      else activeFills--;
    }
    if (entry) {
      remove(key);
      entries.set(key, entry);
      bytes += entry.body.length;
      while (bytes > maxBytes || entries.size > maxEntries) remove(entries.keys().next().value);
    }
    return entry;
  }
  return async function serve(req, res) {
    const kind = representation(req);
    if (!kind) return false;
    const version = kind.asset ? 'build' : await revision();
    if (res.destroyed) return true;
    const key = JSON.stringify([version, kind.encoding, kind.accept, req.url]);
    let entry = entries.get(key);
    if (!entry || entry.expires <= Date.now()) {
      let pending = fills.get(key);
      if (!pending) {
        // Keep cold renders from consuming the whole origin during an unfamiliar-URL spike.
        // Hits and all protected routes run independently of this queue.
        if (fills.size >= 256) {
          res.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '1' });
          res.end();
          return true;
        }
        const controller = new AbortController();
        pending = { controller, readers: 0, result: fill(key, req.url, kind, controller.signal).finally(() => fills.delete(key)) };
        fills.set(key, pending);
      }
      pending.readers++;
      const disconnected = () => {
        if (--pending.readers === 0) pending.controller.abort();
      };
      res.once('close', disconnected);
      try { entry = await pending.result; }
      finally {
        res.off('close', disconnected);
        if (!res.destroyed) pending.readers--;
      }
    }
    if (!entry) return false;
    if (!res.destroyed) { res.writeHead(200, entry.headers); res.end(entry.body); }
    return true;
  };
}
