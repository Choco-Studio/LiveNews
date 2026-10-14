#!/usr/bin/env node
// PAY ATTENTION on air at a chosen moment, for a recording (docs/programmes/pay-attention.md §9, step 7), in the image of
// FULL TIME's tools/sport/onair.mjs. The real server (server/index.js: the station, the producer, the quiz desk, the
// voice service, the picture cache) runs under a clock frozen at the air time and running on from there, with the draft
// in the rotation after COSMOS and starting the channel; the first edition it makes is saved, with its recorded voices,
// for tools/record.mjs --item, while the same server keeps serving that edition's voice clips (/api/voice), its pictures
// (/api/img), the ticker and the break after it.
//
//   PORT=8795 node tools/quiz/onair.mjs 2026-10-13T14:40:00+01:00 --save /tmp/pa/afternoon.json [--view]
//   node tools/record.mjs --url "http://127.0.0.1:8795/?autostart=1&voice=tts" --item /tmp/pa/afternoon.json \
//     --time 2026-10-13T14:52:00+01:00 --seconds 420 --progressive --out /tmp/pa/afternoon.mp4 --report /tmp/pa/afternoon-report.json
//
// The edition is the station's own: the quiz desk plans it from data/archive (the channel's real archive, copied into
// this checkout) and the history and weekly table in data/quiz (clear that folder for a week's first edition; a second
// edition made after it sees the first as history, as on air). The archive is read only here: what this server airs
// after the edition is never written into it, so a later edition is planned from the real archive alone. `--view` sets
// QUIZ_VIEW=1 (the desk's three-day minimum lifted for a draft on air by DRAFTS_ON_AIR; never for air). Defaults for a
// recording (any can be overridden from the environment): Kokoro voices, the mock writer (the fallback writer) for the
// programmes after it, the weather fixture, live feeds for the ticker, one episode made ahead, and the first edition
// waiting for all its voices. Nothing in production changes: this is the server, started with a clock of the test's
// choosing.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freezeAllClocks } from '../sport/snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const bare = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const save = flag('save');
const slot = flag('slot') || 'cosmos';
const view = bare('view');
const programme = 'pay-attention';
const [air] = args;
if (!air || !Number.isFinite(Date.parse(air))) {
  console.error('usage: node tools/quiz/onair.mjs <air ISO time> [--save episode.json] [--slot cosmos] [--view]');
  process.exit(1);
}

const env = (k, v) => {
  if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
};
env('PORT', '8795');
env('DRAFTS_ON_AIR', `${programme}@${slot}`);
env('ROTATION_START', programme);
env('PROVIDERS', 'mock');
env('VOICE_ENGINE', 'kokoro');
env('WEATHER', 'fixture');
env('QUEUE_SIZE', '1');
env('VOICE_FIRST_BUDGET_S', '1800');
if (view) env('QUIZ_VIEW', '1');

freezeAllClocks(Date.parse(air));

// the archive read only: the edition is planned from what the channel really aired, and nothing this server airs later
// (under its borrowed clock) is written into the copy
const { Archive } = await import(pathToFileURL(path.join(root, 'server', 'archive.js')).href);
Archive.prototype.record = function record() {
  return 0;
};

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
    const voiced = ep.segments.filter((s) => s.voiceId || s.text);
    const ready = voiced.filter((s) => s.audio?.url);
    const status = await get('/api/voice/status');
    const engineOn = process.env.VOICE_ENGINE === 'kokoro' && status?.enabled;
    if (engineOn && ready.length < voiced.length && (status?.queue ?? 0) > 0) return;
    clearInterval(timer);
    fs.mkdirSync(path.dirname(path.resolve(save)), { recursive: true });
    fs.writeFileSync(save, JSON.stringify(ep, null, 1));
    const q = ep.quiz || {};
    console.log(`[onair] ${ep.title}: ${(q.types || []).join(' / ')}, made ${ep.createdAt}, ${ep.segments.length} segments, ${ready.length}/${voiced.length} voiced -> ${save}`);
    // the edition goes on air here (the station's history), so what a recording of it meets next is what follows it
    // on the channel: the break, then the next programme in the rotation (and the ticker's NEXT names that one)
    const aired = await get('/api/next');
    if (aired?.id === ep.id) console.log(`[onair] ${ep.program.title} is on air; a recording with --item ${save} meets the break after it`);
  }, 3000);
}
