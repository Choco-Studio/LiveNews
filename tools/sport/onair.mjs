#!/usr/bin/env node
// FULL TIME on air at a chosen moment, for a recording (docs/programmes/full-time.md §9, step 7). The real server
// (server/index.js: the station, the producer, the voice service, the picture cache) runs under a clock frozen at the
// air time and running on from there, with the draft in the rotation and starting the channel; the first edition it
// makes is saved, with its recorded voices, for tools/record.mjs --item, while the same server keeps serving that
// edition's voice clips (/api/voice), pictures (/api/img) and the break after it.
//
//   PORT=8781 node tools/sport/onair.mjs offline 2026-10-17T18:30:00+01:00 --save /tmp/ft/matchday.json
//   PORT=8782 node tools/sport/onair.mjs 2026-10-13T0820 2026-10-13T09:20:55+01:00 --save /tmp/ft/quiet.json
//   node tools/record.mjs --url "http://127.0.0.1:8781/?autostart=1&voice=tts" --item /tmp/ft/matchday.json \
//     --time 2026-10-17T18:31:00+01:00 --seconds 480 --out /tmp/ft/matchday.mp4 --report /tmp/ft/matchday-report.json
//
// The desk: `offline` is the fixture feeds (config/feeds.fixture.json, fictional); any other name is a live snapshot
// in data/sport-snapshots/<name>/ (tools/sport/take.mjs), read and never written: its feeds and article pages from
// the folder only. Pictures are fetched as on air. Defaults for a recording (any can be overridden from the
// environment): Kokoro voices, the mock writer (the fallback writer), the weather fixture, the draft after WORLD
// WEATHER and the channel starting on it, one episode made ahead, and the first edition waiting for all its voices.
// Nothing in production changes: this is the server, started with a clock and a desk of the test's choosing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freezeAllClocks } from './snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const save = flag('save');
const programme = flag('programme') || 'full-time';
const [desk, air] = args;
if (!desk || !air || !Number.isFinite(Date.parse(air))) {
  console.error('usage: node tools/sport/onair.mjs <offline | snapshot name> <air ISO time> [--save episode.json] [--programme full-time]');
  process.exit(1);
}

const env = (k, v) => {
  if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
};
env('PORT', '8781');
env('DRAFTS_ON_AIR', `${programme}@world-weather`);
env('ROTATION_START', programme);
env('PROVIDERS', 'mock');
env('VOICE_ENGINE', 'kokoro');
env('WEATHER', 'fixture');
env('QUEUE_SIZE', '1');
env('VOICE_FIRST_BUDGET_S', '1800');
if (desk === 'offline') env('FEEDS_FILE', 'config/feeds.fixture.json');

freezeAllClocks(Date.parse(air));

if (desk !== 'offline') {
  // a live snapshot, read only: the feeds and the article pages from its folder, never the network
  const dir = path.join(root, 'data', 'sport-snapshots', desk);
  if (!fs.existsSync(dir)) {
    console.error(`no snapshot ${dir}`);
    process.exit(1);
  }
  const key = (u) => crypto.createHash('sha1').update(u).digest('hex').slice(0, 14);
  const { NewsDesk } = await import(pathToFileURL(path.join(root, 'server', 'news.js')).href);
  NewsDesk.prototype.readFeed = async function readFeed(url) {
    const f = path.join(dir, `${key(url)}.xml`);
    if (!fs.existsSync(f)) throw new Error(`not in the snapshot: ${url}`);
    return fs.readFileSync(f, 'utf8');
  };
  NewsDesk.prototype.fetchText = async function fetchText(url) {
    const f = path.join(dir, 'pages', `${key(url)}.html`);
    if (!fs.existsSync(f)) throw new Error(`not in the snapshot: ${String(url).slice(0, 80)}`);
    return fs.readFileSync(f, 'utf8');
  };
}

await import(pathToFileURL(path.join(root, 'server', 'index.js')).href);

if (save) {
  // the first edition of the programme, saved once every voiced segment has its clip (or the voice queue is empty)
  const get = (p) =>
    new Promise((resolve) => {
      http
        .get({ host: '127.0.0.1', port: Number(process.env.PORT), path: p }, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        })
        .on('error', () => resolve(null));
    });
  const timer = setInterval(async () => {
    const queue = await get('/api/queue');
    const ep = Array.isArray(queue) ? queue.find((e) => e?.kind === 'episode' && e.program?.id === programme) : null;
    if (!ep) return;
    const voiced = ep.segments.filter((s) => s.voiceId);
    const ready = voiced.filter((s) => s.audio?.url);
    const status = await get('/api/voice/status');
    const engineOn = process.env.VOICE_ENGINE === 'kokoro' && status?.enabled;
    if (engineOn && ready.length < voiced.length && (status?.queue ?? 0) > 0) return;
    clearInterval(timer);
    fs.mkdirSync(path.dirname(path.resolve(save)), { recursive: true });
    fs.writeFileSync(save, JSON.stringify(ep, null, 1));
    console.log(`[onair] ${ep.program.title}: ${ep.sport?.shape || ''} ${ep.segments.length} segments, ${ready.length}/${voiced.length} voiced -> ${save}`);
    // the edition goes on air here (the station's history), so what a recording of it meets next is what follows it
    // on the channel: the break, then the next programme in the rotation (and the ticker's NEXT names that one)
    const aired = await get('/api/next');
    if (aired?.id === ep.id) console.log(`[onair] ${ep.program.title} is on air; a recording with --item ${save} meets the break after it`);
  }, 3000);
}
