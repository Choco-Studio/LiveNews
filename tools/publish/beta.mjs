#!/usr/bin/env node
// The beta, published by hand (PUBLISH_MODE=manual: server/publish/mode.js, manual.js; the owner's guide:
// docs/publishing/beta.md). Every command here runs in hand publishing: no adapter ever calls a network, nothing is
// scheduled, the live supervisor never streams.
//
//   node tools/publish/beta.mjs                 the re-check of what waits, then the approval page (http://127.0.0.1:8740/)
//   node tools/publish/beta.mjs hacer           today's pieces: the Phase 1 programmes remade from the archive with the
//                                               station's voices (material.mjs), their clips in vertical (factory.mjs),
//                                               the day's text posts for the networks set to Manual (posts.mjs), all into
//                                               the queue; then what the day offers and why the rest is held
//   node tools/publish/beta.mjs estado          what the day offers and why the rest is held (nothing made, nothing sent)
//
// Options: --queue <dir> (data/publish), --at <ISO time> (now), --material <dir> (episodes made already: no remake),
// --programmes a,b (pay-attention,cosmos,tech-bytes,full-time), --port <n> (8740), --max <clips per programme> (6).
// WORLD WEATHER is not made here: offline its forecast is the demo data, which is never published. A news programme the
// remake writes with the offline writer (material.mjs has no AI writer) is never published either (`offline-writer`):
// it is not recorded, so today only PAY ATTENTION, written by the quiz desk, gives clips.
process.env.PUBLISH_MODE = 'manual';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, argsOf } from './lib.mjs';
import { PublishQueue, localParts } from '../../server/publish/queue.js';
import { Publisher } from '../../server/publish/publisher.js';
import { RULE_ES } from '../../server/publish/approval.js';
import { dailyPick } from '../../server/publish/manual.js';
import { PLATFORMS } from '../../server/publish/platforms.js';

const argv = process.argv.slice(2);
const { opt } = argsOf(argv);
const cmd = ['hacer', 'make', 'estado', 'status'].find((c) => argv.includes(c)) || 'pagina';
const queueDir = path.resolve(opt('queue', path.join(root, 'data', 'publish')));
const queue = new PublishQueue({ dir: queueDir });
const dataDir = path.join(root, 'data');
const PHASE1 = ['pay-attention', 'cosmos', 'tech-bytes', 'full-time'];

const child = (args, { quiet = false } = {}) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: ['ignore', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'] });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

/** What the day offers, and why the rest waits or is held (in Spanish, for the owner). */
function summary() {
  const re = new Publisher({ queue, dataDir }).recheck();
  const items = queue.list();
  const pick = dailyPick(queue);
  const by = (s) => items.filter((it) => it.status === s);
  console.log(`\nRevisado otra vez: ${re.checked} esperando · ${re.held.length} retenidos ahora${re.released.length ? ` · ${re.released.length} vuelven a «Por aprobar»` : ''}`);
  console.log(`Para hoy: ${pick.ids.length} publicaciones a mano`);
  for (const [net, kinds] of Object.entries(pick.caps)) for (const [k, c] of Object.entries(kinds)) console.log(`  ${(PLATFORMS[net]?.name || net).padEnd(16)} ${k === 'text' ? 'textos' : k === 'episode' ? 'programas' : 'clips'}: ${pick.ids.filter((id) => queue.get(id)?.platform === net).length} para hoy (máximo ${c.cap} al día, ${c.done} ya publicados hoy)`);
  console.log(`En la cola: ${by('pending').length} por aprobar · ${by('approved').length} aprobados · ${by('held').length} retenidos · ${by('published').length} publicados · ${by('rejected').length} rechazados`);
  const reasons = new Map();
  for (const it of by('held')) for (const rule of new Set((it.compliance?.violations || []).map((v) => v.rule))) reasons.set(rule, (reasons.get(rule) || 0) + 1);
  if (reasons.size) {
    console.log('Por qué están retenidos (una publicación puede tener varios motivos):');
    for (const [rule, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${RULE_ES[rule] || rule}`);
  }
  const grave = items.filter((it) => it.grave && ['pending', 'approved'].includes(it.status)).length;
  if (grave) console.log(`  ${String(grave).padStart(3)}  Noticias graves: en la fase 1 no se publica nada grave (se quedan fuera de «Para hoy»).`);
  return { pick, reasons };
}

/** The factory's own account of an episode's moments: chosen, and why the others were not. */
function momentsOf(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = s.moments || [];
    const n = (f) => m.filter(f).length;
    return `${s.episode?.programme}: ${m.length} momentos · ${n((x) => x.publishable && !x.copied && !x.uncleared)} publicables · ${n((x) => x.copied)} copian al medio o no tienen sus fuentes · ${n((x) => x.uncleared)} con una foto sin permiso · ${n((x) => !x.light)} no ligeros o graves · ${(s.clips || []).length} clips hechos, ${(s.clips || []).reduce((a, c) => a + (c.queued || []).length, 0)} a la cola`;
  } catch {
    return `${path.basename(path.dirname(file))}: sin resumen`;
  }
}

/** An hour of a London day as an instant. */
function londonAt(day, hour) {
  const base = Date.parse(`${day}T00:00:00Z`);
  for (let x = base - 3 * 3600_000; x < base + 27 * 3600_000; x += 15 * 60_000) {
    const p = localParts(x, 'Europe/London');
    if (p.day === day && p.h === hour && p.m === 0) return x;
  }
  return base + hour * 3600_000;
}

/**
 * When to remake PAY ATTENTION: it airs 14:00-23:00 London, and the quiz desk plans an edition only when the archive
 * fills its rounds (on 17 Oct, from 14:00, 15:55 and 17:50 London, never from 21:30). The day's hours, latest first, none
 * after `t` (material.mjs then tries every 7 minutes for nearly two hours from each).
 */
function quizTimes(t) {
  let day = localParts(t, 'Europe/London').day;
  if (localParts(t, 'Europe/London').h < 14) day = localParts(t - 24 * 3600_000, 'Europe/London').day;
  return [20, 18, 16, 14].map((h) => londonAt(day, h)).filter((x) => x <= t);
}

async function make() {
  const at = opt('at') ? Date.parse(opt('at')) : Date.now();
  if (!Number.isFinite(at)) throw new Error('--at: not a time');
  const day = localParts(at, queue.tzOf('youtube')).day;
  const base = path.join(queueDir, 'factory', day);
  const matDir = opt('material') ? path.resolve(opt('material')) : path.join(base, 'material');
  const wanted = String(opt('programmes', PHASE1.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
  fs.mkdirSync(matDir, { recursive: true });
  if (!opt('material')) {
    for (const prog of wanted) {
      for (const t of prog === 'pay-attention' ? quizTimes(at) : [at]) {
        console.log(`[beta] ${prog}: el programa rehecho desde el archivo, con las voces (${new Date(t).toISOString()})`);
        const r = await child(['tools/publish/material.mjs', '--at', new Date(t).toISOString(), '--programmes', prog, '--out', matDir], { quiet: true });
        const made = r.out.split('\n').filter((l) => /voiced|nothing made|no plan/.test(l)).slice(-2).join(' | ');
        console.log(`[beta]   ${made || `salió con ${r.code}`}`);
        if (/voiced/.test(made)) break;
      }
    }
  }
  const episodes = fs.readdirSync(matDir).filter((f) => f.endsWith('.json') && wanted.some((p) => f.endsWith(`-${p}.json`)));
  const sums = [];
  for (const f of episodes) {
    const out = path.join(base, f.replace(/\.json$/, ''));
    // a news programme the offline writer wrote is never published (the gate's `offline-writer`: verbatim.md §7), so it
    // is not recorded for nothing (material.mjs remakes with the offline writer; PAY ATTENTION is the quiz desk's)
    let provider = '';
    try {
      provider = String(JSON.parse(fs.readFileSync(path.join(matDir, f), 'utf8')).provider || '').toLowerCase();
    } catch {
      /* unreadable: the factory says why */
    }
    if (provider === 'mock') {
      console.log(`[beta] ${f}: ${RULE_ES['offline-writer'] || 'escrito por el redactor de reserva: nunca se publica'} No se graba.`);
      continue;
    }
    console.log(`[beta] ${f}: los clips (vertical) y la cola`);
    const r = await child(['tools/publish/factory.mjs', '--episode', path.join(matDir, f), '--out', out, '--formats', 'vertical', '--queue', queueDir, '--max', String(opt('max', 6))], { quiet: true });
    if (r.code) console.log(`[beta]   la fábrica salió con ${r.code}: ${r.out.trim().split('\n').slice(-2).join(' | ')}`);
    sums.push(path.join(out, 'summary.json'));
  }
  console.log(`[beta] los textos del ${day} (solo para las redes en «Manual»)`);
  const pr = await child(['tools/publish/posts.mjs', '--day', day, '--enqueue', '--queue', queueDir, '--out', path.join(base, 'posts')], { quiet: true });
  console.log(`[beta]   ${pr.out.trim().split('\n').slice(-1)[0] || `salió con ${pr.code}`}`);
  console.log('\nLos momentos de cada programa:');
  for (const s of sums) console.log(`  ${momentsOf(s)}`);
  summary();
}

if (['hacer', 'make'].includes(cmd)) await make();
else if (['estado', 'status'].includes(cmd)) summary();
else {
  const port = opt('port', '8740');
  const r = await child(['tools/publish/approve.mjs', '--manual', '--queue', queueDir, '--port', port]);
  process.exit(r.code || 0);
}
