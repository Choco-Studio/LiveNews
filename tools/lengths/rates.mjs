#!/usr/bin/env node
// Each voice's real speaking rate, measured from a Kokoro voice cache (data/voice/*.json: each clip's duration and its
// words), for the station's estimate of a programme's air (server/airtime.js) and the length gate. A presenter's rate is the words of all
// their clips over the clips' total length, pauses inside a clip included (what the station's 2.75 words a second
// stands in for). Written to server/voice/rates.json; a voice with fewer than 10 clips gets the cast's median.
//
//   node tools/lengths/rates.mjs [--cache data/voice]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--cache');
const cache = path.resolve(root, i > 0 ? process.argv[i + 1] : 'data/voice');
const casting = JSON.parse(fs.readFileSync(path.join(root, 'server', 'voice', 'casting.json'), 'utf8'));
// "bm_george:0.60+bm_lewis:0.40" and "bm_george:0.6+bm_lewis:0.4" are one blend
const blend = (v, speed) => `${String(v).split('+').map((p) => p.replace(/:([\d.]+)$/, (m, w) => `:${Number(w)}`)).join('+')}@${Number(speed)}`;
const by = new Map();
for (const f of fs.readdirSync(cache).filter((x) => x.endsWith('.json'))) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(path.join(cache, f), 'utf8'));
  } catch {
    continue;
  }
  if (!(j.duration > 0) || !Array.isArray(j.words) || j.words.length < 6 || !j.voice) continue;
  const k = blend(j.voice, j.speed ?? 1);
  const x = by.get(k) || { words: 0, seconds: 0, clips: 0 };
  x.words += j.words.length;
  x.seconds += j.duration;
  x.clips++;
  by.set(k, x);
}
const out = {};
for (const [id, c] of Object.entries(casting)) {
  if (!c?.voice) continue;
  const x = by.get(blend(c.voice, c.speed ?? 1));
  if (x && x.clips >= 10) out[id] = { wps: Math.round((x.words / x.seconds) * 1000) / 1000, clips: x.clips };
}
const sorted = Object.values(out).map((r) => r.wps).sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 2.6;
const file = path.join(root, 'server', 'voice', 'rates.json');
fs.writeFileSync(file, `${JSON.stringify({ measured: new Date().toISOString().slice(0, 10), from: `${Object.values(out).reduce((a, r) => a + r.clips, 0)} clips`, median, presenters: out }, null, 1)}\n`);
console.log(`median ${median} words/s; ${Object.keys(out).length} voices measured -> ${path.relative(root, file)}`);
for (const [id, r] of Object.entries(out)) console.log(`  ${id.padEnd(10)} ${r.wps.toFixed(2)} words/s (${Math.round(r.wps * 60)} wpm, ${r.clips} clips)`);
