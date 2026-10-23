#!/usr/bin/env node
// The channel's own publishing round, with no one at the desk (the owner's word, 18 Oct: "que sea autónomo", every
// programme published, several a day, in playlists by type): what the pre-rendered playout rendered becomes the queue's
// pieces, then the publisher's round sends what is due. Run it on a timer (systemd, every 30 minutes).
//
//   node tools/publish/auto.mjs [--masters data/playout/masters] [--work data/publish/auto] [--max 1] [--no-publish]
//
// For each programme the playout rendered (data/playout/masters/<episode id>/: episode.json, horizontal.mkv and its
// report), newest first, at most --max a round:
//   1. a copy of the folder into the work folder, so the playout's disk policy can let its master go while the pieces
//      wait in the queue (their gate reads the episode and the report again at the moment of publishing)
//   2. its clips (tools/publish/factory.mjs --from-playout, vertical: YouTube Shorts and TikTok)
//   3. the whole programme (tools/publish/upload.mjs --from-playout: video, thumbnail, chapters, sources)
//   4. done.json, so it is never made twice (a step that failed is tried again next round, three rounds at most)
// then tools/publish/run.mjs: the re-check, the schedule (each network's hours, spacing and the phase's daily caps) and
// what is due. What goes out and how is the queue's settings and the live switches (setup.md §7), never this file: in
// a dry run it makes the pieces and sends nothing. An episode the offline writer wrote is skipped (it copies its
// sources: never published). One round at a time (a lock file); each step at low priority, beside the renderer.
import fs from 'node:fs';
import path from 'node:path';
import { root, argsOf, run } from './lib.mjs';

const { opt, flag } = argsOf();
const MASTERS = path.resolve(opt('masters', path.join(root, 'data', 'playout', 'masters')));
const WORK = path.resolve(opt('work', path.join(root, 'data', 'publish', 'auto')));
const MAX = Math.max(0, Number(opt('max', 1)));
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

let made = 0;
for (const p of waiting()) {
  if (made >= MAX) break;
  const title = p.episode.program?.title || p.episode.program?.id || p.id;
  fs.mkdirSync(path.join(WORK, p.id), { recursive: true });
  if (p.episode.provider === 'mock') {
    done(p.id, { skipped: 'written by the offline writer (copies its sources: never published)' });
    say(`${title} ${p.id}: skipped (the offline writer's)`);
    continue;
  }
  made++;
  // (the copy keeps the episode's id as its name: the tools find a rendered master by it, server/publish/masters.js)
  const src = path.join(WORK, p.id, p.id);
  fs.rmSync(src, { recursive: true, force: true });
  fs.cpSync(p.dir, src, { recursive: true });
  const record = { programme: title, programId: p.episode.program?.id || null };
  say(`${title} ${p.id}: clips`);
  try {
    await nice(['tools/publish/factory.mjs', '--from-playout', src, '--out', path.join(WORK, p.id, 'clips'), '--formats', 'vertical']);
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
if (!made) say('nothing new from the playout');

if (!flag('no-publish')) {
  say('the publisher\'s round');
  try {
    await nice(['tools/publish/run.mjs']);
  } catch (err) {
    say(`the publisher's round failed: ${err.message.slice(-300)}`);
    process.exitCode = 1;
  }
}
