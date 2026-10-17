#!/usr/bin/env node
// Real material for the clip factory: the station's own programmes made again, offline, at a moment of the archive
// (data/archive, the channel's record of what it aired), by the real producer and the fallback writer, WITH the
// station's recorded voices (server/voice), and saved as episodes for tools/record.mjs --item.
//
// Run it with VOICE_ENGINE set as the channel has it on air (server/config.js), so the neural voices record:
//   node tools/publish/material.mjs --at 2026-10-16T19:20:00+01:00 \
//     --programmes cosmos,tech-bytes,world-now,pay-attention,world-weather,seven-days --out <dir>
//
// As tools/lengths/replay.mjs: the whole process's clock runs from the moment; the news desk holds every archived story
// first aired up to an hour after it and no more than 36 hours before (each dated half an hour before its first airing);
// no network (no article pages, no pictures: a story's picture is the channel's fallback, its map or its card). The
// archive is read only (Archive.record is a no-op here). PAY ATTENTION is planned by the quiz desk from the archive, and
// no story carries its picture offline, so the desk never plans PICTURE THIS (and an edition whose plan still asks it
// is passed over: the moment moves on a few minutes and the desk plans again): nothing airs with an empty frame. WORLD WEATHER comes from the offline demo
// forecast (config/fixtures/weather.json: real Open-Meteo numbers of 12 Oct and a FICTIONAL storm): its episode is
// marked `demo` and the publishing desk never publishes it (the compliance check refuses demo data: compliance.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const at0 = Date.parse(opt('at', ''));
const out = opt('out');
const wanted = String(opt('programmes', 'cosmos')).split(',').map((s) => s.trim()).filter(Boolean);
const voiced = !args.includes('--no-voice');
if (!Number.isFinite(at0) || !out) {
  console.error('usage: node tools/publish/material.mjs --at <ISO> --programmes a,b --out <dir> [--no-voice]');
  process.exit(1);
}
const LEAD_MS = 60 * 60_000;
const AGE_MS = 36 * 3600_000;

// ---- the clock: the whole process's Date at the moment, running on
const RealDate = Date;
let base = at0;
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

const quiet = { info() {}, warn: (m) => console.warn(m), error: (m) => console.error(m), log() {} };
const { NewsDesk, isLiveBlog } = await import(`${root}/server/news.js`);
const { config } = await import(`${root}/server/config.js`);
const { Producer } = await import(`${root}/server/producer.js`);
const { ProviderChain } = await import(`${root}/server/providers/index.js`);
const { createMockProvider } = await import(`${root}/server/providers/mock.js`);
const { loadChannel } = await import(`${root}/server/channel.js`);
const { Archive } = await import(`${root}/server/archive.js`);
const { WeatherDesk } = await import(`${root}/server/weather.js`);
const { readArchive } = await import(`${root}/tools/lengths/archive.mjs`);

Archive.prototype.record = function record() {
  return 0; // read only: nothing replayed here is written into the archive
};

const feeds = JSON.parse(fs.readFileSync(path.join(root, 'config', 'feeds.json'), 'utf8'));
const weightOf = new Map(feeds.map((f) => [f.name, Number(f.weight) || 1]));
const channel = loadChannel(undefined, { drafts: true });
const archiveDir = path.join(root, 'data', 'archive');
const { stories } = readArchive(archiveDir);
const fixtureOutlets = new Set(JSON.parse(fs.readFileSync(path.join(root, 'config', 'feeds.fixture.json'), 'utf8')).map((f) => f.name));
for (const [id, s] of stories) if (/\.invalid\//.test(s.link) || !/^https?:\/\//.test(s.link) || fixtureOutlets.has(s.source)) stories.delete(id);

const desk = new NewsDesk({ log: quiet, fetchImpl: async (u) => { throw new Error(`offline: ${u}`); } });
desk.fetchText = async () => {
  throw new Error('offline');
};
desk.findPictures = async () => ({});
const archive = new Archive({ dir: archiveDir, now: () => Date.now(), log: quiet });
// offline, no story has a picture (the pictures stay on the outlets' servers): none is offered to the writer, the
// director or the quiz desk (which then never plans PICTURE THIS), so nothing airs with an empty frame
for (const e of archive.entries) {
  delete e.image;
  delete e.images;
}
archive.pictured.clear();
desk.archive = archive;
const sync = (t) => {
  for (const s of stories.values()) {
    if (desk.stories.has(s.id) || s.firstAired > t + LEAD_MS || s.firstAired < t - AGE_MS) continue;
    const published = s.firstAired > t ? t - 10 * 60_000 : s.firstAired - 30 * 60_000;
    desk.stories.set(s.id, { id: s.id, title: s.title, summary: s.summary, link: s.link, source: s.source, category: s.category, weight: weightOf.get(s.source) || 1, published, image: null, ...(isLiveBlog(s.title) ? { live: true } : {}) });
  }
  for (const [id, s] of desk.stories) if (t - s.published > AGE_MS) desk.stories.delete(id);
  desk.updateTrending();
};

let voice = null;
if (voiced) {
  const { createVoiceService } = await import(`${root}/server/voice/index.js`);
  // the engine the channel's own configuration names (VOICE_ENGINE, as on air); the budgets are for a whole programme
  voice = createVoiceService({ ...config, voice: { ...config.voice, firstBudgetSeconds: 3600, budgetSeconds: 3600 } }, { root, log: quiet });
}
const weather = new WeatherDesk({ source: 'fixture', field: true, log: quiet, fetchImpl: async () => { throw new Error('offline'); } });
const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: quiet });
// (the quiz desk's history and weekly table in a state folder of this run: every run starts the week afresh, and never
// touches the station's own data/quiz)
const stateDir = path.join(out, 'state');
fs.rmSync(path.join(stateDir, 'quiz'), { recursive: true, force: true });
const producer = new Producer({ config: { ...config, dataDir: stateDir, reviewPass: false, articleBudgetMs: 5_000 }, newsDesk: desk, chain, voice, weather, archive, log: quiet });

fs.mkdirSync(out, { recursive: true });
const asksPicture = (plan) => [...(plan?.rounds || []).map((r) => r.type), plan?.don?.type].includes('picture');
const made = [];
for (const programId of wanted) {
  if (!channel.programs[programId]) {
    console.error(`${programId}: not a programme`);
    continue;
  }
  let t = at0;
  let ep = null;
  for (let tries = 0; tries < 16 && !ep; tries++) {
    setClock(t);
    sync(t);
    if (channel.programs[programId].kind === 'quiz') {
      const prog = { id: programId, ...channel.programs[programId] };
      const plan = producer.quiz?.planFor(prog, channel);
      if (!plan || asksPicture(plan)) {
        if (!plan) console.error(`${programId} at ${new RealDate(t).toISOString()}: no plan (${producer.quiz?.plan(prog, channel)?.reason || 'no quiz desk'})`);
        else console.error(`${programId} at ${new RealDate(t).toISOString()}: plan asks PICTURE THIS, passed over`);
        producer.quiz?.drop();
        t += 7 * 60_000;
        continue;
      }
    }
    try {
      ep = await producer.produce(channel, programId, { upcoming: [] });
    } catch (err) {
      console.error(`${programId} at ${new RealDate(t).toISOString()}: ${err.message}`);
    }
    if (!ep) t += 7 * 60_000;
  }
  if (!ep) {
    console.error(`${programId}: nothing made`);
    continue;
  }
  if (ep.weather && /fixture|demo/i.test(String(ep.pipeline?.[0]?.source || ep.weather.source || 'fixture'))) ep.demo = true;
  ep.airedAt = new RealDate(t).toISOString();
  const name = `${new RealDate(t).toISOString().slice(0, 16).replace(/[:]/g, '')}-${programId}`;
  const file = path.join(out, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(ep, null, 1));
  const spoken = ep.segments.filter((s) => String(s.text || '').trim());
  const withVoice = spoken.filter((s) => s.audio?.url).length;
  console.log(`${name}: ${ep.segments.length} segments, ${withVoice}/${spoken.length} voiced${ep.demo ? ' (DEMO weather data: never published)' : ''} -> ${file}`);
  made.push(file);
}
voice?.close();
console.log(JSON.stringify(made));
process.exit(0);
