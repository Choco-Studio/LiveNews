#!/usr/bin/env node
// The beta, published by hand (PUBLISH_MODE=manual: server/publish/mode.js, manual.js; the owner's guide:
// docs/publishing/beta.md). Every command here runs in hand publishing: no adapter ever calls a network, nothing is
// scheduled, the live supervisor never streams.
//
//   node tools/publish/beta.mjs                 the re-check of what waits, then the approval page (http://127.0.0.1:8740/)
//   node tools/publish/beta.mjs hacer           today's pieces, then what the day offers and why the rest is held:
//                                               - the news programmes, written by the AI writer from the live feeds through
//                                                 the channel's producer, with their voices (server/publish/newsday.js),
//                                                 when the provider chain has one (the owner's key); without it, said plainly
//                                               - PAY ATTENTION remade from the archive with its voices (material.mjs)
//                                               - their clips in vertical (factory.mjs; a programme the playout has already
//                                                 rendered is cut from its master: server/publish/masters.js)
//                                               - the day's text posts for the networks set to Manual (posts.mjs)
//   node tools/publish/beta.mjs estado          what the day offers and why the rest is held (nothing made, nothing sent)
//   node tools/publish/beta.mjs fotos           the day's news candidates and their cleared pictures, decided by the rights
//                                               desk from the live feeds: no writer, no key, nothing made (a dry run)
//
// Options: --queue <dir> (data/publish), --at <ISO time> (now), --noticias a,b (BETA_NEWS, else cosmos,tech-bytes,
// full-time; "no" for none), --ediciones <n> (1 a programme), --concurso no (no PAY ATTENTION), --material <dir>
// (episodes made already: no news, no remake), --sources <dir> (their stories' sources, if not the day's own folder),
// --fotos no (the news without pictures: maps and boards), --fotos-segundos <n> (how long to wait for picture decisions,
// 120 a programme), --masters-from <dir> (rendered masters; also RENDERED_MASTERS),
// --port <n> (8740), --max <clips per programme> (6). It runs at low priority (nice 10) and says how long each step
// took. WORLD WEATHER is not made here: offline its forecast is demo data, never published. A programme the offline
// writer wrote is never published (`offline-writer`, verbatim.md §7), so it is not recorded.
process.env.PUBLISH_MODE = 'manual';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { root, argsOf } from './lib.mjs';
import { PublishQueue, localParts } from '../../server/publish/queue.js';
import { Publisher } from '../../server/publish/publisher.js';
import { RULE_ES } from '../../server/publish/approval.js';
import { dailyPick } from '../../server/publish/manual.js';
import { PLATFORMS } from '../../server/publish/platforms.js';
import { BETA_NEWS, PICTURE_BUDGET_MS, aiWriters, makeNewsDay, newsProgrammes, seedPictureAnswers, pictureDay } from '../../server/publish/newsday.js';
import { masterRoots, useRenderedMaster } from '../../server/publish/masters.js';
import { CLIP_MIN_SECONDS } from '../../server/publish/moments.js';

const argv = process.argv.slice(2);
const { opt } = argsOf(argv);
const cmd = ['hacer', 'make', 'estado', 'status', 'fotos', 'pictures'].find((c) => argv.includes(c)) || 'pagina';
const queueDir = path.resolve(opt('queue', path.join(root, 'data', 'publish')));
const queue = new PublishQueue({ dir: queueDir });
const dataDir = path.join(root, 'data');
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const NEWS = opt('noticias') === 'no' ? [] : list(opt('noticias', process.env.BETA_NEWS || BETA_NEWS.join(',')));
const quiet = { info() {}, warn() {}, error() {}, log() {} };

/** One step of the day, timed: the owner's server has two cores, and he should know where the time goes. */
const times = [];
async function step(label, fn) {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const s = Math.round((Date.now() - t0) / 1000);
    times.push([label, s]);
    console.log(`[beta]   (${label}: ${s >= 90 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`})`);
  }
}

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
    return `${s.episode?.programme}: ${m.length} momentos · ${n((x) => x.publishable && !x.copied && !x.uncleared)} publicables · ${n((x) => x.copied)} copian al medio o no tienen sus fuentes · ${n((x) => x.uncleared)} con una foto sin permiso · ${n((x) => !x.light)} no ligeros o graves · ${n((x) => Number(x.duration) < CLIP_MIN_SECONDS)} de menos de ${CLIP_MIN_SECONDS} s · ${(s.clips || []).length} clips hechos, ${(s.clips || []).reduce((a, c) => a + (c.queued || []).length, 0)} a la cola`;
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

/**
 * The rights desk for the beta (server/picturedesk.js), as on air: its own store (data/publish/pictures/answers.json,
 * kept across days), seeded from the station's decisions ahead of air (data/pictures/answers.json, only read), paced
 * Wikimedia with the station's contact, the FILE search; the image cache that verifies each picture. Null when
 * PICTURE_DESK is off or --fotos no.
 */
async function pictureKit(config) {
  if (opt('fotos') === 'no' || !config.pictures?.desk) return null;
  const { PictureDesk } = await import('../../server/picturedesk.js');
  const { WikimediaClient } = await import('../../server/wikimedia.js');
  const { ImageSearch } = await import('../../server/imagesearch.js');
  const { FaceStore } = await import('../../server/faces.js');
  const { ImageCache } = await import('../../server/images.js');
  const dir = path.join(queueDir, 'pictures');
  const kept = seedPictureAnswers(config.pictures.dir, dir);
  const wikimedia = new WikimediaClient({ contact: config.pictures.contact, log: quiet });
  const desk = new PictureDesk({ dir, wikimedia, search: new ImageSearch({ ...config.imageSearch, wikimedia }), faces: new FaceStore({ dir, log: quiet }), mode: config.pictures.rights, enabled: true, log: quiet });
  if (desk.mode === 'preview') console.log('[beta] PICTURE_RIGHTS=preview: las fotos de los medios pueden salir, marcadas NO AUTORIZADAS. Nada de una vista previa se publica nunca.');
  console.log(`[beta] fotos: el escritorio de derechos, con ${kept} respuestas guardadas (las de la emisora incluidas)`);
  return { desk, images: new ImageCache({ contact: config.pictures.contact, log: quiet }), budgetMs: (Number(opt('fotos-segundos')) || PICTURE_BUDGET_MS / 1000) * 1000 };
}

/**
 * The news programmes with the AI writer (server/publish/newsday.js), fresh from the live feeds, with their voices. ->
 * { episodes, sourcesDir } or null when the chain has no AI writer (said in Spanish: the news needs the key).
 */
async function newsDay(base) {
  const { config } = await import('../../server/config.js');
  const { createProviders, ProviderChain } = await import('../../server/providers/index.js');
  const providers = createProviders(config);
  const writers = aiWriters(providers);
  const { ids, skipped } = newsProgrammes((await import('../../server/channel.js')).loadChannel(undefined, { drafts: true }), NEWS);
  if (skipped.length) console.log(`[beta] no son programas de noticias (se escriben con reglas, no con la IA): ${skipped.join(', ')}`);
  if (!ids.length) return null;
  if (!writers.length) {
    console.log('[beta] Noticias: no hay redactor de IA configurado. Las noticias necesitan la clave de IA (en /etc/globit24.env: ANTHROPIC_API_KEY, ANTHROPIC_MODEL y PROVIDERS=anthropic,mock). Sin ella, lo que escribe el redactor de reserva copia a los medios y nunca se publica: hoy solo se hace el concurso.');
    return null;
  }
  console.log(`[beta] Noticias con el redactor de IA (${writers.map((p) => p.name).join(', ')}): ${ids.join(', ')}, ${Number(opt('ediciones', 1)) || 1} cada uno`);
  const { NewsDesk } = await import('../../server/news.js');
  const { loadChannel } = await import('../../server/channel.js');
  const desk = new NewsDesk({ log: quiet });
  await step('las noticias de los feeds', () => desk.refresh());
  console.log(`[beta]   ${desk.stories?.size ?? 0} noticias en los feeds`);
  const { createVoiceService } = await import('../../server/voice/index.js');
  const voice = createVoiceService({ ...config, voice: { ...config.voice, firstBudgetSeconds: 3600, budgetSeconds: 3600 } }, { root, log: quiet });
  const chain = new ProviderChain(providers, { record() {} }, { log: quiet });
  const sourcesDir = path.join(base, 'sources');
  const kit = await pictureKit(config);
  const picturesDir = path.join(base, 'pictures');
  try {
    const r = await step('escribir, buscar las fotos y poner voz a las noticias', () => makeNewsDay({ desk, chain, channel: loadChannel(undefined, { drafts: true }), programmes: ids, editions: Number(opt('ediciones', 1)) || 1, sourcesDir, outDir: path.join(base, 'news'), config, voice, pictures: kit ? { ...kit, dir: picturesDir } : null, log: quiet }));
    for (const e of r.episodes) {
      const secs = Math.round(e.ms / 1000);
      if (e.error) console.log(`[beta]   ${e.programId}: sin edición (${e.error}) · ${secs} s`);
      else if (e.offline) console.log(`[beta]   ${e.programId}: la IA no contestó y lo escribió el redactor de reserva: no se publica · ${secs} s`);
      else console.log(`[beta]   ${e.programId}: ${e.stories} noticias, escritas por ${e.provider}, ${e.pictured} con foto autorizada · ${secs} s`);
    }
    r.picturesDir = kit ? picturesDir : null;
    return r;
  } finally {
    voice?.close?.();
  }
}

async function make() {
  // low priority: the station keeps its cores (children inherit it)
  try {
    os.setPriority(10);
  } catch {
    /* not allowed here */
  }
  const at = opt('at') ? Date.parse(opt('at')) : Date.now();
  if (!Number.isFinite(at)) throw new Error('--at: not a time');
  const day = localParts(at, queue.tzOf('youtube')).day;
  const base = path.join(queueDir, 'factory', day);
  const matDir = opt('material') ? path.resolve(opt('material')) : path.join(base, 'material');
  fs.mkdirSync(matDir, { recursive: true });
  const jobs = []; // [{ file, sources }]
  let news = null;
  if (!opt('material')) {
    news = await newsDay(base);
    for (const e of news?.episodes || []) if (e.file && !e.offline) jobs.push({ file: e.file, sources: news.sourcesDir, pictures: news.picturesDir });
    if (opt('concurso') !== 'no') {
      await step('el concurso', async () => {
        for (const t of quizTimes(at)) {
          console.log(`[beta] pay-attention: el concurso rehecho desde el archivo, con las voces (${new Date(t).toISOString()})`);
          const r = await child(['tools/publish/material.mjs', '--at', new Date(t).toISOString(), '--programmes', 'pay-attention', '--out', matDir], { quiet: true });
          const made = r.out.split('\n').filter((l) => /voiced|nothing made|no plan/.test(l)).slice(-2).join(' | ');
          console.log(`[beta]   ${made || `salió con ${r.code}`}`);
          if (/voiced/.test(made)) break;
        }
      });
    }
  }
  // (episodes made already: their stories' sources from --sources, else the day's own folder when the news day made one)
  const daySources = opt('sources') ? path.resolve(opt('sources')) : fs.existsSync(path.join(base, 'sources', 'archive')) ? path.join(base, 'sources') : null;
  const dayPictures = fs.existsSync(path.join(base, 'pictures')) ? path.join(base, 'pictures') : null;
  for (const f of fs.readdirSync(matDir).filter((x) => x.endsWith('.json'))) jobs.push({ file: path.join(matDir, f), sources: daySources, pictures: dayPictures });
  const roots = masterRoots(process.env, [opt('masters-from')]);
  const sums = [];
  for (const job of jobs) {
    const f = path.basename(job.file);
    const out = path.join(base, f.replace(/\.json$/, ''));
    let ep = null;
    try {
      ep = JSON.parse(fs.readFileSync(job.file, 'utf8'));
    } catch {
      /* unreadable: the factory says why */
    }
    // a programme the offline writer wrote is never published (the gate's `offline-writer`: verbatim.md §7): not recorded
    if (String(ep?.provider || '').toLowerCase() === 'mock') {
      console.log(`[beta] ${f}: ${RULE_ES['offline-writer'] || 'escrito por el redactor de reserva: nunca se publica'} No se graba.`);
      continue;
    }
    // the playout's rendered master, when it has made one: cut instead of recorded again
    const rendered = ep ? useRenderedMaster(ep, 'vertical', roots, path.join(out, 'masters')) : null;
    console.log(`[beta] ${f}: los clips (vertical) y la cola${rendered ? ` (del máster ya renderizado: ${path.dirname(rendered.file)})` : ''}`);
    const args = ['tools/publish/factory.mjs', '--episode', job.file, '--out', out, '--formats', 'vertical', '--queue', queueDir, '--max', String(opt('max', 6))];
    if (job.sources) args.push('--sources', job.sources);
    // (the news' cleared pictures, served to the recorder: the clip shows them with their credits)
    if (job.pictures) args.push('--pictures', job.pictures);
    const r = await step(`clips de ${ep?.program?.title || f}`, () => child(args, { quiet: true }));
    if (r.code) console.log(`[beta]   la fábrica salió con ${r.code}: ${r.out.trim().split('\n').slice(-2).join(' | ')}`);
    sums.push(path.join(out, 'summary.json'));
  }
  const postSources = news?.episodes?.some((e) => e.file && !e.offline) ? news.sourcesDir : daySources;
  console.log(`[beta] los textos del ${day} (solo para las redes en «Manual»)${postSources ? ': de las noticias de la IA' : ''}`);
  const postArgs = ['tools/publish/posts.mjs', '--day', day, '--enqueue', '--queue', queueDir, '--out', path.join(base, 'posts')];
  if (postSources) postArgs.push('--data', postSources);
  const pr = await step('los textos', () => child(postArgs, { quiet: true }));
  console.log(`[beta]   ${pr.out.trim().split('\n').slice(-1)[0] || `salió con ${pr.code}`}`);
  console.log('\nLos momentos de cada programa:');
  for (const s of sums) console.log(`  ${momentsOf(s)}`);
  summary();
  console.log(`\nTiempo: ${times.map(([l, s]) => `${l} ${s >= 90 ? `${Math.floor(s / 60)} min` : `${s} s`}`).join(' · ')}`);
}

/** The day's news candidates and their cleared pictures, from the live feeds: no writer, no key, nothing made. */
async function fotos() {
  try {
    os.setPriority(10);
  } catch {
    /* not allowed here */
  }
  const { config } = await import('../../server/config.js');
  const { NewsDesk } = await import('../../server/news.js');
  const { Producer } = await import('../../server/producer.js');
  const { ProviderChain } = await import('../../server/providers/index.js');
  const { loadChannel } = await import('../../server/channel.js');
  const kit = await pictureKit(config);
  if (!kit) return console.log('[beta] fotos: el escritorio de derechos está apagado (PICTURE_DESK=off o --fotos no)');
  const desk = new NewsDesk({ log: quiet });
  await step('las noticias de los feeds', () => desk.refresh());
  console.log(`[beta]   ${desk.stories?.size ?? 0} noticias en los feeds`);
  // (the producer only chooses the candidates here: it writes nothing, it asks no writer)
  const producer = new Producer({ config: { ...config, dataDir: path.join(queueDir, 'pictures', 'state') }, newsDesk: desk, chain: new ProviderChain([], { record() {} }, { log: quiet }), pictureDesk: kit.desk, log: quiet });
  const days = await step('las fotos (decisiones del escritorio de derechos)', () => pictureDay({ producer, channel: loadChannel(undefined, { drafts: true }), programmes: NEWS, pictureDesk: kit.desk, budgetMs: kit.budgetMs }));
  kit.desk.kept.save({ force: true });
  let all = 0;
  let pictured = 0;
  for (const d of days) {
    all += d.candidates;
    pictured += d.pictured;
    console.log(`\n${d.programId}: ${d.pictured} de ${d.candidates} candidatas con foto autorizada`);
    for (const s of d.stories) console.log(`  ${s.credit ? 'FOTO ' : '     '} ${String(s.title).slice(0, 80)}${s.credit ? ` · ${s.credit}` : ''}`);
  }
  console.log(`\nTotal: ${pictured} de ${all} noticias candidatas con foto autorizada. Nada se ha escrito ni publicado.`);
  console.log(`Tiempo: ${times.map(([l, s]) => `${l} ${s >= 90 ? `${Math.floor(s / 60)} min` : `${s} s`}`).join(' · ')}`);
}

if (['hacer', 'make'].includes(cmd)) await make();
else if (['fotos', 'pictures'].includes(cmd)) await fotos();
else if (['estado', 'status'].includes(cmd)) summary();
else {
  const port = opt('port', '8740');
  const r = await child(['tools/publish/approve.mjs', '--manual', '--queue', queueDir, '--port', port]);
  process.exit(r.code || 0);
}
