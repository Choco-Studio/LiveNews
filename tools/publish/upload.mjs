#!/usr/bin/env node
// A whole programme for YouTube (docs/publishing/plan.md §5, Phase 2): the programme as it aired in clip mode (no
// clock, no ticker, the AI mark beside the bug) with the end card, its thumbnail from its own frames with its title in
// the channel's type, its title, description (the disclosure, what it covers, chapters, every source linked,
// credits), tags and chapters, the compliance desk's verdict; queued for YouTube when the phase takes full uploads.
// Dry run: nothing is uploaded.
//
//   node tools/publish/upload.mjs --episode ep.json --out <dir> [--master m.mkv --report r.json] [--queue data/publish]
//        [--no-video] (the metadata and the thumbnail only)
//        [--video v.mp4] (an upload composed earlier, with the --report of the master it was made from: queued once the
//        phase takes full uploads, with no master and no new render)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPlaybackServer } from '../../server/publish/playback.js';
import { buildTimeline } from '../../server/publish/timeline.js';
import { uploadMeta } from '../../server/publish/uploads.js';
import { composeArgs, srtFor } from '../../server/publish/render.js';
import { PublishQueue } from '../../server/publish/queue.js';
import * as compliance from '../../server/publish/compliance.js';
import { makeAdapter } from '../../server/publish/adapters/index.js';
import { renderedMaster } from '../../server/publish/masters.js';
import { streamOf } from '../../public/js/airmode.js';
import { root, argsOf, run, loadPlaywright, probeDuration, recordSeconds, recordMaster } from './lib.mjs';
import { episodeFacts, writePackage } from '../../server/publish/packaging.js';
import { packagingChain, renderCovers, pictureOf, coverCast } from './packager.mjs';

const { opt, flag } = argsOf();
// --from-playout <dir>: a programme the pre-rendered playout rendered (docs/publishing/playout.md §6): its episode, its
// horizontal clip-mode master and its report, so the whole programme is never recorded again
const fromPlayout = opt('from-playout') ? path.resolve(opt('from-playout')) : null;
const epFile = fromPlayout ? path.join(fromPlayout, 'episode.json') : opt('episode');
if (!epFile || !opt('out')) {
  console.error('usage: node tools/publish/upload.mjs --episode ep.json --out <dir> [--master m.mkv --report r.json]');
  process.exit(1);
}
const out = path.resolve(opt('out'));
const tmpDir = path.join(out, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const say = (m) => console.log(`[upload] ${m}`);
const episode = JSON.parse(fs.readFileSync(epFile, 'utf8'));
const prog = episode.program?.id || 'programme';
const airedAt = Date.parse(episode.airedAt || episode.createdAt || '') || Date.now();
const THEME = episode.program?.theme || 'world';

// (pre-rendered playout: a playout master, or PLAYOUT=1 / CHANNEL_AIR=recorded: the description never says live)
const recorded = !!fromPlayout || /^(1|true|yes|on)$/i.test(process.env.PLAYOUT || '') || /^recorded$/i.test(process.env.CHANNEL_AIR || '');
// the end cards point to a stream only when there is one (airmode.js streamOf: LIVE only when it is live): the clip
// end card after the programme, and the programme's own end card in the recording (the playback page's channel)
const stream = streamOf({ url: process.env.CHANNEL_LIVE_URL || null, recorded });
const pictureDir = opt('pictures') ? path.resolve(opt('pictures')) : null;
const pb = createPlaybackServer({ root, stream, pictureDir });
const port = await pb.listen(0);
const base = `http://127.0.0.1:${port}`;
let master = opt('master') ? { file: path.resolve(opt('master')), report: path.resolve(opt('report')) } : null;
if (!master && fromPlayout) {
  master = renderedMaster(episode, 'horizontal', [path.dirname(fromPlayout)]);
  if (!master) {
    console.error(`[upload] no rendered master in ${fromPlayout} (horizontal.mkv and its report, the folder named for the episode)`);
    process.exit(1);
  }
}
// (the metadata and the thumbnail need only the recording's report: --report with --no-video records no master)
if (!master && opt('report') && (flag('no-video') || opt('video'))) master = { file: null, report: path.resolve(opt('report')) };
if (!master) master = await recordMaster({ base, epFile, fmt: 'horizontal', file: path.join(tmpDir, `${prog}-horizontal.mkv`), report: path.join(out, `${prog}.report.json`), seconds: Number(opt('seconds', recordSeconds(episode))), airedAt, tmpDir, say });
const report = JSON.parse(fs.readFileSync(master.report, 'utf8'));
const timeline = buildTimeline(episode, report);
// the programme ends 2 s after its last word (the recording runs on generously)
const last = timeline.segments.at(-1);
const masterSeconds = master.file ? await probeDuration(master.file) : Number(report.seconds) || (last?.end ?? 0) + 2;
const D = Math.min(masterSeconds, (last?.end ?? masterSeconds) + 2);
timeline.duration = D;

const stories = new Map();
try {
  const { readArchive } = await import('../lengths/archive.mjs');
  for (const [id, s] of readArchive(path.join(root, 'data', 'archive')).stories) stories.set(id, s);
} catch {
  /* no archive: no article links */
}
const meta = uploadMeta(episode, { timeline, stories, airedAt, url: process.env.CHANNEL_LIVE_URL || null, recorded });
say(`"${meta.title}" · ${meta.chapters.length} chapters · ${meta.sources.length} sources · ${meta.worthy ? 'worth a full upload' : `not for upload: ${meta.why.join('; ')}`}`);

// ---------------------------------------------------------------- the thumbnail: the programme's own frame

// the frame: the presenter's first close shot in the first story (the studio's grammar puts her left and the wall
// right, so the type goes right, over the wall's board; the cut lands just before the first word, as clipWindow
// knows), else two seconds into it, or the quiz's first board
const firstStory = timeline.segments.find((s) => s.seg.type === 'story') || timeline.segments.find((s) => s.seg.part === 'frame') || timeline.segments[1] || timeline.segments[0];
const close = firstStory?.seg?.type === 'story' ? (report.events || []).find((e) => e.type === 'shot' && e.shot === 'close' && e.v >= firstStory.start - 1.5 && e.v + 2 <= firstStory.end) : null;
const at = Math.min(D - 1, close ? close.v + 1.5 : (firstStory?.start ?? 5) + 2);
const side = close ? 'right' : 'left';
const framePng = path.join(tmpDir, 'frame.png');
// the frame from a clean plate (?clip=clean: the same deterministic run with no bug, strap or caption), so the
// thumbnail's own type never sits on the programme's
const plate = path.join(tmpDir, 'plate.mkv');
// (a programme whose first story has no close shot, the quiz, the weather: its first studio shot in its first minute,
// for the packaging's presenter thumbnail, B)
const studio = close ? null : (report.events || []).find((e) => e.type === 'shot' && (e.shot === 'close' || e.shot === 'wide') && e.v > 3 && e.v < 75 && e.v + 1.2 < D);
// (and the next studio shot, a second face: a quiz's other player)
const studio2 = studio ? (report.events || []).find((e) => e.type === 'shot' && ['close', 'wide', 'two', 'single'].includes(e.shot) && e.v > studio.v + 5 && e.v < studio.v + 90 && e.v + 1.2 < D) : null;
const studioPng = path.join(tmpDir, 'studio.png');
const studio2Png = path.join(tmpDir, 'studio2.png');
await run('node', ['tools/record.mjs', '--url', `${base}/?autostart=1&voice=tts&clip=clean`, '--item', path.resolve(epFile), '--seconds', String(Math.ceil(Math.max(at, studio ? studio.v + 1.2 : 0, studio2 ? studio2.v + 1.2 : 0) + 1)), '--fps', '30', '--scale', '1', '--lossless', '--progressive', '--seed', '1', '--time', new Date(airedAt).toISOString(), '--out', plate], { env: { TMPDIR: tmpDir }, quiet: true });
await run('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', plate, '-frames:v', '1', framePng], { quiet: true });
if (studio) await run('ffmpeg', ['-v', 'error', '-y', '-ss', (studio.v + 1.0).toFixed(2), '-i', plate, '-frames:v', '1', studioPng], { quiet: true });
if (studio2) await run('ffmpeg', ['-v', 'error', '-y', '-ss', (studio2.v + 1.0).toFixed(2), '-i', plate, '-frames:v', '1', studio2Png], { quiet: true });
fs.rmSync(plate, { force: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/lab/thumb.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__thumbLab?.cover);
const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(airedAt)).toUpperCase();
// the packaging (docs/publishing/thumbnails-titles.md): three titles and three thumbnails for YouTube's Test & Compare,
// written by the AI writer of the configured chain (every field checked) or the deterministic writer, from the
// programme's facts; the thumbnails from its lead story's cleared picture and its own clean frame of the presenter
let presenters = {};
try {
  presenters = JSON.parse(fs.readFileSync(path.join(root, 'config', 'channel.json'), 'utf8')).presenters || {};
} catch {
  /* names fall back to ids */
}
const facts = episodeFacts(episode, { stories, presenters, airedAt, duration: D, title: meta.title, live: !!process.env.CHANNEL_LIVE_URL && !recorded });
const pack = await writePackage(facts, { chain: flag('no-ai') ? null : await packagingChain({ log: { warn: (m) => say(m) } }) });
say(`packaging (${pack.writer}): ${pack.titles.map((t) => `“${t}”`).join(' / ')} · ${pack.thumbs.join(' / ')}`);
const leadId = (episode.segments || []).find((x) => x.type === 'story' && x.storyId)?.storyId;
// (the clean plate: no bug, strap or caption; the presenter stands left in a close shot, the frame's middle otherwise)
// (a close shot: the presenter, standing left; else the frame is a board or a map, shown whole)
// (never a quiz's board: its lines of type are unreadable at YouTube's sizes; its players' faces instead)
const studioRect = { x: 84, y: 20, w: 216, h: 176 };
const faces = { ...(studio && fs.existsSync(studioPng) ? { presenter: { file: studioPng, rect: studioRect } } : {}), ...(facts.quizShow && studio2 && fs.existsSync(studio2Png) ? { presenter2: { file: studio2Png, rect: studioRect } } : {}) };
const frames = close ? { presenter: { file: framePng, rect: { x: 0, y: 20, w: 216, h: 176 } } } : facts.quizShow && faces.presenter ? faces : { board: { file: framePng, rect: { x: 0, y: 0, w: 384, h: 216, focusY: 0.3 } }, ...faces };
const thumbs = await renderCovers({ page, fmt: 'horizontal', pkg: pack, frames, picture: leadId ? pictureOf(episode, [leadId], pictureDir) : null, pictureOnlyA: true, programme: episode.program?.title || 'GLOBIT 24', theme: THEME, kicker: `FULL PROGRAMME · ${when}`, grave: facts.grave, ...coverCast(episode), out, name: prog });
// YouTube takes a thumbnail up to 2 MB
for (const [i, f] of thumbs.entries()) {
  if (fs.statSync(f).size <= 2 * 1024 * 1024) continue;
  const jpg = f.replace(/\.png$/, '.jpg');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-q:v', '2', jpg], { quiet: true });
  fs.rmSync(f);
  thumbs[i] = jpg;
}
const thumb = thumbs[0];
await browser.close();

// ---------------------------------------------------------------- the video

let video = opt('video') ? path.resolve(opt('video')) : null;
if (video && !fs.existsSync(video)) {
  console.error(`no such video: ${video}`);
  process.exit(1);
}
if (video) {
  say(`video: ${path.basename(video)} (composed earlier)`);
  fs.writeFileSync(path.join(out, `${prog}.srt`), srtFor(timeline, { start: 0, end: D, duration: D }));
} else if (!flag('no-video')) {
  const endcard = path.join(tmpDir, 'endcard.mkv');
  await run('node', ['tools/record.mjs', '--url', `${base}/lab/clip.html?run=end&format=horizontal&programme=${encodeURIComponent(episode.program?.title || '')}&theme=${THEME}&sting=1&stream=${stream}`, '--seconds', '2.6', '--fps', '30', '--scale', '1', '--lossless', '--seed', '1', '--out', endcard], { env: { TMPDIR: tmpDir }, quiet: true });
  video = path.join(out, `${prog}.mp4`);
  say(`video: ${D.toFixed(1)} s + end card`);
  await run('ffmpeg', composeArgs({ master: master.file, hook: null, endcard, window: { start: 0, duration: D }, format: 'horizontal', out: video }), { quiet: true });
  fs.writeFileSync(path.join(out, `${prog}.srt`), srtFor(timeline, { start: 0, end: D, duration: D }));
}
await pb.close();

// ---------------------------------------------------------------- the verdict, the files, the queue

const gate = compliance.preflight({ id: `${prog}-episode`, kind: 'episode', episode, recording: report, platforms: ['youtube'], flags: { youtube: makeAdapter('youtube', { env: {}, dryRun: true }).aiFlags({ kind: 'episode', source: { programId: prog } }) }, text: meta.description }, { now: Date.now(), register: compliance.register(path.join(root, 'data')), getStory: compliance.archiveGetStory({ dataDir: path.join(root, 'data') }) });
const record = { episode: { id: episode.id, programme: episode.program?.title, airedAt: new Date(airedAt).toISOString() }, ...meta, title: pack.titles[0], titles: pack.titles, duration: D, thumb, thumbs, package: pack, video, compliance: { ok: gate.ok, violations: gate.violations || [], warnings: gate.warnings || [], stub: compliance.usingStub }, frameAt: at };
fs.writeFileSync(path.join(out, `${prog}.upload.json`), JSON.stringify(record, null, 1));
fs.writeFileSync(path.join(out, `${prog}.description.txt`), `${meta.title}\n\n${meta.description}\n\nTags: ${meta.tags.join(', ')}\n`);
const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))) });
// a programme with a picture not cleared for publication (or made as a private preview) is never queued
const unclearedPictures = episode.picturePreview || (compliance.auditItem(episode).missing || []).some((a) => a.kind === 'picture');
if (video && meta.worthy && !unclearedPictures && queue.settings().phase >= 2) {
  const it = queue.enqueue({
    kind: 'episode',
    platform: 'youtube',
    format: 'horizontal',
    title: pack.titles[0],
    text: meta.description,
    description: meta.description,
    tags: meta.tags,
    links: meta.sources.filter((s) => s.link).map((s) => ({ label: s.outlet, url: s.link })),
    package: { titles: pack.titles, thumbs: pack.thumbs, hook: pack.hook, lead: pack.lead, hashtags: pack.hashtags, writer: pack.writer, facts: { ...facts, sources: [] } },
    media: { video, thumb, thumbs, captions: path.join(out, `${prog}.srt`), duration: D + 2.6, sha256: crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex') },
    source: { episodeId: episode.id, programId: prog, programTitle: episode.program?.title || null, storyIds: [...new Set(episode.segments.map((s) => s.storyId).filter(Boolean))], airedAt },
    disclosure: { youtube: { containsSyntheticMedia: true } },
    compliance: record.compliance,
    score: 5,
    priority: 1,
    gate: { episodeFile: path.resolve(epFile), reportFile: master.report, range: null },
    dryRun: true,
  });
  say(`queued: ${it?.id} (${it?.status})`);
} else say(`not queued (${!video ? 'no video' : !meta.worthy ? 'not worth a full upload' : unclearedPictures ? (episode.picturePreview ? 'a private preview (PICTURE_RIGHTS=preview) is never published' : 'a picture is not cleared for publication') : 'full uploads begin in Phase 2'})`);
if (!opt('master') && master.file) fs.rmSync(master.file, { force: true });
fs.rmSync(tmpDir, { recursive: true, force: true });
say(`-> ${out}`);
