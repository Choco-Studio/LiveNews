#!/usr/bin/env node
// The channel's own publishing round, with no one at the desk (the owner's word, 18 Oct: "que sea autónomo", every
// programme published, several a day, in playlists by type): what the pre-rendered playout rendered becomes the queue's
// pieces, then the publisher's round sends what is due. Run it on a timer (systemd, every 30 minutes).
//
//   node tools/publish/auto.mjs [--masters data/playout/masters] [--work data/publish/auto] [--max 1] [--no-publish]
//        [--fresh-hours 24] [--backlog 8] [--clips 2] [--skip world-weather]
//
// First, a piece that would reach its network more than --fresh-hours after its programme aired leaves the queue
// (server/publish/autoplan.js). Then, while fewer than --backlog pieces wait for YouTube, at most --max programmes a
// round, each the newest edition of the type made least recently (the programmes in turn), aired within --fresh-hours
// (data/playout/masters/<episode id>/: episode.json, horizontal.mkv and its report):
//   1. a copy of the folder into the work folder, so the playout's disk policy can let its master go while the pieces
//      wait in the queue (their gate reads the episode and the report again at the moment of publishing)
//   2. its best --clips clips (tools/publish/factory.mjs --from-playout, vertical: YouTube Shorts and TikTok)
//   3. the whole programme (tools/publish/upload.mjs --from-playout: video, thumbnail, chapters, sources)
//   4. done.json, so it is never made twice (a step that failed is tried again next round, three rounds at most)
// then tools/publish/run.mjs: the re-check, the schedule (each network's hours, spacing and the phase's daily caps) and
// what is due. What goes out and how is the queue's settings and the live switches (setup.md §7), never this file: in
// a dry run it makes the pieces and sends nothing. An episode the offline writer wrote is skipped (it copies its
// sources: never published). One round at a time (a lock file); each step at low priority, beside the renderer.
import fs from 'node:fs';
import path from 'node:path';
import { PublishQueue } from '../../server/publish/queue.js';
import { AUTO_DEFAULTS, stale, backlog, nextProgramme } from '../../server/publish/autoplan.js';
import { root, argsOf, run } from './lib.mjs';

const { opt, flag } = argsOf();
const MASTERS = path.resolve(opt('masters', path.join(root, 'data', 'playout', 'masters')));
const WORK = path.resolve(opt('work', path.join(root, 'data', 'publish', 'auto')));
const MAX = Math.max(0, Number(opt('max', 1)));
const FRESH = Number(opt('fresh-hours', AUTO_DEFAULTS.freshHours));
const BACKLOG = Number(opt('backlog', AUTO_DEFAULTS.backlog));
const CLIPS = Number(opt('clips', AUTO_DEFAULTS.clipsPerProgramme));
// programmes never published from here: WORLD WEATHER's data is Open-Meteo's free, non-commercial API (the paid plan
// is a launch blocker: compliance.md), unless --skip says otherwise
const SKIP = new Set(String(opt('skip', 'world-weather')).split(',').map((x) => x.trim()).filter(Boolean));
const say = (m) => console.log(`${new Date().toISOString().slice(0, 19)} [auto] ${m}`);
const nice = (args) => run('nice', ['-n', '10', 'node', ...args], { env: { PLAYOUT: '1' } });

fs.mkdirSync(WORK, { recursive: true });
const lock = path.join(WORK, 'round.lock');
try {
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
} catch {
  const pid = Number(fs.readFileSync(lock, 'utf8'));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    /* gone */
  }
  if (alive) {
    say(`a round is already running (pid ${pid})`);
    process.exit(0);
  }
  fs.writeFileSync(lock, String(process.pid));
}
const unlock = () => fs.rmSync(lock, { force: true });
process.on('exit', unlock);

/** The programmes the playout rendered and this desk has not made yet, newest first. */
function waiting() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(MASTERS);
  } catch {
    return [];
  }
  const list = [];
  for (const id of dirs) {
    const dir = path.join(MASTERS, id);
    if (fs.existsSync(path.join(WORK, id, 'done.json'))) continue;
    if (!['episode.json', 'horizontal.mkv', 'horizontal.report.json', 'unit.json'].every((f) => fs.existsSync(path.join(dir, f)))) continue;
    let unit;
    let episode;
    try {
      unit = JSON.parse(fs.readFileSync(path.join(dir, 'unit.json'), 'utf8'));
      episode = JSON.parse(fs.readFileSync(path.join(dir, 'episode.json'), 'utf8'));
    } catch {
      continue;
    }
    list.push({ id, dir, airEnd: Date.parse(unit.airEnd) || 0, episode });
  }
  return list.sort((a, b) => b.airEnd - a.airEnd);
}

const done = (id, record) => fs.writeFileSync(path.join(WORK, id, 'done.json'), JSON.stringify({ at: new Date().toISOString(), ...record }, null, 1));

// news a day late is not news: what would go out more than a day after its programme aired leaves the queue
const queue = new PublishQueue({ dir: path.join(root, 'data', 'publish') });
for (const it of queue.list({})) {
  const why = stale(it, Date.now(), { freshHours: FRESH });
  if (!why) continue;
  queue.reject(it.id, 'auto', `stale: ${why}`);
  say(`let go (${why}): ${it.platform} ${it.title}`);
}

const typesFile = path.join(WORK, 'types.json');
const lastMade = fs.existsSync(typesFile) ? JSON.parse(fs.readFileSync(typesFile, 'utf8')) : {};
let made = 0;
let candidates = [];
for (const p of waiting()) {
  const title = p.episode.program?.title || p.episode.program?.id || p.id;
  fs.mkdirSync(path.join(WORK, p.id), { recursive: true });
  if (p.episode.provider === 'mock') {
    done(p.id, { skipped: 'written by the offline writer (copies its sources: never published)' });
    say(`${title} ${p.id}: skipped (the offline writer's)`);
  } else if (SKIP.has(p.episode.program?.id)) done(p.id, { skipped: `${title} is not published from here (--skip)` });
  else if (Date.now() - p.airEnd > FRESH * 3600_000) done(p.id, { skipped: `aired more than ${FRESH} h ago` });
  else candidates.push({ ...p, title, programId: p.episode.program?.id || p.id });
}
// about a day of pieces waiting is enough: the round makes more as they go out (the playout keeps the masters)
const waitingYoutube = backlog(queue.list({}), 'youtube');
if (waitingYoutube >= BACKLOG) {
  say(`${waitingYoutube} pieces wait for YouTube (at most ${BACKLOG}): nothing new this round`);
  candidates = [];
}
while (made < MAX) {
  const p = nextProgramme(candidates, lastMade, { freshHours: FRESH });
  if (!p) break;
  candidates = candidates.filter((c) => c.id !== p.id);
  const title = p.title;
  made++;
  // (the copy keeps the episode's id as its name: the tools find a rendered master by it, server/publish/masters.js)
  const src = path.join(WORK, p.id, p.id);
  fs.rmSync(src, { recursive: true, force: true });
  fs.cpSync(p.dir, src, { recursive: true });
  const record = { programme: title, programId: p.programId };
  say(`${title} ${p.id}: clips`);
  try {
    await nice(['tools/publish/factory.mjs', '--from-playout', src, '--out', path.join(WORK, p.id, 'clips'), '--formats', 'vertical', '--max', String(CLIPS)]);
    record.clips = 'ok';
  } catch (err) {
    record.clips = err.message.slice(-300);
    say(`${title}: the clips failed: ${record.clips}`);
  }
  say(`${title} ${p.id}: the whole programme`);
  try {
    await nice(['tools/publish/upload.mjs', '--from-playout', src, '--out', path.join(WORK, p.id, 'full')]);
    record.full = 'ok';
  } catch (err) {
    record.full = err.message.slice(-300);
    say(`${title}: the whole programme failed: ${record.full}`);
  }
  lastMade[p.programId] = Date.now();
  fs.writeFileSync(typesFile, JSON.stringify(lastMade, null, 1));
  const triesFile = path.join(WORK, p.id, 'tries.json');
  const tries = (fs.existsSync(triesFile) ? Number(fs.readFileSync(triesFile, 'utf8')) || 0 : 0) + 1;
  if ((record.clips !== 'ok' || record.full !== 'ok') && tries < 3) {
    fs.writeFileSync(triesFile, String(tries));
    say(`${title}: tried ${tries} of 3; again next round`);
    continue;
  }
  // (the master is cut and composed: only the episode and the reports stay, for the gate at the moment of publishing)
  fs.rmSync(path.join(src, 'horizontal.mkv'), { force: true });
  done(p.id, { ...record, tries });
}
if (!made) say('nothing new made this round');

if (!flag('no-publish')) {
  say('the publisher\'s round');
  try {
    await nice(['tools/publish/run.mjs']);
  } catch (err) {
    say(`the publisher's round failed: ${err.message.slice(-300)}`);
    process.exitCode = 1;
  }
}
