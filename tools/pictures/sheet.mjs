#!/usr/bin/env node
// Contact sheets of the cleared-picture measurement: each story before (the outlet's photo it aired with) and after
// (the rights desk's pick, or the map), rendered by the channel's own client code (public/lab/pictures.html: the
// headline board, pixelate.js, the credit overlay) in headless Chromium.
//
//   NODE_USE_ENV_PROXY=1 node tools/pictures/sheet.mjs --out data/pictures-measure --dest <dir> [--per 10] [--only picks|none|all]
//        [--big <n>]   (also n stories at 4x, after only)   [--grid]   (twelve picks a sheet, for the hand check)
//        [--kinds grave-portrait,event,institution]   [--located]   [--name <file prefix>]
//        [--boards]   (the stories with neither a picture nor a place, on the board the producer gives them, sixteen a
//                      sheet at air size; with --big n, n of each kind of board at 4x)
//        [--plates <id,id>]   (those picks under the top row with the AI plate, on WORLD NOW's and TECH BYTES' looks,
//                      the montage's frame and the full-frame shot, at 4x: the plate and the credit never meet)
//
// Pictures are downloaded once into <out>/img/ (Wikimedia's with the desk's own User-Agent, one at a time, its
// Retry-After obeyed). A local server on a free port serves public/ and the pictures (never port 8711).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { USER_AGENT } from '../../server/robots.js';
import { wikimediaAgent } from '../../server/wikimedia.js';
import { imageSize } from '../../server/pictures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const out = path.resolve(args.out || 'data/pictures-measure');
const dest = path.resolve(args.dest || path.join(out, 'sheets'));
const per = Number(args.per || 10);
const only = args.only || 'picks';
fs.mkdirSync(dest, { recursive: true });
const imgDir = path.join(out, 'img');
fs.mkdirSync(imgDir, { recursive: true });
const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));

// ---- the pictures, downloaded once
const agentWm = wikimediaAgent(process.env.WIKIMEDIA_CONTACT || undefined);
let pauseUntil = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url) {
  if (!url || !/^https:\/\//.test(url)) return null;
  const name = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  for (const ext of ['jpg', 'png', 'webp']) if (fs.existsSync(path.join(imgDir, `${name}.${ext}`))) return `/cache/${name}.${ext}`;
  const wm = /wikimedia\.org\//.test(url);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (wm && Date.now() < pauseUntil) await wait(pauseUntil - Date.now());
    try {
      const res = await fetch(url, { headers: { 'user-agent': wm || /staticflickr\.com\//.test(url) ? agentWm : USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status === 503) {
        const ask = Number(res.headers.get('retry-after')) || 30;
        // (an original's download refused for ten minutes is skipped: the desk serves renditions, not originals)
        if (!wm || ask > 120) return null;
        pauseUntil = Date.now() + Math.max(5, ask) * 1000;
        continue;
      }
      if (!res.ok) return null;
      const body = Buffer.from(await res.arrayBuffer());
      const ext = body[0] === 0x89 ? 'png' : body.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : body[0] === 0xff && body[1] === 0xd8 ? 'jpg' : null;
      if (!ext || !imageSize(body)) return null;
      fs.writeFileSync(path.join(imgDir, `${name}.${ext}`), body);
      if (wm) await wait(1200);
      return `/cache/${name}.${ext}`;
    } catch {
      if (!wm) return null;
      await wait(3000);
    }
  }
  return null;
}

let list = results;
if (only === 'picks') list = results.filter((r) => r.pick);
else if (only === 'none') list = results.filter((r) => !r.pick);
// --kinds grave-portrait,event,institution: only those picks (a grave story's sober portrait, a FILE picture of the same
// actor, a seat of government); --located: only stories with a place (the locator board)
if (args.kinds) {
  const kinds = new Set(String(args.kinds).split(','));
  const graveOf = (r) => !!(r.plan?.flags?.grave || r.plan?.flags?.harm || r.plan?.flags?.deathOf);
  list = list.filter((r) => r.pick && ((kinds.has('grave-portrait') && r.pick.kind === 'portrait' && graveOf(r)) || kinds.has(r.pick.kind)));
}
// --boards: the stories with neither a picture nor a place, each with the board the producer gives it
// (server/producer.js boardPlace, public/js/boardspec.js): the archive's rows give the writer's figures, quote and topic
// label, the desk's kept answers what each named actor is
let boardOf = null;
const leadOf = (r) => (r.summary ? (String(r.summary).match(/[^.!?]+[.!?]+["”’)]*\s*/g) || [String(r.summary)]).slice(0, 2).join(' ').slice(0, 400) : '');
if (args.boards) {
  const { boardPlace } = await import('../../server/producer.js');
  const { boardSpec } = await import('../../public/js/boardspec.js');
  const { boardActorOf } = await import('../../server/picturedesk.js');
  const rows = new Map();
  const arch = path.join(ROOT, 'data', 'archive');
  for (const f of fs.existsSync(arch) ? fs.readdirSync(arch).filter((n) => /\.jsonl$/.test(n)) : []) {
    for (const line of fs.readFileSync(path.join(arch, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const prev = rows.get(e.id) || {};
        rows.set(e.id, { numbers: e.numbers || prev.numbers, quote: e.quote || prev.quote, kicker: e.kicker || prev.kicker });
      } catch {
        // (a line cut short)
      }
    }
  }
  const answers = fs.existsSync(path.join(out, 'answers.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'answers.json'), 'utf8')).answers || {} : {};
  const byTitle = new Map(Object.entries(answers).filter(([k, v]) => k.startsWith('t:') && v?.[1]?.title).map(([, v]) => [v[1].title, v[1]]));
  const page = (t) => (Object.hasOwn(answers, `t:${t}`) ? answers[`t:${t}`][1] : byTitle.get(t));
  list = results.filter((r) => !r.pick && !boardPlace(r.title, r.location, leadOf(r)));
  boardOf = (r) => {
    const a = rows.get(r.id) || {};
    const grave = !!(r.grave || r.plan?.flags?.grave || r.plan?.flags?.harm);
    // (a measurement made before the desk's options said so: a person no longer living, named in full in the headline)
    const options = (r.options || []).map((o) => (o.refused === "not in Wikipedia's living people" && o.label.includes(' ') && r.title.includes(o.label.replace(/\s*\([^)]*\)\s*$/, '')) ? { ...o, named: true } : o));
    const actor = boardActorOf({ options, plan: r.plan }, { page, title: r.title, summary: r.summary });
    const head = r.title.length > 70 ? r.title.slice(0, 70).replace(/\s+\S*$/, '') : r.title;
    return boardSpec({ headline: head, alt: r.title, kicker: a.kicker, numbers: a.numbers, quote: a.quote, grave, actor, text: `${r.title} ${leadOf(r)}` });
  };
}
if (args.plates) {
  const ids = String(args.plates).split(',');
  list = ids.map((id) => results.find((r) => r.id === id && r.pick)).filter(Boolean);
}
if (args.located) list = list.filter((r) => r.location);
if (args.unlocated) list = list.filter((r) => !r.location);
if (args.limit) list = list.slice(0, Number(args.limit));
const cases = [];
let n = 0;
for (const r of list) {
  n++;
  // (a board or a plate sheet shows no outlet photo: none is fetched)
  const before = r.before?.image && !boardOf && !args.plates ? await download(r.before.image) : null;
  const after = r.pick ? await download(r.pick.url) : null;
  cases.push({
    n: results.indexOf(r) + 1,
    programme: r.programme,
    title: r.title,
    grave: r.grave || !!r.plan?.flags?.grave || (!!boardOf && !!r.plan?.flags?.harm),
    ...(boardOf ? { board: boardOf(r), caption: String(r.summary || '').split(/(?<=[.!?])\s+/)[0].slice(0, 84) } : {}),
    headline: r.title.length > 70 ? r.title.slice(0, 70).replace(/\s+\S*$/, '') : r.title,
    source: r.source,
    category: r.category,
    location: boardOf ? null : r.location,
    before: { img: before, source: r.source, note: r.before ? (before ? 'outlet photo (not cleared)' : 'outlet photo (would not download)') : 'no outlet photo' },
    after: r.pick ? { img: after, focus: r.pick.focus, fit: r.pick.kind === 'portrait' ? 'portrait' : null, credit: r.pick.credit, source: r.source.split(' / ')[0], note: `${r.pick.kind} · ${r.pick.subject?.label || ''}${r.pick.subject?.qid ? ` (${r.pick.subject.qid})` : ''} · ${decodeURIComponent(String(r.pick.page || r.pick.url).split('/').pop()).slice(0, 70)}` } : { img: null, source: r.source.split(' / ')[0], note: 'no cleared picture: the map' },
  });
  process.stdout.write(`\r[sheet] pictures ${n}/${list.length}   `);
}
console.log('');
fs.writeFileSync(path.join(dest, `cases-${args.name || only}.json`), JSON.stringify(cases, null, 1));

// ---- a local server: public/ and the pictures
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname.startsWith('/cache/') ? path.join(imgDir, path.basename(u.pathname)) : path.join(ROOT, 'public', path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
if (port === 8711) throw new Error('refusing port 8711');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('[page]', e.message));
const shoot = async (url, chunk, file) => {
  await page.goto(url);
  await page.waitForSelector('body[data-loaded="1"]');
  await page.evaluate((c) => window.__render(c), chunk);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: file, fullPage: true });
};
if (args.plates) {
  // every pick on both looks: WORLD NOW's and TECH BYTES'
  const both = cases.flatMap((c) => ['world-now', 'tech-bytes'].map((programme) => ({ ...c, programme, caption: String(list.find((r) => results.indexOf(r) + 1 === c.n)?.summary || '').split(/(?<=[.!?])\s+/)[0].slice(0, 84), plates: [['montage', 'name'], ['montage', 'open'], ['full', 'open']] })));
  for (let i = 0; i < both.length; i += 2) {
    const file = path.join(dest, `${args.name || 'plates'}-${String(i / 2 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?plates=1`, both.slice(i, i + 2), file);
    console.log(`[sheet] ${file}`);
  }
} else if (args.boards) {
  // the boards at air size, sixteen to a sheet
  for (let i = 0; i < cases.length; i += 16) {
    const file = path.join(dest, `${args.name || 'boards'}-${String(i / 16 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?boards=1`, cases.slice(i, i + 16), file);
    console.log(`[sheet] ${file}`);
  }
} else if (args.grid) {
  // the hand check: every cleared pick, twelve to a sheet, on the board with its credit
  const picked = cases.filter((c) => c.after.img);
  for (let i = 0; i < picked.length; i += 12) {
    const file = path.join(dest, `${args.name || 'grid'}-${String(i / 12 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?grid=1`, picked.slice(i, i + 12), file);
    console.log(`[sheet] ${file}`);
  }
} else {
  for (let i = 0; i < cases.length; i += per) {
    const file = path.join(dest, `${args.name || only}-${String(i / per + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html`, cases.slice(i, i + per), file);
    console.log(`[sheet] ${file}`);
  }
}
if (args.big) {
  // (the boards: every board the montage can show, each as it airs under an ordinary story and under a grave one)
  const kinds = [['figure', false], ['figure', true], ['quote', false], ['quote', true], ['actor', false], ['actor', true], ['topic', false], ['topic', true], ['phrase', false], ['none', false]];
  const bigCases = args.boards ? kinds.flatMap(([k, g]) => cases.filter((c) => c.board?.kind === k && !!c.board?.grave === g).slice(0, Number(args.big))) : cases.filter((c) => c.after.img || (only === 'none' && (c.location || args.unlocated))).slice(0, Number(args.big));
  for (let i = 0; i < bigCases.length; i += 3) {
    const file = path.join(dest, `${args.name ? `${args.name}-big` : 'big'}-${String(i / 3 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?big=1`, bigCases.slice(i, i + 3), file);
    console.log(`[sheet] ${file}`);
  }
}
await browser.close();
server.close();
