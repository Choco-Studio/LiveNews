#!/usr/bin/env node
// The voice audit's requests (tools/voice/audit.py): every cast voice reading the audit copy
// (tools/voice/audit-lines.json), planned exactly as the station plans a segment (server/voice/plan.js
// segmentRequest with the speechtext planner: the newsreader text, phrasing, pauses and melody).
//
//   node tools/voice/audit-requests.mjs --out reqs.jsonl [--set common|own|all] [--variants variants.json]
//        [--casting server/voice/casting.json] [--lines tools/voice/audit-lines.json] [--only id,id]
//
// variants.json (optional, for auditions): { "<label>": { "id": "<presenter id>", "cast": { voice, speed, lang, ... },
// "lines": "<programme key of audit-lines.json>" } }. Without it every entry of the casting sheet is audited as
// itself, with the re-staged guests' generic voices, and `--previous` audits each entry's `previous` blend instead
// (the before/after comparison).
// One JSON line per clip: { label, id, line, set, text, req }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const plan = await import(pathToFileURL(path.join(REPO, 'server/voice/plan.js')).href);
const speech = await import(pathToFileURL(path.join(REPO, 'public/js/voice/speechtext.js')).href);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const casting = readJson(opt('casting', path.join(REPO, 'server/voice/casting.json')));
const channel = readJson(path.join(REPO, 'config/channel.json'));
const presets = readJson(path.join(REPO, 'tools/voice/presets.json')).presets;
const lines = readJson(opt('lines', path.join(REPO, 'tools/voice/audit-lines.json')));
const set = opt('set', 'all');
const only = new Set((opt('only', '') || '').split(',').filter(Boolean));
const out = opt('out');
if (!out) {
  console.error('usage: audit-requests.mjs --out reqs.jsonl [--set common|own|all] [--variants f] [--previous]');
  process.exit(2);
}

/** The cast entry without its bookkeeping (the candidates and the previous blend are not sent to the worker). */
function bare(entry) {
  const { candidates, previous, notes, ...rest } = entry || {};
  return rest;
}

let variants;
if (opt('variants')) variants = readJson(opt('variants'));
else {
  variants = {};
  for (const [id, c] of Object.entries(casting)) {
    if (!c?.voice) continue;
    if (flag('previous')) {
      if (c.previous?.voice) variants[id] = { id, cast: { ...bare(c), ...bare(c.previous) } };
    } else variants[id] = { id, cast: bare(c) };
    // a character still being cast (PAY ATTENTION's host): each candidate as `<id>:<letter>`
    for (const [letter, cand] of Object.entries(c.candidates || {})) {
      const pick = flag('previous') ? cand.previous : cand;
      if (pick?.voice) variants[`${id}:${letter}`] = { id, cast: { ...bare(c), voice: pick.voice, speed: pick.speed, lang: pick.lang } };
    }
  }
  // the generic voices of re-staged guests (server/guests/restage.js), each as `guest:<presentation>:<n>`, on the
  // shared lines (a guest has no lines of its own)
  if (!flag('previous')) {
    const { GUEST_VOICES } = await import(pathToFileURL(path.join(REPO, 'server/guests/restage.js')).href);
    for (const p of ['man', 'woman']) GUEST_VOICES[p].forEach((v, i) => (variants[`guest:${p}:${i}`] = { id: 'guest', cast: v }));
  }
}

const rows = [];
for (const [label, v] of Object.entries(variants)) {
  const id = v.id || label;
  if (only.size && !only.has(label) && !only.has(id)) continue;
  const cast = { ...bare(casting[id]), ...bare(v.cast) };
  const own = lines.programmes[v.lines || lines.who[id]] || [];
  const list = set === 'common' ? lines.common : set === 'own' ? own : [...lines.common, ...own];
  for (const ln of list) {
    let req;
    if (ln.type === 'ad') req = plan.adLineRequest(ln.text, { cast, speech });
    else {
      const seg = { type: ln.type, text: ln.text, emotion: ln.emotion || 'neutral', anchor: 'A', cues: [], ...(ln.sport ? { sport: ln.sport } : {}) };
      req = plan.segmentRequest(seg, { presenterId: id, presenter: channel.presenters[id], casting: { [id]: cast }, presets, speech });
    }
    rows.push({ label, id, line: ln.id, set: lines.common.includes(ln) ? 'common' : 'own', text: ln.text, req });
  }
}
fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} requests for ${new Set(rows.map((r) => r.label)).size} voices -> ${out}`);
