#!/usr/bin/env node
// The clip factory (docs/publishing/clips.md): one aired episode in, its best moments out as finished clips, each in
// the vertical picture (Shorts, Reels, TikTok) and the horizontal one (X, Facebook, YouTube), with burned-in captions
// in the channel's own type, a hook title, an end card (with the channel ident's AI notice), a caption file, a contact sheet, the texts for every network
// and the compliance desk's verdict; the publishable ones go to the publishing queue (dry run: nothing is uploaded).
//
//   node tools/publish/factory.mjs --episode ep.json --out <dir> [--formats vertical,horizontal] [--max 6]
//        [--moments <id,id>] [--all] [--queue data/publish] [--masters <dir>] [--keep-masters] [--parallel]
//        [--pictures <dir>] [--sources <dataDir>]
//   node tools/publish/factory.mjs --from-playout data/playout/masters/<episode id> --out <dir>
//
// --from-playout: a programme the pre-rendered playout already rendered (docs/publishing/playout.md §6): its episode as
// aired, its horizontal clip-mode master and its report, made from the very frames that aired; the horizontal clips are
// cut from that master and nothing is recorded again (the vertical picture is its own composition: recorded here).
// When done the folder gets factory.json, and the playout's disk policy may let the master go. With --episode, a
// rendered master under RENDERED_MASTERS (server/publish/masters.js) is used the same way when there is one.
//
// --pictures: a folder with the episode's pictures (<storyId>.jpg|png|webp), so the clips show them as they aired, with
// their credits; without it the stories show their maps and boards.
//
// How: a playback server (server/publish/playback.js) serves the page and the episode; the deterministic recorder
// (tools/record.mjs) makes one lossless master per format in clip mode (?clip=1, ?format=vertical) with its report;
// the report gives the timeline to the word (server/publish/timeline.js); the moments are found on it
// (moments.js); the cards are drawn by the channel's own code (public/lab/clip.html); ffmpeg cuts, titles and scales
// (render.js). Same seed, same item, same clock: both formats share one timeline.
//
// The packaging (docs/publishing/thumbnails-titles.md): each clip's three titles, three cover texts, hook, lead and
// hashtags (server/publish/packaging.js: the AI writer of the configured chain, every field checked, the deterministic
// writer behind it), and its three covers (vertical, 1080x1920) or thumbnails (horizontal, 1920x1080), drawn by the
// channel's own code (public/js/clip/cover.js) from the story's cleared picture and the clip's own frames.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPlaybackServer } from '../../server/publish/playback.js';
import { buildTimeline, estimateTimeline } from '../../server/publish/timeline.js';
import { detectMoments, publishable, markCopied, markUncleared, ownHook } from '../../server/publish/moments.js';
import { clipWindow, composeArgs, srtFor, vttFor, contactTimes, contactArgs, WEATHER_WIPE } from '../../server/publish/render.js';
import { clipTexts } from '../../server/publish/clipmeta.js';
import { packFacts, writePackage, checkPackage } from '../../server/publish/packaging.js';
import { packagingChain, pickFrames, grabFrame, renderCovers, pictureOf } from './packager.mjs';
import { PLATFORMS, PHASE_PLATFORMS, fitsPlatform } from '../../server/publish/platforms.js';
import { PublishQueue } from '../../server/publish/queue.js';
import * as compliance from '../../server/publish/compliance.js';
import { makeAdapter } from '../../server/publish/adapters/index.js';
import { masterRoots, renderedMaster, useRenderedMaster } from '../../server/publish/masters.js';
import { streamOf } from '../../public/js/airmode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const fromPlayout = opt('from-playout') ? path.resolve(opt('from-playout')) : null;
// the channel airs pre-rendered (a playout master, or PLAYOUT=1 / CHANNEL_AIR=recorded): no "watch live" anywhere
const recorded = !!fromPlayout || /^(1|true|yes|on)$/i.test(process.env.PLAYOUT || '') || /^recorded$/i.test(process.env.CHANNEL_AIR || '');
// what the end card may point to (airmode.js streamOf): a stream only when its address is set (CHANNEL_LIVE_URL, the
// one the descriptions link), WATCH LIVE only when that stream is live; the manual beta has none, so no promise
const stream = streamOf({ url: process.env.CHANNEL_LIVE_URL || null, recorded });
const epFile = fromPlayout ? path.join(fromPlayout, 'episode.json') : opt('episode');
const out = path.resolve(opt('out', ''));
if (!epFile || !opt('out')) {
  console.error('usage: node tools/publish/factory.mjs --episode ep.json --out <dir> [--formats vertical,horizontal] [--max 6] [--all]');
  process.exit(1);
}
const formats = String(opt('formats', 'vertical,horizontal')).split(',').filter((f) => ['vertical', 'horizontal'].includes(f));
const maxClips = Number(opt('max', 6));
const wanted = opt('moments') ? new Set(opt('moments').split(',')) : null;
const mastersDir = path.resolve(opt('masters', path.join(out, 'masters')));
// the playout's rendered masters (the folder given, else RENDERED_MASTERS): linked where a kept master is looked for
const renderedRoots = fromPlayout ? [path.dirname(fromPlayout)] : masterRoots(process.env);
const renderedUsed = new Set();
const queueDir = path.resolve(opt('queue', path.join(root, 'data', 'publish')));
const tmpDir = path.join(out, 'tmp');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(mastersDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
const say = (m) => console.log(`[factory] ${m}`);

const episode = JSON.parse(fs.readFileSync(epFile, 'utf8'));
const prog = episode.program?.id || 'programme';
const airedAt = Date.parse(episode.airedAt || episode.createdAt || '') || Date.now();
const THEME = { world: 'world', tech: 'tech', space: 'space', money: 'money', flash: 'flash', weather: 'weather', week: 'week', sport: 'sport', quiz: 'quiz' };

// ---------------------------------------------------------------- helpers

function run(cmd, argv, { env = {}, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => {
      o += d;
      if (!quiet) process.stdout.write(String(d).replace(/\r/g, '\n').split('\n').filter((l) => l.trim() && !/^\s*\d+%/.test(l)).map((l) => `    ${l}\n`).join(''));
    });
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve({ out: o, err: e }) : reject(new Error(`${cmd} ${argv[0]} exited ${code}: ${e.slice(-800)}`))));
  });
}
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const probeDuration = async (f) => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f], { quiet: true })).out.trim());

/** How long the episode airs, generously (the open, every voice, the pauses, the quiz's countdowns, the end card). */
function recordSeconds(ep) {
  const est = estimateTimeline(ep, { open: 11, gap: 0.9 }).duration;
  const frames = (ep.segments || []).filter((s) => s.part === 'frame').length;
  const weather = ep.weather ? (ep.segments || []).length * 3 : 0;
  return Math.ceil((est + frames * 9 + weather) * 1.12 + 12);
}

// ---------------------------------------------------------------- 1. the masters

const pb = createPlaybackServer({ root, pictureDir: opt('pictures') ? path.resolve(opt('pictures')) : null, stream }); // (the master's own end card: the same rule)
const port = await pb.listen(0);
const base = `http://127.0.0.1:${port}`;
// (a playout master is exactly the programme as it aired: its own length, from its report)
const playoutSeconds = (() => {
  const found = renderedMaster(episode, 'horizontal', renderedRoots);
  if (fromPlayout && !found) {
    console.error(`[factory] no rendered master in ${fromPlayout} (horizontal.mkv and its report, the folder named for the episode)`);
    process.exit(1);
  }
  try {
    return found ? Number(JSON.parse(fs.readFileSync(found.report, 'utf8')).seconds) || null : null;
  } catch {
    return null;
  }
})();
const seconds = Number(opt('seconds', playoutSeconds || recordSeconds(episode)));
const masters = {};
async function recordMaster(fmt) {
  const file = path.join(mastersDir, `${prog}-${fmt}.mkv`);
  const report = path.join(mastersDir, `${prog}-${fmt}.report.json`);
  const rendered = flag('rerecord') ? null : useRenderedMaster(episode, fmt, renderedRoots, mastersDir, prog);
  if (rendered) {
    renderedUsed.add(path.dirname(rendered.file));
    say(`${fmt} master: kept, the playout's (${path.dirname(rendered.file)})`);
    return { file, report };
  }
  if (fs.existsSync(file) && fs.existsSync(report) && !flag('rerecord')) {
    say(`${fmt} master: kept (${path.basename(file)})`);
    return { file, report };
  }
  const url = `${base}/?autostart=1&voice=tts&clip=1${fmt === 'vertical' ? '&format=vertical' : ''}`;
  say(`${fmt} master: recording ${seconds} s of ${episode.program?.title} (${url})`);
  const t0 = Date.now();
  await run('node', ['tools/record.mjs', '--url', url, '--item', path.resolve(epFile), '--seconds', String(seconds), '--fps', '30', '--scale', '1', '--lossless', '--progressive', '--seed', '1', '--time', new Date(airedAt).toISOString(), '--report', report, '--out', file], { env: { TMPDIR: tmpDir } });
  say(`${fmt} master: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  return { file, report };
}
try {
  if (flag('parallel')) Object.assign(masters, Object.fromEntries(await Promise.all(formats.map(async (f) => [f, await recordMaster(f)]))));
  else for (const f of formats) masters[f] = await recordMaster(f);
} finally {
  // (the cards need the server: closed at the end)
}

// ---------------------------------------------------------------- 2. the timeline, 3. the moments

const reports = Object.fromEntries(Object.entries(masters).map(([f, m]) => [f, JSON.parse(fs.readFileSync(m.report, 'utf8'))]));
const timelines = Object.fromEntries(Object.entries(reports).map(([f, r]) => [f, buildTimeline(episode, r)]));
const refFmt = timelines.horizontal ? 'horizontal' : formats[0];
const timeline = timelines[refFmt];
// the two formats are the same deterministic run: their speech must line up (a drift means each cuts on its own)
const drift = formats.length > 1 ? Math.max(0, ...timelines[formats[0]].segments.map((s, i) => Math.abs(s.start - (timelines[formats[1]].segments[i]?.start ?? s.start)))) : 0;
say(`timeline: ${timeline.segments.length}/${episode.segments.filter((s) => String(s.text || '').trim()).length} segments aired in ${seconds} s; formats drift ${drift.toFixed(3)} s`);

// the verbatim rule's sources (the archive's title and summary, the article when the compliance desk cached it): the
// gate measures each clip's own stories' aired words against them, and holds a clip that copies (verbatim.md)
// (--sources <dataDir>: the archive and article cache of another data folder, for an edition the station's own archive
// never kept: a replay from a sport snapshot)
const sourcesOf = compliance.archiveGetStory({ dataDir: path.resolve(opt('sources', path.join(root, 'data'))) });
const all = detectMoments(episode, { timeline });
// a moment that tells a story whose aired words copy its source is never chosen (the gate would hold its clip): the
// summary lists it as refused (`--all` or `--moments` still make it, to look at); so is one whose story's sources are
// not at hand (the gate refuses it: sources-missing)
const lint = compliance.lintEpisode(episode, { getStory: sourcesOf });
const copied = new Set((lint.violations || []).map((v) => v.storyId));
const blind = new Set(compliance.storiesWithoutSources({ episode, kind: 'episode' }, sourcesOf));
markCopied(all, copied, { unverified: blind });
// a moment that shows a picture not cleared for publication (or any moment of a private preview) is never chosen and
// never queued, whatever the flags: the summary lists it as refused
markUncleared(all, episode, { audit: compliance.auditItem });
const uncleared = all.filter((m) => m.uncleared).length;
if (uncleared) say(`pictures: ${uncleared} moment${uncleared === 1 ? '' : 's'} show a picture not cleared${episode.picturePreview ? ' (a private preview)' : ''}; never chosen or queued`);
// (a hook that is the outlet's headline is never burned into a clip as the channel's title: ownHook)
for (const m of all) {
  const seg = episode.segments.slice(m.from, m.to + 1).find((x) => x.headline && x.storyId) || {};
  const sources = (m.storyIds || []).flatMap((id) => { const st = sourcesOf(id); return st ? [st.title, st.summary, st.body] : []; });
  m.hook = ownHook(m, { kicker: seg.kicker, location: seg.location, category: seg.category }, sources);
}
if (copied.size) say(`verbatim: ${copied.size} of the episode's stories copy their sources; their moments are not chosen`);
if (blind.size) say(`verbatim: ${blind.size} of the episode's stories have no sources at hand (not in the archive: --sources); their moments are not chosen and the gate refuses them`);
const pub = new Set(publishable(all, { phase: 1 }).map((m) => m.id));
// the choice: the best of each kind first (variety), then by score; a moment must have aired whole in the recording
const chosen = [];
const perKind = new Map();
for (const m of all) {
  if (wanted && !wanted.has(m.id)) continue;
  if (!wanted && !flag('all') && !pub.has(m.id) && !episode.demo) continue;
  if (!wanted && !flag('all') && m.copied) continue;
  if (m.uncleared && !wanted) continue; // (never, even with --all: only --moments makes one, to look at, never queued)
  const k = perKind.get(m.kind) || 0;
  const cap = m.kind === 'quiz-question' ? 4 : ['quiz-round', 'stories', 'montage', 'lead', 'number'].includes(m.kind) ? 1 : 2;
  if (!wanted && k >= cap) continue;
  if (m.end > seconds - 4) continue;
  // never two clips of the same words (a whole round is the long version of its questions, on purpose)
  if (!wanted && m.kind !== 'quiz-round' && chosen.some((c) => c.kind !== 'quiz-round' && m.from <= c.to && c.from <= m.to)) continue;
  perKind.set(m.kind, k + 1);
  chosen.push(m);
  if (!wanted && chosen.length >= maxClips) break;
}
say(`moments: ${all.length} found, ${pub.size} publishable in Phase 1, ${chosen.length} chosen`);

// ---------------------------------------------------------------- 4. the cards

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}
const cardsDir = path.join(out, 'cards');
fs.mkdirSync(cardsDir, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/lab/clip.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__clipLab);
const theme = THEME[episode.program?.theme] || 'world';
// the packaging desk: its page (the covers) and its writer (the chain's AI writers, never the offline mock)
const coverPage = await browser.newPage();
await coverPage.goto(`${base}/lab/thumb.html`, { waitUntil: 'load' });
await coverPage.waitForFunction(() => !!window.__thumbLab?.cover);
const chain = flag('no-ai') ? null : await packagingChain({ log: { warn: (m) => say(m), info() {} } });
say(`packaging: ${chain ? 'the AI writer, every field checked, the deterministic writer behind it' : 'the deterministic writer (no AI writer configured)'}`);
const pictureDir = opt('pictures') ? path.resolve(opt('pictures')) : null;
const live = !!process.env.CHANNEL_LIVE_URL && !recorded;
// the vertical picture's stage (public/js/clip/layout.js V.stage): the clip's own frames of the presenter or a board
const STAGE_RECT = { x: 0, y: 72, w: 216, h: 176 };
async function hookPng(m, fmt) {
  // WORLD WEATHER's horizontal board fills the frame with its own heading where the hook would go (HOT & COLD, THE
  // NEXT THREE DAYS): the heading is the hook, and a plate over it would only hide it
  if (fmt === 'horizontal' && m.kind === 'weather-board') return null;
  const f = path.join(cardsDir, `hook-${m.id.replace(/[^a-z0-9-]+/gi, '_')}-${fmt}.png`);
  const tall = prog === 'pay-attention' || !!(episode.cast?.H && episode.cast?.A && episode.cast?.B);
  const url = await page.evaluate((spec) => window.__clipLab.hook(spec), { format: fmt, lines: tall ? m.hookTall || ['PLAY ALONG'] : m.hook || [], programme: episode.program?.title || '', theme, profile: tall ? 'tall' : 'normal' });
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  return f;
}
const endcards = {};
async function endCard(fmt) {
  if (endcards[fmt]) return endcards[fmt];
  const f = path.join(cardsDir, `endcard-${prog}-${fmt}-${stream}.mkv`);
  if (!fs.existsSync(f)) {
    const url = `${base}/lab/clip.html?run=end&format=${fmt}&programme=${encodeURIComponent(episode.program?.title || '')}&theme=${theme}&sting=1&stream=${stream}`;
    await run('node', ['tools/record.mjs', '--url', url, '--seconds', '2.6', '--fps', '30', '--scale', '1', '--lossless', '--seed', '1', '--out', f], { env: { TMPDIR: tmpDir }, quiet: true });
  }
  endcards[fmt] = f;
  return f;
}

// ---------------------------------------------------------------- 5. the clips

/** Frames of the clip (at the channel's own pixels) where the RECREATION label stands at its place, of those it must. */
async function labelEvidence(clip, fmt, window, tl) {
  const recSegs = tl.segments.filter((s) => s.seg.kind === 'restage' || s.seg.recreation);
  const spans = recSegs.map((s) => ({ a: Math.max(0, s.start - window.start), b: Math.min(window.duration, s.end - window.start) })).filter((x) => x.b > x.a);
  if (!spans.length) return null;
  const W = fmt === 'vertical' ? 216 : 384;
  const H = fmt === 'vertical' ? 384 : 216;
  const box = fmt === 'vertical' ? { x0: 100, x1: 210, y0: 75, y1: 88 } : { x0: 150, x1: 372, y0: 23, y1: 36 };
  let total = 0;
  let labelled = 0;
  for (const s of spans) {
    const raw = await new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', ['-v', 'error', '-ss', s.a.toFixed(3), '-t', (s.b - s.a).toFixed(3), '-i', clip, '-vf', 'scale=iw/5:ih/5:flags=neighbor', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
      const chunks = [];
      p.stdout.on('data', (d) => chunks.push(d));
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg frames'))));
    });
    const fsize = W * H * 3;
    for (let off = 0; off + fsize <= raw.length; off += fsize) {
      total++;
      let yellow = 0;
      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
          const i = off + (y * W + x) * 3;
          if (Math.abs(raw[i] - 254) < 28 && Math.abs(raw[i + 1] - 174) < 28 && Math.abs(raw[i + 2] - 52) < 40) yellow++;
        }
      }
      if (yellow >= 30) labelled++;
    }
  }
  return { total, labelled };
}

const clipsDir = path.join(out, 'clips');
fs.mkdirSync(clipsDir, { recursive: true });
const queue = new PublishQueue({ dir: queueDir });
const settings = queue.settings();
const storiesById = new Map();
try {
  const { readArchive } = await import('../lengths/archive.mjs');
  // (the station's archive, and the --sources folder's: the beta's news day keeps its stories there, server/publish/newsday.js)
  for (const dir of [...new Set([path.join(root, 'data'), path.resolve(opt('sources', path.join(root, 'data')))])]) {
    if (!fs.existsSync(path.join(dir, 'archive'))) continue;
    for (const [id, s] of readArchive(path.join(dir, 'archive')).stories) storiesById.set(id, s);
  }
} catch {
  /* no archive: no article links */
}
let presenters = {};
try {
  presenters = JSON.parse(fs.readFileSync(path.join(root, 'config', 'channel.json'), 'utf8')).presenters || {};
} catch {
  /* names fall back to ids */
}
const made = [];
const failed = [];
for (const m of chosen) {
  // the clip's words, once for both formats and every network (the same story, the same facts)
  const facts = packFacts(m, episode, { stories: storiesById, presenters, airedAt, live });
  let pack;
  try {
    pack = await writePackage(facts, { chain, log: { warn: (x) => say(x) } });
  } catch (err) {
    pack = await writePackage(facts, { chain: null });
    say(`packaging ${m.id}: ${String(err?.message || err).slice(0, 160)}; the deterministic writer's words`);
  }
  say(`packaging ${m.id} (${pack.writer}): “${pack.titles[0]}” · ${pack.thumbs.join(' / ')}${pack.rejected?.length ? ` · ${pack.rejected.length} of the AI writer's lines refused` : ''}`);
  for (const fmt of formats) {
    try {
      const tl = timelines[fmt];
      const placed = tl.segments.find((s) => s.index === m.from) ? m : null;
      if (!placed) continue;
      // the moment on this format's own timeline (identical when the run is deterministic)
      const mm = drift > 0.05 ? detectMoments(episode, { timeline: tl }).find((x) => x.id === m.id) || m : m;
      // WORLD WEATHER's horizontal picture wipes into its boards: the clip holds the board's first whole frame over it
      const window = clipWindow(mm, tl, { wipeIn: fmt === 'horizontal' && m.kind === 'weather-board' ? WEATHER_WIPE : 0 });
      const name = `${prog}-${m.kind}-${m.from}-${m.to}-${fmt}`;
      const file = path.join(clipsDir, `${name}.mp4`);
      const hook = await hookPng(m, fmt);
      const end = await endCard(fmt);
      say(`clip ${name}: ${window.start.toFixed(2)}-${window.end.toFixed(2)} s (${window.duration.toFixed(1)} s${window.snappedStart ? ', opens on a cut' : ''}${window.hold ? `, holds the board over its wipe for ${window.hold.toFixed(2)} s` : ''}${window.snappedEnd ? ', ends before the next cut' : ''})`);
      await run('ffmpeg', composeArgs({ master: masters[fmt].file, hook, endcard: end, window, format: fmt, out: file }), { quiet: true });
      const duration = await probeDuration(file);
      const endSeconds = duration - window.duration;
      // what the clip's end card says and how long it holds (the gate holds a clip without it)
      const cards = compliance.clipCards({ endCard: +endSeconds.toFixed(2) });
      fs.writeFileSync(path.join(clipsDir, `${name}.srt`), srtFor(tl, window));
      fs.writeFileSync(path.join(clipsDir, `${name}.vtt`), vttFor(tl, window));
      const contact = path.join(clipsDir, `${name}.contact.png`);
      await run('ffmpeg', contactArgs({ clip: file, format: fmt, times: contactTimes(duration, endSeconds), out: contact }), { quiet: true });
      // the covers (vertical) or thumbnails (horizontal): three variants, from the story's cleared picture (never one
      // of a moment that shows an uncleared picture) and the clip's own frames of the presenter and of its board
      // (the vertical picture's stage, which no caption covers: the horizontal picture's frames carry the captions and
      // the strap, so a horizontal clip's thumbnails take the vertical master's stage when it was made, else only the
      // story's picture)
      const src = masters.vertical ? 'vertical' : null;
      const picks = src ? pickFrames(reports[src], window) : { presenter: null, board: null };
      const frames = {};
      for (const [k, t] of Object.entries(picks)) if (t !== null) frames[k] = { file: await grabFrame(masters[src].file, t, path.join(tmpDir, `${name}.${k}.png`)), rect: STAGE_RECT };
      const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(airedAt)).toUpperCase();
      const covers = await renderCovers({ page: coverPage, fmt, pkg: pack, frames, picture: m.uncleared ? null : pictureOf(episode, m.storyIds, pictureDir), programme: episode.program?.title || 'GLOBIT 24', theme, kicker: `${episode.program?.title || 'GLOBIT 24'} · ${when}`, grave: facts.grave, out: clipsDir, name });
      const thumb = covers[0];
      const labelFrames = await labelEvidence(file, fmt, window, tl);
      // the networks this clip fits (a YouTube clip is a Short: vertical only; its horizontal uploads are whole programmes)
      const platforms = PHASE_PLATFORMS[3].filter((p) => fitsPlatform({ format: fmt, duration }, p).ok && PLATFORMS[p].kind === 'video' && !(PLATFORMS[p].clip === 'shorts' && fmt !== 'vertical'));
      const meta = { name, moment: m, format: fmt, window, duration, files: { video: file, thumb, thumbs: covers, contact, srt: path.join(clipsDir, `${name}.srt`), vtt: path.join(clipsDir, `${name}.vtt`), hook }, package: pack, frames: picks, labelFrames, cards, platforms, texts: {}, compliance: {} };
      for (const p of platforms) {
        const t = clipTexts(m, episode, { platform: p, stories: storiesById, presenters, channelUrl: process.env.CHANNEL_LIVE_URL || null, recorded, pack, airedAt });
        meta.texts[p] = t;
        const gate = compliance.preflight({ id: name, kind: fmt === 'vertical' ? 'short' : 'clip', episode, recording: reports[fmt], range: { start: window.start, end: window.end }, storyIds: m.storyIds, platforms: [p], flags: { [p]: makeAdapter(p, { env: {}, dryRun: true }).aiFlags({ disclosure: t.disclosure, source: { programId: prog } }) }, text: t.text, labelFrames, cards, frame: fmt === 'vertical' ? { layout: 'vertical-216x384', crop: { x: 0, y: 0, w: 216, h: 384 }, output: { w: 1080, h: 1920 } } : null }, { now: Date.now(), register: compliance.register(path.join(root, 'data')), getStory: compliance.clipGetStory(m.storyIds, sourcesOf) });
        // the packaging as it will go out on this network (packaging.js checkPackage: what the owner may paste and upload)
        const packFaults = checkPackage(pack, facts).faults.map((f) => ({ rule: 'packaging', message: `${f.field}: ${f.fault} (“${f.text}”)` }));
        meta.compliance[p] = { ok: gate.ok && !packFaults.length, violations: [...(gate.violations || []), ...packFaults], warnings: gate.warnings || [], stub: compliance.usingStub };
      }
      fs.writeFileSync(path.join(clipsDir, `${name}.json`), JSON.stringify(meta, null, 1));
      // the queue (dry run): a publishable moment, to the networks this phase uses and this clip fits
      const phaseNets = PHASE_PLATFORMS[settings.phase] || PHASE_PLATFORMS[1];
      meta.queued = [];
      if (pub.has(m.id) && !m.uncleared && !flag('no-queue')) {
        const hash = sha256(file);
        for (const p of platforms.filter((x) => phaseNets.includes(x))) {
          const t = meta.texts[p];
          const it = queue.enqueue({
            kind: 'clip',
            platform: p,
            format: fmt,
            title: t.title,
            text: t.text,
            description: t.description,
            hashtags: t.hashtags,
            tags: ['GLOBIT 24', episode.program?.title, ...t.hashtags].filter(Boolean),
            links: t.links,
            media: { video: file, thumb, thumbs: covers, contact, captions: meta.files.srt, duration, sha256: hash },
            // the packaging: what the owner chooses from (three titles, three covers) and what every later check
            // measures them against (manual.js packageFaults)
            package: { titles: pack.titles, thumbs: pack.thumbs, hook: pack.hook, lead: pack.lead, hashtags: pack.hashtags, writer: pack.writer, facts: { ...facts, sources: [] } },
            source: { episodeId: episode.id, programId: prog, momentId: m.id, storyIds: m.storyIds, airedAt },
            disclosure: { [p]: t.disclosure[p] },
            compliance: meta.compliance[p],
            score: m.scores.total,
            priority: m.kind.startsWith('quiz') ? 2 : 1,
            // (--sources: the item's stories are measured against that folder at every later check too: the re-check, the page)
            gate: { episodeFile: path.resolve(epFile), reportFile: masters[fmt].report, range: { start: window.start, end: window.end }, labelFrames, cards, frame: fmt === 'vertical' ? { layout: 'vertical-216x384', crop: { x: 0, y: 0, w: 216, h: 384 }, output: { w: 1080, h: 1920 } } : null, ...(opt('sources') ? { sourcesDir: path.resolve(opt('sources')) } : {}) },
            dryRun: true,
          });
          if (it) meta.queued.push({ platform: p, id: it.id, status: it.status });
        }
        fs.writeFileSync(path.join(clipsDir, `${name}.json`), JSON.stringify(meta, null, 1));
      }
      made.push(meta);
    } catch (err) {
      // one clip that fails (a cut ffmpeg refuses, a card that will not draw) never stops the others: it is reported
      failed.push({ moment: m.id, format: fmt, error: String(err?.message || err).slice(0, 400) });
      say(`clip ${m.id} (${fmt}) FAILED: ${String(err?.message || err).slice(0, 200)}`);
    }
  }
}
await coverPage.close();
await browser.close();
await pb.close();

// ---------------------------------------------------------------- 6. the summary

const summary = {
  episode: { id: episode.id, programme: episode.program?.title, airedAt: new Date(airedAt).toISOString(), demo: !!episode.demo },
  recorded: seconds,
  drift,
  moments: all.map((m) => ({ id: m.id, kind: m.kind, start: m.start, end: m.end, duration: m.duration, scores: m.scores, hook: m.hook, light: m.light, grave: m.grave, refused: m.refused, copied: !!m.copied, uncleared: !!m.uncleared, publishable: pub.has(m.id) })),
  failed,
  clips: made.map((c) => ({ name: c.name, format: c.format, duration: +c.duration.toFixed(2), window: c.window, video: c.files.video, contact: c.files.contact, covers: c.files.thumbs, titles: c.package?.titles, writer: c.package?.writer, platforms: c.platforms, compliance: Object.fromEntries(Object.entries(c.compliance).map(([p, v]) => [p, v.ok ? 'ok' : v.violations.map((x) => x.rule).join(',')])), queued: c.queued, labelFrames: c.labelFrames })),
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
// (a rendered master is a link here: only the link goes)
if (!flag('keep-masters') && !opt('masters')) for (const m of Object.values(masters)) fs.rmSync(m.file, { force: true });
// the playout's master folder: cut (its disk policy keeps it an hour more, then lets it go)
for (const dir of renderedUsed) if (fs.existsSync(path.join(dir, 'unit.json'))) fs.writeFileSync(path.join(dir, 'factory.json'), JSON.stringify({ at: new Date().toISOString(), out, clips: made.length, failed: failed.length, formats }, null, 1));
fs.rmSync(tmpDir, { recursive: true, force: true });
say(`${made.length} clips -> ${clipsDir}${failed.length ? ` (${failed.length} FAILED: see summary.json)` : ''}`);
if (failed.length) process.exitCode = 2;
