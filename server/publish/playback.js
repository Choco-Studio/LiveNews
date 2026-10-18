// The publishing desk's playback server: the channel's page and one saved episode, served to the deterministic
// recorder (tools/record.mjs) with nothing else running. The live server (server/index.js) produces programmes,
// reads feeds and synthesises voices while it serves, and its event loop can stall for half a minute on a busy
// production; a recording only needs the page, the channel, the episode, its recorded voices and its pictures.
// Everything here is local: no feed, no network, no voice engine. Unknown /api paths answer 404, and the episode is
// served once, then the station stands by (the recorder stops at the clip's end).
//
//   const pb = createPlaybackServer({ items: [episode], voiceDir, pictureDir, stream });
//   `stream` (public/js/airmode.js streamOf): what the recorded page may say about where the channel airs: its end card
//   says LIVE only for 'live', "24 hours a day" for 'recorded', nothing for 'none' (the default: no stream, no claim)
//   await pb.listen(8797);  ...  pb.close();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const VOICE_ID = /^\/api\/voice\/(v[0-9a-f]{20})\.(ogg|json)$/;
const IMG_ID = /^\/api\/img\/(s[0-9a-f]{10})$/;

/** The page's view of the channel (server/channel.js publicChannel), drafts included so every cast is known. */
export async function channelView(root = ROOT, { stream = 'none' } = {}) {
  const { loadChannel, publicChannel } = await import(path.join(root, 'server', 'channel.js'));
  const s = stream === 'live' || stream === 'recorded' ? stream : 'none';
  return { ...publicChannel(loadChannel(undefined, { drafts: true })), stream: s, ...(s === 'recorded' ? { airMode: 'recorded' } : {}) };
}

/** A voice clip's timing as the client reads it (server/voice/plan.js clientAudio), from the cache's own metadata. */
export function voiceMeta(dir, id) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    return { url: `/api/voice/${id}.ogg`, duration: meta.duration, words: meta.words || [], phrases: meta.phrases || [], ...(meta.levels ? { levels: meta.levels } : {}) };
  } catch {
    return null;
  }
}

export function createPlaybackServer({ root = ROOT, items = [], voiceDir = path.join(root, 'data', 'voice'), pictureDir = null, channel = null, ticker = [], log = () => {}, stream = 'none' } = {}) {
  const pub = path.join(root, 'public');
  const queue = items.slice();
  const served = [];
  let channelJson = channel;

  const send = (res, status, body, type = MIME['.json']) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const file = (res, f, type) => {
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': type || MIME[path.extname(f)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
      fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
    });
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'read only' });
      if (p === '/api/channel') {
        channelJson ||= await channelView(root, { stream });
        return send(res, 200, channelJson);
      }
      if (p === '/api/next') {
        const after = url.searchParams.get('after');
        // the item after the one named, if it was served (a reload asks again), else the next unserved one
        const idx = after ? served.findIndex((x) => x.id === after) : -1;
        if (idx >= 0 && idx < served.length - 1) return send(res, 200, served[idx + 1]);
        const item = queue.shift();
        if (!item) return send(res, 202, { standby: true });
        served.push(item);
        log(`[playback] on air: ${item.program?.title || item.kind} ${item.id}`);
        return send(res, 200, item);
      }
      if (p === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: ticker\ndata: ${JSON.stringify(ticker)}\n\n`);
        res.write(`event: schedule\ndata: ${JSON.stringify({ now: null, upcoming: [] })}\n\n`);
        return undefined; // held open, as the live server's
      }
      if (p === '/api/voice/ads') return send(res, 200, []);
      if (p === '/api/voice/status') return send(res, 200, { enabled: false, queue: 0 });
      const v = VOICE_ID.exec(p);
      if (v) {
        if (v[2] === 'json') {
          const meta = voiceMeta(voiceDir, v[1]);
          return meta ? send(res, 200, meta) : send(res, 404, { error: 'not ready' });
        }
        return file(res, path.join(voiceDir, `${v[1]}.ogg`), MIME['.ogg']);
      }
      const im = IMG_ID.exec(p);
      if (im) {
        if (!pictureDir) return send(res, 404, { error: 'no image' });
        for (const ext of ['.jpg', '.png', '.webp']) {
          const f = path.join(pictureDir, `${im[1]}${ext}`);
          if (fs.existsSync(f)) return file(res, f);
        }
        return send(res, 404, { error: 'no image' });
      }
      if (p === '/api/schedule') {
        // what is on: the last episode served (the live supervisor's title follows it), and what is queued
        const cur = served.at(-1);
        const meta = (it) => ({ id: it.program?.id || null, title: it.program?.title || null, tagline: it.program?.tagline || null });
        return send(res, 200, { now: cur?.program ? { kind: 'episode', ...meta(cur) } : null, upcoming: queue.filter((x) => x.program).map(meta) });
      }
      if (p.startsWith('/api/')) return send(res, 404, { error: 'not served in playback' });
      let rel;
      try {
        rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
      } catch {
        return send(res, 400, { error: 'bad request' });
      }
      if (rel.includes('\0')) return send(res, 400, { error: 'bad request' });
      const f = path.resolve(pub, rel);
      if (!f.startsWith(pub + path.sep)) return send(res, 403, { error: 'forbidden' });
      return file(res, f);
    } catch (err) {
      return send(res, 500, { error: String(err?.message || err) });
    }
  });

  return {
    server,
    served,
    push(item) {
      queue.push(item);
    },
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve(server.address().port));
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}
