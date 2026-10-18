#!/usr/bin/env node
// A fixed playlist in front of a running station, for memory runs that must see the same programmes twice (before and
// after a change) and can run faster than the station makes them: /api/next answers from a folder of saved items (each
// episode after a break that promotes it, every round with fresh ids), everything else (the page, voices, pictures,
// footage, the ticker's events) is passed to the station. Nothing on the station is consumed or changed.
//
//   node tools/leak/playlist.mjs --station http://127.0.0.1:8796 --items <dir of episode JSON> --port 8798 [--rounds 0]
//        [--public <another public dir>]
//   node tools/leak/watch.mjs --url http://127.0.0.1:8798 --speed 3 ...
//
// Save items from a station's queue as they are made: GET /api/queue, one file per item.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const opts = { station: 'http://127.0.0.1:8796', port: 8798, rounds: 0 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) opts[k] = true;
  else {
    opts[k] = v;
    i++;
  }
}
if (!opts.items) {
  console.error('usage: node tools/leak/playlist.mjs --station <url> --items <dir> [--port 8798] [--rounds 0 (endless)]');
  process.exit(1);
}
const station = new URL(String(opts.station));
const episodes = fs
  .readdirSync(opts.items)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(opts.items, f), 'utf8')))
  .filter((x) => x.kind === 'episode');
if (!episodes.length) {
  console.error(`no episodes in ${opts.items}`);
  process.exit(1);
}
let n = 0;
const served = [];
// every round after the first, the stories are new to the page (fresh ids, their pictures served from the originals),
// as on air, where each programme brings stories the page has not seen: a page that keeps something per story shows it
const alias = new Map(); // fresh story id -> the original
function freshStories(ep, round) {
  if (!round) return ep;
  let json = JSON.stringify(ep);
  const ids = new Set((ep.rundown || []).map((r) => r.storyId).filter((id) => /^s[0-9a-f]{10}$/.test(id || '')));
  for (const id of ids) {
    const fresh = `s${((parseInt(id.slice(1), 16) + round * 0x9e3779b1) % 0x10000000000).toString(16).padStart(10, '0')}`;
    alias.set(fresh, id);
    json = json.split(id).join(fresh);
  }
  return JSON.parse(json);
}
function next() {
  const i = Math.floor(n / 2);
  const round = Math.floor(i / episodes.length);
  if (Number(opts.rounds) > 0 && round >= Number(opts.rounds)) return null;
  const ep = episodes[i % episodes.length];
  const item = n % 2 === 0
    ? { kind: 'break', id: `kpl${n.toString(36)}`, filler: false, ads: 2, next: { id: ep.program?.id, title: ep.program?.title, ready: true } }
    : { ...freshStories(ep, round), id: `${ep.id}-r${round}` };
  n++;
  served.push({ at: Date.now(), kind: item.kind, title: item.program?.title || 'break', id: item.id });
  return item;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/next') {
    const item = next();
    res.writeHead(item ? 200 : 202, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(item || { standby: true }));
  }
  if (u.pathname === '/api/playlist') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ episodes: episodes.length, served: served.length, last: served.slice(-5) }));
  }
  // --public <dir>: the page's own files from another copy of public/ (a before-and-after on one station)
  if (opts.public && /^\/(js|css|assets|lab)\//.test(u.pathname)) {
    const pub = path.resolve(String(opts.public));
    const f = path.resolve(pub, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
    if (f.startsWith(pub + path.sep) && fs.existsSync(f)) {
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(f));
    }
  }
  const img = /^\/api\/img\/(s[0-9a-f]{10})$/.exec(u.pathname);
  const upPath = img && alias.has(img[1]) ? `/api/img/${alias.get(img[1])}` : req.url;
  const up = http.request({ host: station.hostname, port: station.port, path: upPath, method: req.method, headers: { ...req.headers, host: station.host } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
});
server.listen(Number(opts.port), '127.0.0.1', () => console.log(`[playlist] http://127.0.0.1:${opts.port}: ${episodes.length} episodes (each after a break) in front of ${station.origin}`));
