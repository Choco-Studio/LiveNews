import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { NewsDesk } from './news.js';
import { ImageCache } from './images.js';
import { createProviders, ProviderChain } from './providers/index.js';
import { UsageTracker } from './usage.js';
import { Station } from './station.js';
import { Producer } from './producer.js';
import { createVoiceService } from './voice/index.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const usage = new UsageTracker(config.dataDir);
const newsDesk = new NewsDesk();
// Pictures of local (offline fixture) feeds are served from their own folders only.
const images = new ImageCache({ localRoots: () => newsDesk.localImageRoots });
const chain = new ProviderChain(createProviders(config), usage);
// Neural presenter voices (VOICE_ENGINE=kokoro), synthesised ahead of air; browser voices otherwise.
const voice = createVoiceService(config, { root: ROOT });
const producer = new Producer({ config, newsDesk, chain, voice });
const station = new Station({ config, newsDesk, producer, chain });

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return sendJson(res, 400, { error: 'bad request' });
  }
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, body) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  });
}

function serveEvents(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('ticker', station.ticker());
  send('status', station.status());
  send('schedule', station.schedule());
  const off = station.on(send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    off();
    clearInterval(ping);
  });
}

async function serveImage(res, id) {
  const story = newsDesk.get(id);
  if (!story?.image) return sendJson(res, 404, { error: 'no image' });
  const entry = await images.get(id, story.image);
  // The detail (paths, upstream errors) stays in the server log; the client only learns it failed.
  if (entry.error) return sendJson(res, 502, { error: 'image unavailable' });
  res.writeHead(200, {
    'content-type': entry.type,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  res.end(entry.body);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const devAllowed = (req) => /^(1|true|yes|on)$/i.test(process.env.DEV_ENDPOINTS || '') || LOOPBACK.has(req.socket.remoteAddress);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/next') {
      const item = station.next(url.searchParams.get('after'));
      return item ? sendJson(res, 200, item) : sendJson(res, 202, { standby: true, status: station.status() });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return serveEvents(req, res);
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, { ...station.status(), usage: usage.summary(), schedule: station.schedule() });
    }
    if (req.method === 'GET' && url.pathname === '/api/channel') return sendJson(res, 200, station.publicChannel());
    if (req.method === 'GET' && url.pathname === '/api/schedule') return sendJson(res, 200, station.schedule());
    // Editorial dev views (lab pages, debugging): what the desk holds and what is queued, without advancing
    // the channel. Upcoming scripts are not for the public: loopback only, unless DEV_ENDPOINTS=1.
    if (req.method === 'GET' && (url.pathname === '/api/desk' || url.pathname === '/api/queue')) {
      if (!devAllowed(req)) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, url.pathname === '/api/desk' ? newsDesk.deskView() : station.queue);
    }
    // Recorded voices: /api/voice/<id>.ogg|.json (content-addressed clips), /api/voice/ads, /api/voice/status.
    if (req.method === 'GET' && url.pathname.startsWith('/api/voice/') && voice.handle(req, res, url.pathname)) return;
    const img = url.pathname.match(/^\/api\/img\/(s[0-9a-f]{10})$/);
    if (req.method === 'GET' && img) return await serveImage(res, img[1]);
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      await station.refreshNews();
      station.fill().catch(() => {});
      return sendJson(res, 200, station.status());
    }
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
  }
});

async function loop() {
  const due = Date.now() - newsDesk.lastRefresh > config.feedRefreshMinutes * 60_000;
  if (due) await station.refreshNews();
  await station.fill();
}

server.listen(config.port, config.host, () => {
  console.log(`📺 ${station.publicChannel().name} on air at http://${config.host}:${config.port}`);
  // The mock writes but never reviews: say so rather than promise an editor that is not there.
  const editor = chain.providers.some((p) => p.reviews !== false);
  const review = !config.reviewPass ? '' : editor ? ' (with editorial review pass)' : ' (review pass: no AI editor configured)';
  console.log(`   AI providers: ${config.providers.join(' → ')}${review}`);
  loop();
  setInterval(() => loop().catch((e) => console.error(e)), 60_000);
});
