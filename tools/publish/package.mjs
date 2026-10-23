#!/usr/bin/env node
// The packaging of clips the factory already made (docs/publishing/thumbnails-titles.md): their three titles, three
// cover texts, hook, lead and hashtags written again (the AI writer of the configured chain, every field checked, the
// deterministic writer behind it) and their three covers or thumbnails drawn again, from the factory's own folder: the
// clips' records (clips/*.json), the masters it kept (--keep-masters) and the episode. Nothing is recorded again,
// nothing is queued, nothing is published.
//
//   node tools/publish/package.mjs --episode ep.json --from <factory out dir> [--out <dir>] [--pictures <dir>]
//        [--sources <dataDir>] [--formats vertical,horizontal] [--no-ai]
//
// Writes <out>/<clip>.cover-a|b|c.png (or .thumb-a|b|c.png), <out>/<clip>.package.json (the package, its facts' kind,
// the writer, what of the AI writer's was refused and why, and the texts each network gets) and <out>/packages.json.
import fs from 'node:fs';
import path from 'node:path';
import { createPlaybackServer } from '../../server/publish/playback.js';
import { packFacts, writePackage } from '../../server/publish/packaging.js';
import { clipTexts } from '../../server/publish/clipmeta.js';
import { root, argsOf, loadPlaywright } from './lib.mjs';
import { packagingChain, pickFrames, grabFrame, renderCovers, pictureOf, coverCast } from './packager.mjs';

const { opt, flag } = argsOf();
if (!opt('episode') || !opt('from')) {
  console.error('usage: node tools/publish/package.mjs --episode ep.json --from <factory out dir> [--out <dir>] [--pictures <dir>] [--no-ai]');
  process.exit(1);
}
const say = (m) => console.log(`[package] ${m}`);
const episode = JSON.parse(fs.readFileSync(path.resolve(opt('episode')), 'utf8'));
const from = path.resolve(opt('from'));
const out = path.resolve(opt('out', path.join(from, 'package')));
const tmp = path.join(out, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const formats = String(opt('formats', 'vertical,horizontal')).split(',');
const airedAt = Date.parse(episode.airedAt || episode.createdAt || '') || Date.now();
const pictureDir = opt('pictures') ? path.resolve(opt('pictures')) : null;
const recorded = /^(1|true|yes|on)$/i.test(process.env.PLAYOUT || '') || /^recorded$/i.test(process.env.CHANNEL_AIR || '');
const live = !!process.env.CHANNEL_LIVE_URL && !recorded;
const prog = episode.program?.id || 'programme';
const theme = episode.program?.theme || 'world';

const stories = new Map();
try {
  const { readArchive } = await import('../lengths/archive.mjs');
  for (const dir of [...new Set([path.join(root, 'data'), path.resolve(opt('sources', path.join(root, 'data')))])]) {
    if (!fs.existsSync(path.join(dir, 'archive'))) continue;
    for (const [id, s] of readArchive(path.join(dir, 'archive')).stories) stories.set(id, s);
  }
} catch {
  /* no archive: no sources, no links */
}
let presenters = {};
try {
  presenters = JSON.parse(fs.readFileSync(path.join(root, 'config', 'channel.json'), 'utf8')).presenters || {};
} catch {
  /* names fall back to ids */
}

const clips = fs.readdirSync(path.join(from, 'clips')).filter((f) => /\.json$/.test(f) && !/\.package\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(from, 'clips', f), 'utf8'))).filter((c) => c.moment && formats.includes(c.format));
const masters = (fmt) => path.join(from, 'masters', `${prog}-${fmt}.mkv`);
const reports = {};
for (const fmt of new Set([...formats, 'vertical'])) {
  const r = path.join(from, 'masters', `${prog}-${fmt}.report.json`);
  if (fs.existsSync(r)) reports[fmt] = JSON.parse(fs.readFileSync(r, 'utf8'));
}

const pb = createPlaybackServer({ root, pictureDir });
const port = await pb.listen(0);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/lab/thumb.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__thumbLab?.cover);
const chain = flag('no-ai') ? null : await packagingChain({ log: { warn: (m) => say(m) } });
say(`${clips.length} clips of ${episode.program?.title}; ${chain ? 'the AI writer, checked, the deterministic writer behind it' : 'the deterministic writer'}`);

// the words, one package per moment (both formats share it), written together (an inbox writer answers them at once)
const byMoment = new Map();
for (const c of clips) if (!byMoment.has(c.moment.id)) byMoment.set(c.moment.id, c.moment);
const packs = new Map(
  await Promise.all(
    [...byMoment.values()].map(async (m) => {
      const facts = packFacts(m, episode, { stories, presenters, airedAt, live });
      const pack = await writePackage(facts, { chain, log: { warn: (x) => say(x) } });
      return [m.id, { facts, pack }];
    }),
  ),
);

const all = [];
for (const c of clips) {
  const { facts, pack } = packs.get(c.moment.id);
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(airedAt)).toUpperCase();
  // the clip's own frames from the vertical master's stage, which no caption covers (factory.mjs)
  const frames = {};
  if (fs.existsSync(masters('vertical')) && reports.vertical) {
    const picks = pickFrames(reports.vertical, c.window);
    for (const [k, t] of Object.entries(picks)) if (t !== null) frames[k] = { file: await grabFrame(masters('vertical'), t, path.join(tmp, `${c.name}.${k}.png`)), rect: { x: 0, y: 72, w: 216, h: 176 } };
  }
  const covers = await renderCovers({ page, fmt: c.format, pkg: pack, frames, picture: c.moment.uncleared ? null : pictureOf(episode, c.moment.storyIds, pictureDir), programme: episode.program?.title || 'GLOBIT 24', theme, kicker: `${episode.program?.title || 'GLOBIT 24'} · ${when}`, grave: facts.grave, ...coverCast(episode, c.moment), out, name: c.name });
  const texts = Object.fromEntries((c.platforms || []).map((p) => [p, clipTexts(c.moment, episode, { platform: p, stories, presenters, channelUrl: process.env.CHANNEL_LIVE_URL || null, recorded, pack, airedAt })]));
  const rec = { name: c.name, format: c.format, kind: c.moment.kind, grave: facts.grave, writer: pack.writer, package: pack, covers, frames: Object.keys(frames), texts: Object.fromEntries(Object.entries(texts).map(([p, t]) => [p, { title: t.title, text: t.text, description: t.description, hashtags: t.hashtags }])) };
  fs.writeFileSync(path.join(out, `${c.name}.package.json`), JSON.stringify(rec, null, 1));
  all.push(rec);
  say(`${c.name} (${pack.writer}): “${pack.titles[0]}” · ${pack.thumbs.join(' / ')}`);
}
fs.writeFileSync(path.join(out, 'packages.json'), JSON.stringify(all, null, 1));
await browser.close();
await pb.close();
fs.rmSync(tmp, { recursive: true, force: true });
say(`${all.length} packages -> ${out}`);
