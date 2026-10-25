#!/usr/bin/env node
// The professional voices' casting (docs/roadmap/critique/voices-pro.md): each character's voice designed from its
// description (server/voice/procast.json) by the engine's own voice design: never a copy of a real person. Three
// candidates a character, each reading a line of the character's own programme (tools/voice/audit-lines.json); the
// owner listens and picks; the pick becomes the character's voice.
//
//   node tools/voice/pro-design.mjs --engine inworld|elevenlabs [--only paco,lola] [--samples 3]
//        designs the candidates: data/voice/pro-candidates/<engine>/<character>/{1,2,3}.<mp3|wav> and candidates.json
//   node tools/voice/pro-design.mjs --engine inworld --page
//        data/voice/pro-candidates/<engine>/index.html: every character's candidates, to listen to and choose from
//   node tools/voice/pro-design.mjs --engine inworld --pick paco=2,lola=1
//        keeps the chosen candidates in the account's voice library and writes their ids into procast.json
//
// Keys from the environment only (INWORLD_API_KEY, ELEVENLABS_API_KEY; never on the command line or in a chat).
// Designing costs a little (a preview line per candidate); nothing is published, nothing airs. The tests point it at
// stand-ins with INWORLD_API_BASE / ELEVENLABS_API_BASE.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const env = process.env;
const engine = opt('engine');
if (!['inworld', 'elevenlabs'].includes(engine)) {
  console.error('usage: pro-design.mjs --engine inworld|elevenlabs [--only a,b] [--samples 3] | --page | --pick a=1,b=2');
  process.exit(2);
}
const PROCAST = path.resolve(opt('procast', path.join(REPO, 'server', 'voice', 'procast.json')));
const OUT = path.resolve(opt('out', path.join(REPO, 'data', 'voice', 'pro-candidates')), engine);
const procast = JSON.parse(fs.readFileSync(PROCAST, 'utf8'));
const lines = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'voice', 'audit-lines.json'), 'utf8'));
const casting = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'casting.json'), 'utf8'));
const only = new Set(String(opt('only', '')).split(',').filter(Boolean));
const say = (m) => console.log(`[pro-design] ${m}`);

/** A line of the character's own programme, 100 to 400 characters, cut at a sentence (what both engines take). */
function previewText(id) {
  const own = lines.programmes[lines.who[id]] || [];
  const pool = [...own, ...lines.common];
  for (const ln of pool) {
    const t = String(ln.text || '').replace(/\s+/g, ' ').trim();
    if (t.length < 100) continue;
    if (t.length <= 400) return t;
    const cut = t.slice(0, 400);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    if (end >= 99) return cut.slice(0, end + 1);
  }
  return 'Good evening and welcome to GLOBIT 24. Here is the news, from the sources we name on screen, and what it means for you today.';
}
const extOf = (buf) => (buf.slice(0, 4).toString() === 'RIFF' ? 'wav' : buf.slice(0, 4).toString() === 'OggS' ? 'ogg' : 'mp3');

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url.replace(/^https?:\/\/[^/]+/, '')}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const IW = (env.INWORLD_API_BASE || 'https://api.inworld.ai').replace(/\/$/, '');
const EL = (env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io').replace(/\/$/, '');
const key = engine === 'inworld' ? env.INWORLD_API_KEY : env.ELEVENLABS_API_KEY;
const auth = engine === 'inworld' ? { authorization: `Basic ${key}` } : { 'xi-api-key': key };

/** Candidates for one character: [{ n, id, audio: Buffer }]. */
async function design(id, samples) {
  const v = procast.voices[id];
  const text = previewText(id);
  const lang = String(casting[id]?.lang || 'en-us').toLowerCase() === 'en-gb' ? 'en-GB' : 'en-US';
  if (engine === 'inworld') {
    const j = await post(`${IW}/voices/v1/voices:design`, auth, { designPrompt: v.design.slice(0, 1000), languageCode: lang, previewText: text, voiceDesignConfig: { numberOfSamples: samples } });
    return (j.previewVoices || []).map((p, i) => ({ n: i + 1, id: p.voiceId, audio: Buffer.from(p.previewAudio || '', 'base64'), text }));
  }
  const out = [];
  // (each call gives a few previews; asked again until there are enough)
  for (let tries = 0; out.length < samples && tries < 3; tries++) {
    const j = await post(`${EL}/v1/text-to-voice/design?output_format=mp3_44100_128`, auth, { voice_description: v.design.slice(0, 1000), text: text.length >= 100 ? text : `${text} ${text}`.slice(0, 400), model_id: 'eleven_ttv_v3' });
    for (const p of j.previews || []) if (out.length < samples) out.push({ n: out.length + 1, id: p.generated_voice_id, audio: Buffer.from(p.audio_base_64 || '', 'base64'), text });
  }
  return out;
}

/** Keep a candidate in the account's library: -> its voice id for synthesis. */
async function keep(id, cand) {
  const v = procast.voices[id];
  if (engine === 'inworld') {
    const j = await post(`${IW}/voices/v1/voices/${encodeURIComponent(cand.id)}:publish`, auth, { displayName: `GLOBIT 24 ${id}`, description: v.design.slice(0, 500), tags: ['globit24', id] });
    return j.voiceId || cand.id;
  }
  const j = await post(`${EL}/v1/text-to-voice`, auth, { voice_name: `GLOBIT 24 ${id}`, voice_description: v.design.slice(0, 1000), generated_voice_id: cand.id, labels: { channel: 'globit24', character: id } });
  return j.voice_id;
}

if (argv.includes('--page')) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rows = [];
  for (const id of Object.keys(procast.voices)) {
    const f = path.join(OUT, id, 'candidates.json');
    if (!fs.existsSync(f)) continue;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    rows.push(`<section><h2>${esc(id)}</h2><p class="brief">${esc(procast.voices[id].design)}</p><p class="line">«${esc(c.text)}»</p>${c.candidates.map((x) => `<figure><figcaption>Voz ${x.n}${procast.voices[id][engine]?.voiceId === x.kept ? ' · <b>elegida</b>' : ''}</figcaption><audio controls preload="none" src="${esc(`${id}/${x.file}`)}"></audio></figure>`).join('')}</section>`);
  }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voces candidatas</title><style>:root{--bg:#f7f7f5;--fg:#1c1c1c;--muted:#666;--card:#fff;--line:#e3e3df}@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--card:#1e1e1e;--line:#333}}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:860px;margin:auto}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:14px 0}h2{margin:0 0 4px;text-transform:uppercase;font-size:15px;letter-spacing:.05em}.brief{color:var(--muted);font-size:14px;margin:0 0 6px}.line{font-style:italic;margin:0 0 10px}figure{margin:6px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}figcaption{min-width:90px;font-weight:600}audio{max-width:100%}</style></head><body><main><h1>Voces candidatas · ${esc(engine)}</h1><p>Cada personaje tiene tres voces diseñadas desde su descripción (ninguna copia a una persona real). Escucha y dime el número que prefieres para cada uno.</p>${rows.join('')}</main></body></html>`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  say(`${rows.length} characters -> ${path.join(OUT, 'index.html')}`);
  process.exit(0);
}

if (!key) {
  console.error(`${engine === 'inworld' ? 'INWORLD_API_KEY' : 'ELEVENLABS_API_KEY'} is not set (the key goes in the environment: /etc/globit24.env on the server, or the environment's secrets here; never in a chat)`);
  process.exit(1);
}

if (opt('pick')) {
  for (const pair of opt('pick').split(',')) {
    const [id, n] = pair.split('=');
    const f = path.join(OUT, id, 'candidates.json');
    if (!procast.voices[id] || !fs.existsSync(f)) throw new Error(`${id}: no candidates (design them first)`);
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    const cand = c.candidates.find((x) => String(x.n) === String(n));
    if (!cand) throw new Error(`${id}: no candidate ${n}`);
    const voiceId = await keep(id, cand);
    cand.kept = voiceId;
    fs.writeFileSync(f, JSON.stringify(c, null, 1));
    procast.voices[id][engine] = { ...(procast.voices[id][engine] || {}), voiceId };
    say(`${id}: candidate ${n} kept as ${voiceId}`);
  }
  fs.writeFileSync(PROCAST, JSON.stringify(procast, null, 1) + '\n');
  process.exit(0);
}

const samples = Math.max(1, Math.min(3, Number(opt('samples', 3)) || 3));
for (const id of Object.keys(procast.voices)) {
  if (only.size && !only.has(id)) continue;
  try {
    const cands = await design(id, samples);
    const dir = path.join(OUT, id);
    fs.mkdirSync(dir, { recursive: true });
    const list = cands.map((c) => {
      const file = `${c.n}.${extOf(c.audio)}`;
      fs.writeFileSync(path.join(dir, file), c.audio);
      return { n: c.n, id: c.id, file };
    });
    fs.writeFileSync(path.join(dir, 'candidates.json'), JSON.stringify({ engine, character: id, text: cands[0]?.text || previewText(id), design: procast.voices[id].design, at: new Date().toISOString(), candidates: list }, null, 1));
    say(`${id}: ${list.length} candidates`);
  } catch (err) {
    say(`${id}: ${err.message}`);
  }
}
