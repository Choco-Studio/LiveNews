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
import { root, argsOf, run, loadPlaywright, probeDuration, recordSeconds, recordMaster } from './lib.mjs';

const { opt, flag } = argsOf();
const epFile = opt('episode');
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

const pb = createPlaybackServer({ root });
const port = await pb.listen(0);
const base = `http://127.0.0.1:${port}`;
let master = opt('master') ? { file: path.resolve(opt('master')), report: path.resolve(opt('report')) } : null;
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
const meta = uploadMeta(episode, { timeline, stories, airedAt, url: process.env.CHANNEL_LIVE_URL || null });
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
await run('node', ['tools/record.mjs', '--url', `${base}/?autostart=1&voice=tts&clip=clean`, '--item', path.resolve(epFile), '--seconds', String(Math.ceil(at + 1)), '--fps', '30', '--scale', '1', '--lossless', '--progressive', '--seed', '1', '--time', new Date(airedAt).toISOString(), '--out', plate], { env: { TMPDIR: tmpDir }, quiet: true });
await run('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', plate, '-frames:v', '1', framePng], { quiet: true });
fs.rmSync(plate, { force: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/lab/thumb.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__thumbLab);
const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(airedAt)).toUpperCase();
const lead = episode.quiz ? null : firstStory?.seg?.headline || '';
const spec = {
  frame: `data:image/png;base64,${fs.readFileSync(framePng).toString('base64')}`,
  programme: episode.program?.title || 'GLOBIT 24',
  theme: THEME,
  lines: episode.quiz ? ['NEWS QUIZ', 'PLAY ALONG'] : episode.weather ? ['THE WORLD', 'TODAY'] : undefined,
  lead,
  fallback: episode.program?.tagline || '',
  kicker: `FULL PROGRAMME · ${when}`,
  side,
};
const thumbSmall = path.join(tmpDir, 'thumb-1x.png');
fs.writeFileSync(thumbSmall, Buffer.from((await page.evaluate((s) => window.__thumbLab.compose(s), spec)).split(',')[1], 'base64'));
let thumb = path.join(out, `${prog}.thumb.png`);
await run('ffmpeg', ['-v', 'error', '-y', '-i', thumbSmall, '-vf', 'scale=iw*5:ih*5:flags=neighbor', thumb], { quiet: true });
// YouTube takes a thumbnail up to 2 MB
if (fs.statSync(thumb).size > 2 * 1024 * 1024) {
  const jpg = thumb.replace(/\.png$/, '.jpg');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', thumb, '-q:v', '2', jpg], { quiet: true });
  fs.rmSync(thumb);
  thumb = jpg;
}
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
  await run('node', ['tools/record.mjs', '--url', `${base}/lab/clip.html?run=end&format=horizontal&programme=${encodeURIComponent(episode.program?.title || '')}&theme=${THEME}&sting=1`, '--seconds', '2.6', '--fps', '30', '--scale', '1', '--lossless', '--seed', '1', '--out', endcard], { env: { TMPDIR: tmpDir }, quiet: true });
  video = path.join(out, `${prog}.mp4`);
  say(`video: ${D.toFixed(1)} s + end card`);
  await run('ffmpeg', composeArgs({ master: master.file, hook: null, endcard, window: { start: 0, duration: D }, format: 'horizontal', out: video }), { quiet: true });
  fs.writeFileSync(path.join(out, `${prog}.srt`), srtFor(timeline, { start: 0, end: D, duration: D }));
}
await pb.close();

// ---------------------------------------------------------------- the verdict, the files, the queue

const gate = compliance.preflight({ id: `${prog}-episode`, kind: 'episode', episode, recording: report, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true } }, text: meta.description }, { now: Date.now() });
const record = { episode: { id: episode.id, programme: episode.program?.title, airedAt: new Date(airedAt).toISOString() }, ...meta, duration: D, thumb, video, compliance: { ok: gate.ok, violations: gate.violations || [], warnings: gate.warnings || [], stub: compliance.usingStub }, frameAt: at };
fs.writeFileSync(path.join(out, `${prog}.upload.json`), JSON.stringify(record, null, 1));
fs.writeFileSync(path.join(out, `${prog}.description.txt`), `${meta.title}\n\n${meta.description}\n\nTags: ${meta.tags.join(', ')}\n`);
const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))) });
if (video && meta.worthy && queue.settings().phase >= 2) {
  const it = queue.enqueue({
    kind: 'episode',
    platform: 'youtube',
    format: 'horizontal',
    title: meta.title,
    text: meta.description,
    description: meta.description,
    tags: meta.tags,
    links: meta.sources.filter((s) => s.link).map((s) => ({ label: s.outlet, url: s.link })),
    media: { video, thumb, captions: path.join(out, `${prog}.srt`), duration: D + 2.6, sha256: crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex') },
    source: { episodeId: episode.id, programId: prog, storyIds: [...new Set(episode.segments.map((s) => s.storyId).filter(Boolean))], airedAt },
    disclosure: { youtube: { containsSyntheticMedia: true } },
    compliance: record.compliance,
    score: 5,
    priority: 1,
    gate: { episodeFile: path.resolve(epFile), reportFile: master.report, range: null },
    dryRun: true,
  });
  say(`queued: ${it?.id} (${it?.status})`);
} else say(`not queued (${!video ? 'no video' : !meta.worthy ? 'not worth a full upload' : 'full uploads begin in Phase 2'})`);
if (!opt('master') && master.file) fs.rmSync(master.file, { force: true });
fs.rmSync(tmpDir, { recursive: true, force: true });
say(`-> ${out}`);
