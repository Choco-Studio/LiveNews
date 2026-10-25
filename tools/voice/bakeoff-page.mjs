#!/usr/bin/env node
// The voices' bake-off, blind (docs/roadmap/critique/voices-pro.md): the same lines of the channel's own copy read by
// each engine (tools/voice/audit.py render, from audit-requests.mjs with and without --pro), set side by side for the
// owner's ears without saying which is which. The letters are shuffled per character; the key is kept apart
// (key.json, never linked from the page) and read after the owner has chosen.
//
//   node tools/voice/bakeoff-page.mjs --dir kokoro=/tmp/a/clips --dir inworld=/tmp/b/clips [--dir elevenlabs=...]
//        [--audit kokoro=/tmp/a/audit.json --audit inworld=/tmp/b/audit.json] [--lines 2] --out data/voice/bakeoff
//
// Each clip is converted to Ogg Opus beside the page (ffmpeg). With --audit, the machine's measures per engine (the
// recogniser's word errors, the predicted listening score) close the page, by engine: they are averages, not a clue
// to the letters.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const many = (name) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] ? [argv[i + 1]] : []));
const opt = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const dirs = Object.fromEntries(many('dir').map((s) => s.split('=')));
const audits = Object.fromEntries(many('audit').map((s) => s.split('=')));
const out = path.resolve(opt('out', 'data/voice/bakeoff'));
const perVoice = Math.max(1, Number(opt('lines', 2)) || 2);
if (Object.keys(dirs).length < 2) {
  console.error('usage: bakeoff-page.mjs --dir kokoro=<clips> --dir inworld=<clips> [...] [--audit name=<audit.json>] --out <dir>');
  process.exit(2);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const readMeta = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const engines = Object.keys(dirs);
// the characters every engine read, and the lines they all have (common first: the same words for everyone)
const labels = fs.readdirSync(dirs[engines[0]]).filter((l) => engines.every((e) => fs.existsSync(path.join(dirs[e], l))));
fs.mkdirSync(out, { recursive: true });
const key = {};
const sections = [];
for (const label of labels.sort()) {
  const linesOf = (e) => new Set(fs.readdirSync(path.join(dirs[e], label)).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)));
  const shared = [...linesOf(engines[0])].filter((ln) => engines.every((e) => linesOf(e).has(ln)));
  const metas = shared.map((ln) => ({ ln, m: readMeta(path.join(dirs[engines[0]], label, `${ln}.json`)) }));
  const pick = [...metas.filter((x) => x.m?.set === 'common'), ...metas.filter((x) => x.m?.set !== 'common')].slice(0, perVoice);
  if (!pick.length) continue;
  // the letters, shuffled per character (seeded, so the page and its key agree run after run)
  const order = [...engines].sort((a, b) => crypto.createHash('sha1').update(label + a).digest('hex').localeCompare(crypto.createHash('sha1').update(label + b).digest('hex')));
  key[label] = Object.fromEntries(order.map((e, i) => [String.fromCharCode(65 + i), e]));
  const blocks = [];
  for (const { ln, m } of pick) {
    const players = [];
    order.forEach((e, i) => {
      const letter = String.fromCharCode(65 + i);
      const file = `${label}/${ln}-${letter}.ogg`;
      fs.mkdirSync(path.join(out, label), { recursive: true });
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dirs[e], label, `${ln}.wav`), '-c:a', 'libopus', '-b:a', '96k', path.join(out, file)]);
      if (r.status !== 0) throw new Error(`ffmpeg: ${label}/${ln} (${e}): ${String(r.stderr).slice(0, 200)}`);
      players.push(`<figure><figcaption>${letter}</figcaption><audio controls preload="none" src="${esc(file)}"></audio></figure>`);
    });
    blocks.push(`<div class="line"><p>«${esc(m?.text || ln)}»</p>${players.join('')}</div>`);
  }
  sections.push(`<section><h2>${esc(label)}</h2>${blocks.join('')}</section>`);
}
let measures = '';
if (Object.keys(audits).length) {
  const rows = Object.entries(audits).map(([e, f]) => {
    const a = readMeta(f) || {};
    const voices = Object.values(a.voices || {});
    const avg = (k) => {
      const v = voices.map((x) => x[k]).filter((x) => Number.isFinite(x));
      return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(3) : '–';
    };
    return `<tr><td>${esc(e)}</td><td>${avg('mos')}</td><td>${avg('wer')}</td><td>${voices.length}</td></tr>`;
  });
  measures = `<section><h2>Medidas de la máquina (media por motor)</h2><table><tr><th>Motor</th><th>Nota prevista de escucha (1–5)</th><th>Errores del reconocedor</th><th>Voces</th></tr>${rows.join('')}</table><p class="note">Una máquina no oye como una persona: la decisión es de tu oído.</p></section>`;
}
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba de voces</title><style>:root{--bg:#f7f7f5;--fg:#1c1c1c;--muted:#666;--card:#fff;--line:#e3e3df}@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--card:#1e1e1e;--line:#333}}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:860px;margin:auto}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:14px 0}h2{margin:0 0 6px;text-transform:uppercase;font-size:15px;letter-spacing:.05em}.line{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}.line p{font-style:italic;margin:0 0 6px}figure{margin:4px 0;display:flex;gap:12px;align-items:center}figcaption{font-weight:700;min-width:1.5em}audio{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left}.note{color:var(--muted);font-size:14px}</style></head><body><main><h1>Prueba de voces, a ciegas</h1><p>Las mismas frases del canal, leídas por ${engines.length} sistemas distintos (A, B${engines.length > 2 ? ', C' : ''}). Las letras cambian de personaje a personaje. Escucha y dime, para cada personaje, cuál suena mejor.</p>${sections.join('')}${measures}</main></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1));
console.log(`${sections.length} characters, ${engines.length} engines -> ${path.join(out, 'index.html')} (key: key.json)`);
