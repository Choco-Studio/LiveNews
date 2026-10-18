import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, configWarnings, ROOT } from './config.js';
import { findPlaces } from './gazetteer.js';
import { NewsDesk } from './news.js';
import { ArticleCache } from './articlecache.js';
import { ImageCache } from './images.js';
import { createProviders, ProviderChain } from './providers/index.js';
import { UsageTracker } from './usage.js';
import { Station } from './station.js';
import { loadChannel, withDraftsOnAir } from './channel.js';
import { Producer } from './producer.js';
import { createVoiceService } from './voice/index.js';
import { ImageSearch } from './imagesearch.js';
import { WeatherDesk } from './weather.js';
import { writeWeather } from './weatherwriter.js';
import { FootageDesk } from './footage.js';
import { IdentityDesk } from './guests/identity.js';
import { configureRestage } from './guests/restage.js';
import { sharedRegister } from './compliance/registry.js';
import { startElectionCalendar, loadCalendar } from './compliance/elections.js';
import { Archive } from './archive.js';
import { PictureDesk } from './picturedesk.js';
import { FaceStore } from './faces.js';
import { FaceReader } from './facereader.js';
import { WikimediaClient, wikimediaAgent } from './wikimedia.js';
import { OpenverseClient } from './openverse.js';
import { airable } from './rights.js';

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
// Real photos for stories still without one: a FILE photo of the story's place (Wikimedia Commons by default)
// One polite queue for every Wikimedia service the picture desks ask (server/wikimedia.js: its limits are per client)
const wikimedia = new WikimediaClient({ contact: config.pictures.contact });
// The FILE-photo search (Wikimedia Commons by default): the rights desk's last source, and the orchestrator's tool
const imageSearch = new ImageSearch({ ...config.imageSearch, wikimedia });
// The rights desk (docs/pictures/RIGHTS.md): only pictures the channel may publish air, each with its rights record.
// The outlets' own photos stand in only in a PRIVATE preview (PICTURE_RIGHTS=preview), marked on screen.
// (a grave story's portrait airs only once the face reader, tools/pictures/faces.mjs, read it as sober: the desk
// queues the pictures it needs read in data/pictures/faces-queue.json and reads the verdicts in faces.json)
const faces = new FaceStore({ dir: config.pictures.dir });
// the face reader itself, run as a child process and started again if it stops (FACE_READER=off: never started)
const faceReader = new FaceReader({ dir: config.pictures.dir, enabled: config.pictures.faceReader && config.pictures.desk }).exitWithStation();
// (institutions' own Flickr pictures through Openverse, anonymously, within its announced limits: server/openverse.js)
const openverse = config.pictures.openverse ? new OpenverseClient({ agent: wikimediaAgent(config.pictures.contact), perDay: config.pictures.openverseDaily }) : null;
const pictureDesk = new PictureDesk({ dir: config.pictures.dir, wikimedia, search: imageSearch, faces, openverse, mode: config.pictures.rights, enabled: config.pictures.desk });
if (config.pictures.rights === 'preview') console.warn('[pictures] PRIVATE PREVIEW (PICTURE_RIGHTS=preview): outlet photos may air marked NOT CLEARED; never publish this output');
// Pictures of local (offline fixture) feeds are served from their own folders only.
const images = new ImageCache({ localRoots: () => newsDesk.localImageRoots, contact: config.pictures.contact });
const chain = new ProviderChain(createProviders(config), usage);
// Neural presenter voices (VOICE_ENGINE=kokoro), synthesised ahead of air; browser voices otherwise.
const voice = createVoiceService(config, { root: ROOT });
// The ImageCache is shared: the producer verifies (and warms) each picture before air, the client reads it.
// WORLD WEATHER's data: Open-Meteo + GDACS, or the demo data while the desk runs on the offline fixture feeds
const weather = new WeatherDesk({
  source: config.weather.source,
  offline: () => newsDesk.localOnly,
  warnings: config.weather.warnings,
  ttlMs: config.weather.ttlMinutes * 60_000,
  // the heat map's grid within Open-Meteo's free tier: 120 places every 20 s (the sky's hours make each answer heavier), a minute's wait after a 429,
  // and the forecast never waits more than 2 s for it (it joins the report when it lands)
  fieldPauseMs: 20_000,
  fieldRetryMs: 65_000,
  fieldWaitMs: 2_000,
});
// Footage of the correspondent links' places (server/footage.js): on with live feeds, off on the offline fixture feeds
const footage = new FootageDesk({
  dir: config.footage.dir,
  maxCacheBytes: config.footage.cacheMb * 1024 * 1024,
  enabled: config.footage.mode === 'on' || (config.footage.mode === 'auto' && !/feeds\.fixture\.json$/.test(config.feedsFile)),
});
// IN THEIR WORDS, re-staged: who a named speaker is (Wikidata, cached), and the audit of every re-staged line
const identity = new IdentityDesk({ dir: path.join(config.dataDir, 'guests', 'identity') });
// ...and the compliance holds (docs/publishing/compliance.md §5): the election calendar (read from Wikidata every
// day) and the register of takedowns and of people who asked not to be re-staged
const compliance = sharedRegister(config.dataDir);
startElectionCalendar({ dataDir: config.dataDir });
configureRestage({ calendar: () => loadCalendar({ dataDir: config.dataDir }), blocked: (who) => compliance.isBlocked(who) });
const audit = (entry) => {
  try {
    fs.mkdirSync(path.join(config.dataDir, 'guests'), { recursive: true });
    fs.appendFileSync(path.join(config.dataDir, 'guests', 'audit.jsonl'), `${JSON.stringify(entry)}\n`);
  } catch { /* the audit never stops the show */ }
};
// the channel's memory of what it aired (14 days, data/archive): SEVEN DAYS is written from it, and a story the
// desk has let go keeps its picture for the weekly
// (pictures: an archived picture airs again only with its cleared rights record; the outlet photos of older entries
// stay in a private preview)
// the article cache: what the news desk already read for each story it airs (never a fetch of its own), except the
// feeds marked "cache": false
const uncachedFeeds = (() => {
  try {
    const doc = JSON.parse(fs.readFileSync(config.feedsFile, 'utf8'));
    return new Set((Array.isArray(doc) ? doc : doc?.feeds || []).filter((f) => f?.cache === false).map((f) => f.name));
  } catch {
    return new Set();
  }
})();
const articles = config.articleCache ? new ArticleCache({ dir: path.join(config.dataDir, 'compliance', 'articles'), skip: (s) => uncachedFeeds.has(s?.source) }) : null;
const archive = new Archive({ dir: path.join(config.dataDir, 'archive'), pictures: config.pictures.rights, articles });
newsDesk.archive = archive;
const producer = new Producer({ config, newsDesk, chain, voice, images, weather, footage, identity, audit, archive, pictureDesk, gate: config.playout ? (episode) => playoutGate(episode) : null });
// Pre-rendered playout (PLAYOUT=1, tools/playout/station.mjs): every episode passes the check before air when it is
// made (server/playout/gate.js: the compliance desk's preflight for the stream); what fails is held, recorded in
// data/playout/held/ (the approval page lists it) and never queued. Loaded only in playout mode: the live channel's
// server loads exactly what it always did.
const { airGate, gateOptionsFromEnv } = config.playout ? await import('./playout/gate.js') : {};
const { PlayoutStore } = config.playout ? await import('./playout/queue.js') : {};
const publishCompliance = config.playout ? await import('./publish/compliance.js') : null;
const playoutStore = config.playout ? new PlayoutStore(config.playoutDir) : null;
const gateOpts = config.playout ? gateOptionsFromEnv() : {};
// (the verbatim rule's sources: the desk's own story, its title and summary, and the article the desk read for it)
const gateStory = (id) => {
  const s = newsDesk.get(id);
  return s ? { title: s.title || '', summary: s.summary || '', body: articles?.text?.(s.link) || null } : null;
};
const playoutGate = config.playout
  ? (episode) => airGate(episode, { ...gateOpts, getStory: gateStory, register: publishCompliance.register(config.dataDir), dataDir: config.dataDir, now: Date.now() })
  : null;
// (with a rule relaxed for a test, PLAYOUT_VERBATIM=warn or PLAYOUT_REVIEW=0: what the strict check would have held is
// logged all the same, so a test says how much of the day the full rules keep off air)
const strictGate = (episode) => {
  const v = playoutGate(episode);
  if (v.ok && (gateOpts.verbatim !== 'block' || !gateOpts.requireReview)) {
    const strict = airGate(episode, { verbatim: 'block', requireReview: true, getStory: gateStory, register: publishCompliance.register(config.dataDir), dataDir: config.dataDir, now: Date.now() });
    if (!strict.ok) playoutStore?.event('strict-would-hold', { id: episode.id, programme: episode.program?.title, rules: [...new Set(strict.violations.map((x) => x.rule))] });
  }
  return v;
};
const onHeld = (episode, verdict) => {
  playoutStore?.hold({ id: episode.id, stage: 'production', airAt: Date.now(), programId: episode.program?.id, title: episode.program?.title, violations: verdict.violations, warnings: verdict.warnings, skipped: verdict.skipped, files: [] });
  playoutStore?.event('held', { stage: 'production', id: episode.id, programme: episode.program?.title, rules: (verdict.violations || []).map((v) => v.rule) });
};
// (DRAFTS_ON_AIR: a draft programme on air for a test or a recording, never the official line-up)
const station = new Station({ config, newsDesk, producer, chain, gate: config.playout ? strictGate : null, onHeld, ...(config.draftsOnAir.length ? { channel: () => withDraftsOnAir(loadChannel(), config.draftsOnAir) } : {}) });
if (config.playout) console.warn(`[playout] pre-rendered playout: the station runs on the air clock; check before air (verbatim ${gateOpts.verbatim}, recreation review ${gateOpts.requireReview ? 'required' : 'not required'})`);
if (config.draftsOnAir.length) console.warn(`[channel] test mode: drafts on air: ${config.draftsOnAir.join(', ')}`);

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
  // a NUL in a path is a client's mistake (or a probe), never a file: 400, not a 500 with a stack trace
  if (rel.includes('\0')) return sendJson(res, 400, { error: 'bad request' });
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
  // a PAY ATTENTION picture as the producer fetched it for an edition: its story may be days old and gone from the desk,
  // or on it with other candidates (the director preloads it from here)
  const kept = producer.quizPicture(id);
  const story = kept ? null : newsDesk.get(id);
  // (only a picture the channel may publish: its cleared rights record is for that very picture; a private preview
  // also serves an outlet's photo. The desk's kept decision goes back on first: a feed refresh may have lent the story
  // an outlet's photo since the episode was made)
  if (story) pictureDesk.apply(story);
  if (!kept && !(story?.image && airable(story, { mode: config.pictures.rights }))) return sendJson(res, 404, { error: 'no image' });
  const entry = kept || (await images.get(id, story.images || [story.image]));
  // The detail (paths, upstream errors) stays in the server log; the client only learns it failed.
  if (entry.error) return sendJson(res, 502, { error: 'image unavailable' });
  res.writeHead(200, {
    'content-type': entry.type,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  res.end(entry.body);
}

/** A kept footage clip (/api/vid/<id>.webm), with byte ranges: the client seeks to the clip's start. */
function serveFootage(req, res, id) {
  const file = footage.file(id);
  if (!file) return sendJson(res, 404, { error: 'no footage' });
  const size = fs.statSync(file).size;
  const head = { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (!(start <= end && start < size)) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  fs.createReadStream(file).pipe(res);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// The Host a loopback request names must be a loopback name too: a DNS-rebinding page in the browser that runs
// OBS reaches 127.0.0.1 under its own host name, and must not read upcoming scripts.
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
// Dev views answer on loopback only (or with DEV_ENDPOINTS=1). Behind a same-host reverse proxy every request
// arrives from loopback, so a forwarded request is never trusted as local.
const devAllowed = (req) =>
  /^(1|true|yes|on)$/i.test(process.env.DEV_ENDPOINTS || '') ||
  (LOOPBACK.has(req.socket.remoteAddress) && LOCAL_HOST.test(req.headers.host || '') && !req.headers['x-forwarded-for'] && !req.headers.forwarded && !req.headers['x-real-ip']);
// A manual refresh re-reads every feed: at most one every 30 s, and only from where the dev views are allowed.
const REFRESH_MIN_MS = 30_000;
let lastManualRefresh = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/next') {
      // playout: the renderer says what time it is on air (`air`, ms) and waits for a finished programme
      if (config.playout && globalThis.__airClock && devAllowed(req) && url.searchParams.has('air')) globalThis.__airClock.set(Number(url.searchParams.get('air')));
      const item = config.playout && devAllowed(req) ? await station.nextReady(url.searchParams.get('after'), { timeoutMs: Math.max(0, Number(process.env.PLAYOUT_WAIT_S ?? 900)) * 1000 }) : station.next(url.searchParams.get('after'));
      return item ? sendJson(res, 200, item) : sendJson(res, 202, { standby: true, status: station.status() });
    }
    // playout: the renderer moves the air clock on as it renders (loopback only)
    if (req.method === 'POST' && url.pathname === '/api/playout/clock') {
      if (!config.playout || !globalThis.__airClock || !devAllowed(req)) return sendJson(res, 404, { error: 'not found' });
      if (url.searchParams.has('t')) globalThis.__airClock.set(Number(url.searchParams.get('t')));
      return sendJson(res, 200, globalThis.__airClock.state());
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return serveEvents(req, res);
    if (req.method === 'GET' && url.pathname === '/api/status') {
      // provider usage (calls, tokens, the last provider error) is for the operator, from where dev views are allowed
      return sendJson(res, 200, { ...station.status(), ...(devAllowed(req) ? { usage: usage.summary() } : {}), schedule: station.schedule() });
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
    // The orchestrator's picture tool: free-licensed file photos for a query (operator / orchestrator only)
    if (req.method === 'GET' && url.pathname === '/api/tools/image-search') {
      if (!devAllowed(req)) return sendJson(res, 404, { error: 'not found' });
      const q = String(url.searchParams.get('q') || '').slice(0, 120);
      if (!q.trim()) return sendJson(res, 400, { error: 'q is required' });
      if (!imageSearch.enabled) return sendJson(res, 503, { error: 'image search is off (IMAGE_SEARCH)' });
      return sendJson(res, 200, { query: q, results: (await imageSearch.search(q)).slice(0, 8) });
    }
    const img = url.pathname.match(/^\/api\/img\/(s[0-9a-f]{10})$/);
    if (req.method === 'GET' && img) return await serveImage(res, img[1]);
    const vid = url.pathname.match(/^\/api\/vid\/(f[0-9a-f]{16})\.webm$/);
    if (req.method === 'GET' && vid) return serveFootage(req, res, vid[1]);
    // WORLD WEATHER's data and the script it gives (lab/weather.html, dev views only)
    if (req.method === 'GET' && url.pathname === '/api/tools/weather') {
      if (!devAllowed(req)) return sendJson(res, 404, { error: 'not found' });
      const report = await weather.report();
      if (!report) return sendJson(res, 503, { error: `no weather data (${weather.lastError || weather.source})` });
      return sendJson(res, 200, { source: weather.source, report, script: writeWeather(report, { channelName: station.publicChannel().name }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (!devAllowed(req)) return sendJson(res, 404, { error: 'not found' });
      if (Date.now() - lastManualRefresh < REFRESH_MIN_MS) return sendJson(res, 429, { error: 'refreshed recently', status: station.status() });
      lastManualRefresh = Date.now();
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

// A 24/7 daemon logs what slipped through and keeps serving: one unexpected rejection or throw in a background
// path (a refresh, a fill, a voice job) must not take the channel off the air.
process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('[server] uncaught exception:', err));
for (const w of configWarnings) console.warn(`[config] ${w}`);
// The gazetteer builds its place index on first use (about a second): done before the first request and refresh.
findPlaces('Warm-up in London');

server.listen(config.port, config.host, () => {
  faceReader.start();
  console.log(`📺 ${station.publicChannel().name} on air at http://${config.host}:${config.port}`);
  // The mock writes but never reviews: say so rather than promise an editor that is not there.
  const editor = chain.providers.some((p) => p.reviews !== false);
  const review = !config.reviewPass ? '' : editor ? ' (with editorial review pass)' : ' (review pass: no AI editor configured)';
  console.log(`   AI providers: ${config.providers.join(' → ')}${review}`);
  loop().catch((e) => console.error(e));
  setInterval(() => loop().catch((e) => console.error(e)), 60_000);
});
