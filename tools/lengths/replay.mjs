#!/usr/bin/env node
// The length gate (docs/roadmap/critique/fallback-lengths.md): the station's programmes written again, offline, from
// the real stories in the channel's archive with their dossiers, by the station's own producer and the fallback
// writer (no AI), and measured.
//
//   node tools/lengths/replay.mjs --out <dir> [--programmes world-now,cosmos] [--from ISO] [--until ISO] [--every 1]
//   VOICE_ENGINE=kokoro node tools/lengths/replay.mjs --out <dir> --voice-at <ISO of an edition>
//
// --voice-at: the edition aired at that moment is made with the station's Kokoro voices (server/voice, the clips cached in
// data/voice), waiting for all of them, and saved as <n>-<programme>.voiced.json for tools/record.mjs --item; the replay
// stops there (the editions before it are made as usual, so the desk is as it was).
//
// How: the archive's editions (data/archive/*.jsonl, server/archive.js) are replayed in the order they aired, each at
// its own moment (the whole process's clock set to it). Before each, the news desk (server/news.js NewsDesk, the
// real one: its ranking, its same-event clustering, its covered and recycled stories) holds every archived story
// first aired up to an hour after that moment (it was on the wires by then) and no more than 36 hours before it;
// each is dated half an hour before its first airing (a story first aired after the moment, ten minutes before it).
// The article pages come from data/lengths/pages (tools/lengths/pages.mjs): the dossier is read from the page as the
// live desk reads it (server/article.js), never from the network. Pictures are the archive's; no voices, no review.
// Each edition is written to <dir>/<n>-<programme>.json (the episode) and .txt (to read line by line), its sources
// to .src.txt, and the measures of all to <dir>/summary.json and a table on stdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageKey, readArchive } from './archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = path.resolve(opt('out', path.join(root, 'data', 'lengths', 'run')));
const only = opt('programmes') ? new Set(opt('programmes').split(',')) : null;
const from = opt('from') ? Date.parse(opt('from')) : -Infinity;
const until = opt('until') ? Date.parse(opt('until')) : Infinity;
const pagesDir = path.join(root, 'data', 'lengths', 'pages');
const LEAD_MS = 60 * 60_000;
const AGE_MS = 36 * 3600_000;

// ---- the clock: the whole process's Date set to each edition's moment, running on from there
const RealDate = Date;
let base = RealDate.now();
let realAt = RealDate.now();
const now = () => base + (RealDate.now() - realAt);
class ClockDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(now());
  }
  static now() {
    return now();
  }
}
globalThis.Date = ClockDate;
const setClock = (t) => {
  base = t;
  realAt = RealDate.now();
};

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const { NewsDesk, isLiveBlog } = await import(`${root}/server/news.js`);
const { config } = await import(`${root}/server/config.js`);
const { Producer } = await import(`${root}/server/producer.js`);
const { ProviderChain } = await import(`${root}/server/providers/index.js`);
const { createMockProvider } = await import(`${root}/server/providers/mock.js`);
const { loadChannel } = await import(`${root}/server/channel.js`);
const { measure, render } = await import('./measure.mjs');
const { voicedAir } = await import(`${root}/server/airtime.js`);
// --voiced: each edition also played through the director at the voices' measured rates (tools/lengths/voiced.mjs)
const voicedOn = args.includes('--voiced');
const { voicedLength } = voicedOn ? await import('./voiced.mjs') : {};

const feeds = JSON.parse(fs.readFileSync(path.join(root, 'config', 'feeds.json'), 'utf8'));
const weightOf = new Map(feeds.map((f) => [f.name, Number(f.weight) || 1]));
const channel = loadChannel();
const { stories, editions } = readArchive(path.join(root, 'data', 'archive'));
// the fixture desk's fictional items (a FULL TIME test on 13 Oct) are no real news
// (and the offline fixture desk's fictional outlets, config/feeds.fixture.json: an offline run once recorded into the archive)
const fixtureOutlets = new Set(JSON.parse(fs.readFileSync(path.join(root, 'config', 'feeds.fixture.json'), 'utf8')).map((f) => f.name));
for (const [id, s] of stories) if (/\.invalid\//.test(s.link) || !/^https?:\/\//.test(s.link) || fixtureOutlets.has(s.source)) stories.delete(id);

const desk = new NewsDesk({ log: quiet, fetchImpl: async (u) => { throw new Error(`offline: ${u}`); } });
desk.fetchText = async (url) => {
  const f = path.join(pagesDir, `${pageKey(url)}.html`);
  if (!fs.existsSync(f)) throw new Error('no page');
  return fs.readFileSync(f, 'utf8');
};
desk.findPictures = async () => ({});
const sync = (t) => {
  let added = 0;
  for (const s of stories.values()) {
    if (desk.stories.has(s.id) || s.firstAired > t + LEAD_MS || s.firstAired < t - AGE_MS) continue;
    const published = s.firstAired > t ? t - 10 * 60_000 : s.firstAired - 30 * 60_000;
    desk.stories.set(s.id, { id: s.id, title: s.title, summary: s.summary, link: s.link, source: s.source, category: s.category, weight: weightOf.get(s.source) || 1, published, image: s.image, ...(s.images?.length > 1 ? { images: s.images } : {}), ...(isLiveBlog(s.title) ? { live: true } : {}) });
    added++;
  }
  for (const [id, s] of desk.stories) if (t - s.published > AGE_MS) desk.stories.delete(id);
  if (added) desk.updateTrending();
};

const voiceAt = opt('voice-at') ? Date.parse(opt('voice-at')) : null;
let voiceService = null;
if (voiceAt) {
  const { createVoiceService } = await import(`${root}/server/voice/index.js`);
  voiceService = createVoiceService({ ...config, voice: { ...config.voice, engine: 'kokoro', firstBudgetSeconds: 3600, budgetSeconds: 3600 } }, { root, log: console });
}
const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: quiet });
const producer = new Producer({ config: { ...config, reviewPass: false, articleBudgetMs: 120_000 }, newsDesk: desk, chain, log: quiet });
// --dump: each edition's candidates as the writer saw them (with their article text), for a writer-only rerun
const dump = args.includes('--dump');
let lastCtx = null;
const write = producer.write.bind(producer);
producer.write = async (ctx) => {
  lastCtx = { candidates: ctx.candidates, experts: ctx.experts, recent: producer.recentText(), featured: producer.recentFeatures.map((x) => x.id), analysisTurn: producer.analysisTurn };
  return write(ctx);
};

fs.mkdirSync(out, { recursive: true });
const list = editions.filter((e) => channel.programs[e.programId] && e.at >= from && e.at <= until);
const every = Number(opt('every', 1));
const rows = [];
const prevOf = new Map();
let n = 0;
for (const [k, e] of list.entries()) {
  setClock(e.at);
  sync(e.at);
  // the next programmes in the sequence keep their own beat (the station passes the rotation's)
  const upcoming = [...new Set(list.slice(k + 1, k + 6).map((x) => x.programId))].filter((id) => id !== e.programId).slice(0, 3);
  let ep = null;
  const voicing = voiceAt && Math.abs(e.at - voiceAt) < 1000;
  producer.voice = voicing ? voiceService : null;
  try {
    ep = await producer.produce(channel, e.programId, { upcoming });
  } catch (err) {
    console.error(`${new RealDate(e.at).toISOString()} ${e.programId}: ${err.message}`);
  }
  if (only && !only.has(e.programId)) continue;
  if (k % every) continue;
  const name = `${String(++n).padStart(3, '0')}-${e.programId}`;
  if (!ep) {
    rows.push({ name, at: new RealDate(e.at).toISOString(), programId: e.programId, skipped: true });
    continue;
  }
  const m = measure(ep, prevOf.get(e.programId));
  prevOf.set(e.programId, ep);
  const when = new RealDate(e.at).toISOString().slice(0, 16);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(ep, null, 1));
  fs.writeFileSync(path.join(out, `${name}.txt`), `${render(ep, { title: `${ep.program.title}, ${when} UTC (replayed from the archive)` })}\n`);
  // the sources each story was written from: its headline, summary and the article text the desk read
  const src = ep.storyIds.map((id) => {
    const s = desk.get(id);
    return `## ${id} · ${s?.source} · ${s?.category}\nTITLE: ${s?.title}\nSUMMARY: ${s?.summary}\nBODY (${s?.body ? s.body.length : 0} chars, ${s?.bodyVia || 'none'}):\n${s?.body || '(no article text)'}\n`;
  });
  fs.writeFileSync(path.join(out, `${name}.src.txt`), src.join('\n'));
  if (dump && lastCtx) fs.writeFileSync(path.join(out, `${name}.cands.json`), JSON.stringify({ at: e.at, programId: e.programId, ...lastCtx }));
  const bodies = ep.storyIds.filter((id) => desk.get(id)?.body).length;
  // as it will air with the real voices (server/airtime.js); --voiced plays it through the director too, as a check
  m.voiced = Math.round(voicedAir(ep));
  if (voicedOn) {
    const v = await voicedLength(ep);
    m.director = Math.round(v.seconds);
  }
  rows.push({ name, at: new RealDate(e.at).toISOString(), programId: e.programId, ...m, bodies, aired: e.ids.length, depth: ep.pipeline?.find((x) => x.stage === 'write')?.depth || 0 });
  if (voicing) {
    fs.writeFileSync(path.join(out, `${name}.voiced.json`), JSON.stringify(ep, null, 1));
    const voiced = ep.segments.filter((x) => x.voiceId);
    console.log(`${name}: ${voiced.filter((x) => x.audio?.url).length}/${voiced.length} segments voiced -> ${path.join(out, `${name}.voiced.json`)}`);
    voiceService?.close();
    break;
  }
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(rows, null, 1));

// ---- the table: per programme, the length against its target and the mix
const progs = [...new Set(rows.map((r) => r.programId))];
for (const p of progs) {
  const rs = rows.filter((r) => r.programId === p && !r.skipped);
  const target = channel.programs[p].targetSeconds || [];
  const airs = rs.map((r) => r.air).sort((a, b) => a - b);
  const avg = (f) => (rs.length ? rs.reduce((a, r) => a + f(r), 0) / rs.length : 0);
  const inside = rs.filter((r) => r.air >= target[0] && r.air <= target[1]).length;
  console.log(`\n${channel.programs[p].title}: ${rs.length} editions (${rows.filter((r) => r.programId === p && r.skipped).length} skipped), target ${target.join('-')} s`);
  console.log(`  air: avg ${avg((r) => r.air).toFixed(0)} s, min ${airs[0]}, median ${airs[Math.floor(airs.length / 2)]}, max ${airs.at(-1)}; within target ${inside}/${rs.length}; depth ${[0, 1, 2, 3].map((d) => `${d}:${rs.filter((r) => r.depth === d).length}`).join(' ')}`);
  const vs = rs.map((r) => r.voiced).sort((a, b) => a - b);
  console.log(`  VOICED: avg ${avg((r) => r.voiced).toFixed(0)} s, min ${vs[0]}, median ${vs[Math.floor(vs.length / 2)]}, max ${vs.at(-1)}; within target ${rs.filter((r) => r.voiced >= target[0] && r.voiced <= target[1]).length}/${rs.length}${voicedOn ? `; the director's timeline differs by at most ${Math.max(...rs.map((r) => Math.abs(r.director - r.voiced)))} s` : ''}`);
  console.log(`  words ${avg((r) => r.words).toFixed(0)}, segments ${avg((r) => r.segments).toFixed(1)}, stories ${avg((r) => r.stories).toFixed(1)} (mains ${avg((r) => r.mains).toFixed(1)}), with article ${avg((r) => r.bodies).toFixed(1)}`);
  const kinds = [...new Set(rs.flatMap((r) => Object.keys(r.share)))];
  console.log(`  share of spoken time: ${kinds.map((k) => `${k} ${avg((r) => r.share[k] || 0).toFixed(1)}%`).join(', ')}`);
  console.log(`  repeats within: ${rs.reduce((a, r) => a + r.within.length, 0)}; presenter lines again after the previous edition: ${rs.reduce((a, r) => a + r.across.lines.length, 0)}; sentences again: ${avg((r) => r.across.sentences).toFixed(1)} an edition`);
  const boards = [...new Set(rs.flatMap((r) => Object.keys(r.boards)))];
  console.log(`  boards an edition: ${boards.map((b) => `${b} ${avg((r) => r.boards[b] || 0).toFixed(1)}`).join(', ')}`);
}
