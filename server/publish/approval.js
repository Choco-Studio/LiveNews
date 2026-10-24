// The approval page (docs/publishing/pipeline.md §3; the owner's guide: docs/publishing/setup.md §6): one local page
// where the owner sees every piece the desk made, as it will go out (the video, its cover, its contact sheet, the
// text, the network, the time it would go), and approves it, rejects it or edits its title. In Spanish, for him.
//
//   createApprovalServer({ queue, mediaRoots, dataDir, log, now }) -> { listen(port, host), close(), token }
//
// Safe by construction, because it changes what the channel publishes:
//   - it listens on 127.0.0.1 only, and answers only requests whose Host is 127.0.0.1:<port> or localhost:<port>
//     (a web page elsewhere cannot reach it through DNS rebinding)
//   - every change is a POST with a JSON body and the page's own token in a header (a random token per start: a form
//     on another site can send neither), and an Origin, when sent, must be this page's
//   - media are served only from the paths the queue item itself names, inside the folders it was given (mediaRoots),
//     with the extensions a preview needs; nothing else on the disk can be read through it
//   - no credentials pass through it, and it cannot switch live publishing on (that is the environment's
//     PUBLISH_LIVE and the settings file, by hand: setup.md §7)
//
// Hand publishing (PUBLISH_MODE=manual, the beta: mode.js, manual.js, docs/publishing/beta.md): the page offers the day's
// pick (plan.md Phase 1), and for each approved item, after the compliance gate has passed it again, the signed file and
// its cover to download, the texts to copy, the network's own switches to tick, and "Ya lo he publicado", which records
// it in the queue, the ledger and the compliance register. Nothing is scheduled from the page in that mode.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PLATFORMS } from './platforms.js';
import { MODES, localParts } from './queue.js';
import * as compliance from './compliance.js';
import { isManual } from './mode.js';
import { dailyPick, prepareManual, recordManual, isPrepared } from './manual.js';

const MEDIA = { video: ['.mp4', '.m4v', '.webm'], thumb: ['.jpg', '.jpeg', '.png'], contact: ['.png', '.jpg'], captions: ['.srt', '.vtt'] };
const TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8' };
const MAX_BODY = 64 * 1024;

/** Is `file` inside one of `roots` (after resolving links)? */
export function insideRoots(file, roots) {
  let real;
  try {
    real = fs.realpathSync(file);
  } catch {
    return false;
  }
  return roots.some((r) => {
    let rr;
    try {
      rr = fs.realpathSync(r);
    } catch {
      return false;
    }
    const rel = path.relative(rr, real);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

/** The same piece for several networks (one clip's moment and format, one post's stories): approved together. */
export const groupOf = (it) => (it.kind === 'clip' ? `clip|${it.source?.momentId || ''}|${it.format || ''}` : it.kind === 'text' ? `text|${(it.source?.storyIds || []).slice().sort().join(',')}` : `episode|${it.source?.episodeId || it.id}`);

/** What the page shows of an item (no file paths: media go through /media/<id>/<kind>). */
/** Why the compliance desk held an item, in the owner's words (its own message, in English, stays under it). */
export const RULE_ES = Object.freeze({
  verbatim: 'Copia palabras del medio: el texto o la voz repiten sus frases. No sale hasta que el canal lo cuente con sus propias palabras.',
  'sources-missing': 'No están a mano los textos del medio para esta noticia, así que no se puede comprobar que no los copia. No sale.',
  'offline-writer': 'Escrito sin IA: copia demasiado de la fuente. Lo escribió el redactor de reserva (sin clave de IA, o con la IA caída o sin saldo) y nunca se publica.',
  demo: 'Son datos de prueba (demostración): nunca se publican.',
  'flag-missing': 'Falta la etiqueta de IA de la red («contenido generado por IA»): es obligatoria, la red la enseña desde el primer segundo.',
  'flag-unavailable': 'Esta red no tiene marca de IA automática: hay que ponerla a mano o no publicar aquí.',
  'election-hold': 'Periodo electoral: este contenido espera a que pase la votación.',
  'election-silence': 'Jornada de reflexión: no se publica nada sobre la votación.',
  'review-missing': 'Falta tu revisión de la recreación.',
  'label-out-of-frame': 'La etiqueta de recreación no se ve entera en este formato.',
  'label-illegible': 'La etiqueta de recreación se vería demasiado pequeña.',
  'quote-cut': 'El clip corta una cita o una frase por la mitad.',
  'editorial-contact-missing': 'Falta el contacto editorial (EDITORIAL_CONTACT) en la configuración.',
  packaging: 'Un título o las palabras de una portada no pasan la revisión del paquete (gancho engañoso, mayúsculas, algo que la noticia no dice, copia del titular del medio o demasiado largo). Cambia el título o deja que se rehaga.',
  'text-disclosure-missing': 'Falta el aviso de IA al principio del texto («AI-generated:» en una publicación, «AI-produced news» en el texto o la descripción de un vídeo), o el vídeo no lleva texto.',
  unmarked: 'El vídeo no lleva la firma de procedencia (C2PA).',
  'rights-missing': 'Falta el permiso de uso de una foto o un vídeo, o su permiso ya no lo cubre.',
  'not-publishable': 'Lleva material de prueba o de demostración: nunca se publica.',
  blocked: 'Hay un aviso en el registro: una retirada, una historia retirada o una persona que pidió no aparecer.',
  'file-missing': 'Falta el archivo del vídeo o de la imagen.',
  'timeline-missing': 'Falta el registro de tiempos del clip: no se puede comprobar qué sale en pantalla.',
  'provenance-missing': 'Falta la información de procedencia de la recreación.',
  'end-card-missing': 'Le falta al clip la tarjeta final con el aviso de IA (AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES).',
  'ident-missing': 'El programa no empieza con el ident del canal (GLOBIT 24 y el aviso de IA).',
  'ident-gap': 'Con este programa y la pausa de después, el canal pasaría más de 15 minutos sin su ident.',
  'false-live': 'Dice «en directo» y es un programa grabado antes: así no se emite.',
  'render-overrun': 'El programa no terminó cuando debía: no se emite sin revisarlo.',
  'gate-error': 'El control no pudo comprobarlo, y nada sale sin comprobar.',
});

/**
 * The programmes the pre-rendered playout held from air (docs/publishing/playout.md §3: data/playout/held), newest first,
 * with the reasons in the owner's words; and what the renderer and the playout say about the buffer. Read only: a held
 * programme never airs, nothing on this page can put it on air.
 */
export function playoutView(dir, { max = 40, tz = 'Europe/London' } = {}) {
  if (!dir) return null;
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return null;
    }
  };
  let names = [];
  try {
    names = fs.readdirSync(path.join(dir, 'held')).filter((n) => n.endsWith('.json')).sort().reverse().slice(0, max);
  } catch {
    return null;
  }
  const held = names.map((n) => read(path.join(dir, 'held', n))).filter(Boolean).map((h) => {
    const lp = Number.isFinite(h.airAt) ? localParts(h.airAt, tz) : null;
    return {
      id: h.id,
      title: h.title || h.programId || '',
      stage: h.stage === 'air' ? 'air' : 'production',
      airAt: h.airAt || null,
      time: lp ? `${lp.day} ${String(lp.h).padStart(2, '0')}:${String(lp.m).padStart(2, '0')}` : null,
      violations: (h.violations || []).slice(0, 12).map((v) => ({ rule: v.rule, message: String(v.message || '').slice(0, 300), es: RULE_ES[v.rule] || null })),
    };
  });
  const render = read(path.join(dir, 'render-status.json'));
  const air = read(path.join(dir, 'air-status.json'));
  return { held, buffer: render ? { minutes: render.bufferMinutes, target: render.targetMinutes, speed: render.speed } : null, onAir: air?.onAir?.title || null };
}

/** TikTok's privacy levels (creator_info's privacy_level_options name them; the owner picks one, no default). */
export const TIKTOK_PRIVACY = Object.freeze(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']);

/** A TikTok item's choices as the page shows them (nothing chosen until the owner chooses it). */
const tiktokView = (t = {}) => ({ privacy: TIKTOK_PRIVACY.includes(t?.privacy) ? t.privacy : null, allowComment: t?.allowComment === true, allowDuet: t?.allowDuet === true, allowStitch: t?.allowStitch === true, consent: t?.consent === true });

export function itemView(it, { tz = 'Europe/London', now = Date.now() } = {}) {
  const p = PLATFORMS[it.platform] || {};
  const at = it.schedule?.at || null;
  const lp = at ? localParts(at, it.schedule?.tz || tz) : null;
  return {
    id: it.id,
    kind: it.kind,
    platform: it.platform,
    platformLabel: p.name || it.platform,
    format: it.format || null,
    status: it.status,
    title: it.title || '',
    titleMax: p.text?.title || null,
    text: it.text || '',
    textMax: p.text?.post || p.text?.caption || p.text?.message || (it.kind === 'clip' && it.platform === 'youtube' ? p.text?.description : null) || p.text?.title || null,
    group: groupOf(it),
    description: it.description || '',
    links: (it.links || []).map((l) => ({ label: l.label || l.outlet || l.url, url: l.url })).filter((l) => /^https?:\/\//.test(l.url || '')),
    duration: it.media?.duration || null,
    has: { video: !!it.media?.video, thumb: !!it.media?.thumb, contact: !!it.media?.contact, captions: !!it.media?.captions, covers: Array.isArray(it.media?.thumbs) ? it.media.thumbs.length : 0 },
    // the packaging (packaging.js, docs/publishing/thumbnails-titles.md): three titles, three covers with their words,
    // the caption's hook; who wrote them (the AI writer, checked, or the deterministic writer)
    pack: it.package ? { titles: (it.package.titles || []).slice(0, 3), thumbs: (it.package.thumbs || []).slice(0, 3), hook: it.package.hook || '', writer: it.package.writer || 'fallback' } : null,
    programme: it.source?.programId || null,
    score: it.score ?? null,
    compliance: { ok: it.compliance?.ok !== false, stub: !!it.compliance?.stub, recheck: !!it.compliance?.recheck && it.status === 'held', violations: (it.compliance?.violations || []).map((v) => ({ rule: v.rule, message: v.message, es: RULE_ES[v.rule] || null })), warnings: it.compliance?.warnings || [] },
    disclosure: it.disclosure?.[it.platform] || null,
    sample: !!it.sample,
    schedule: lp ? { at, day: lp.day, time: `${String(lp.h).padStart(2, '0')}:${String(lp.m).padStart(2, '0')}`, tz: it.schedule?.tz || tz } : null,
    history: (it.history || []).slice(-6).map((h) => ({ at: h.at, action: h.action, by: h.by })),
    tiktok: it.platform === 'tiktok' ? tiktokView(it.tiktok) : null,
    grave: !!it.grave,
    // hand publishing (manual.js): what the owner downloads, copies and ticks, once the gate has passed it again
    manual: it.manual?.ok ? { fresh: isPrepared(it, now), preparedAt: it.manual.preparedAt, fields: it.manual.fields || [], checklist: it.manual.checklist || [], files: { video: !!it.manual.files?.video, cover: !!it.manual.files?.cover, cover2: !!it.manual.files?.cover2, cover3: !!it.manual.files?.cover3 }, devCert: !!it.manual.devCert } : null,
    result: it.result ? { manual: !!it.result.manual, url: /^https:\/\//.test(String(it.result.url || '')) ? it.result.url : null, at: it.result.at || null, dryRun: !!it.result.dryRun } : null,
  };
}

export function createApprovalServer({ queue, mediaRoots = [], dataDir = null, log = () => {}, now = () => Date.now(), env = process.env, manualOpts = {}, playoutDir = null } = {}) {
  if (!queue) throw new Error('the approval page needs the queue');
  // hand publishing (the beta): the owner publishes every approved item himself (manual.js)
  const manual = isManual(env);
  // TikTok's route (adapters/tiktok.js): the inbox (the owner finishes the post in the TikTok app, privacy there), or a
  // direct post, where the owner's privacy, interaction choices and consent are given here, item by item
  const tiktokMode = String(env.TIKTOK_MODE || 'inbox').toLowerCase() === 'direct' ? 'direct' : 'inbox';
  // (by hand, the owner sets TikTok's privacy and switches in the app itself: the checklist asks for them)
  const tiktokReady = (it) => manual || it.platform !== 'tiktok' || tiktokMode !== 'direct' || (TIKTOK_PRIVACY.includes(it.tiktok?.privacy) && it.tiktok?.consent === true);
  const token = crypto.randomBytes(24).toString('hex');
  const roots = [queue.dir, ...mediaRoots].map((r) => path.resolve(r));
  let port = 0;
  let server = null;

  const hostOk = (req) => {
    const h = String(req.headers.host || '').toLowerCase();
    return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  };
  const originOk = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    return o === `http://127.0.0.1:${port}` || o === `http://localhost:${port}`;
  };
  const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let n = 0;
      const chunks = [];
      req.on('data', (d) => {
        n += d.length;
        if (n > MAX_BODY) {
          reject(new Error('too large'));
          req.destroy();
          return;
        }
        chunks.push(d);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new Error('bad json'));
        }
      });
      req.on('error', reject);
    });

  function state() {
    const s = queue.settings();
    const t = now();
    const items = queue.list().map((it) => itemView(it, { tz: queue.tzOf(it.platform), now: t }));
    const counts = {};
    for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;
    return { tiktokMode,
      manual,
      pick: manual ? dailyPick(queue, { now: t }) : null,
      settings: { phase: s.phase, dryRun: s.dryRun !== false, timezone: s.timezone, modes: s.modes, live: s.live },
      platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, { label: p.name || k, kind: p.kind }])),
      modes: MODES,
      items,
      counts,
      usingStub: compliance.usingStub,
      playout: playoutView(playoutDir, { tz: s.timezone || 'Europe/London' }),
      publishLive: !manual && process.env.PUBLISH_LIVE === '1',
      at: t,
    };
  }

  function media(res, req, id, kind, n = null) {
    const it = queue.get(id);
    // a cover of the package (/media/<id>/cover/0..2): the media's thumbs, as images
    const file = kind === 'cover' ? (Array.isArray(it?.media?.thumbs) ? it.media.thumbs[Number(n)] : null) : it?.media?.[kind];
    if (kind === 'cover') kind = 'thumb';
    if (!file || !MEDIA[kind]) return send(res, 404, { error: 'no such media' });
    const ext = path.extname(file).toLowerCase();
    if (!MEDIA[kind].includes(ext) || !insideRoots(file, roots)) return send(res, 403, { error: 'not served' });
    const st = fs.statSync(file);
    if (!st.isFile()) return send(res, 404, { error: 'no such media' });
    const type = TYPES[ext] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (range && kind === 'video') {
      let start = range[1] === '' ? Math.max(0, st.size - Number(range[2] || 0)) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
      end = Math.min(end, st.size - 1);
      if (!(start <= end && start < st.size)) return send(res, 416, '', 'text/plain', { 'content-range': `bytes */${st.size}` });
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      fs.createReadStream(file, { start, end }).pipe(res);
      return null;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
    return null;
  }

  /** A signed file an item's hand publication needs (manual.js): only once the gate has passed it, as an attachment. */
  function download(res, id, kind) {
    const it = queue.get(id);
    if (!manual || !it || !['approved', 'scheduled'].includes(it.status) || !isPrepared(it, now())) return send(res, 409, { error: 'not prepared', message: 'Prepáralo primero: se revisa otra vez antes de descargar.' });
    const file = it.manual.files?.[kind];
    const ext = file ? path.extname(file).toLowerCase() : '';
    if (!file || !(kind === 'video' ? MEDIA.video : MEDIA.thumb).includes(ext) || !insideRoots(file, roots)) return send(res, 404, { error: 'no such file' });
    const st = fs.statSync(file);
    const name = `GLOBIT24-${it.platform}-${String(it.source?.programId || it.kind).replace(/[^a-z0-9-]+/gi, '')}-${it.id.slice(-12)}${kind === 'cover' ? '-portada-A' : kind === 'cover2' ? '-portada-B' : kind === 'cover3' ? '-portada-C' : ''}${ext}`;
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'content-length': st.size, 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
    return null;
  }

  async function action(req, res, name) {
    if (req.headers['x-approval-token'] !== token) return send(res, 403, { error: 'token' });
    if (!originOk(req)) return send(res, 403, { error: 'origin' });
    if (!/^application\/json\b/.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'json only' });
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
    const id = typeof body.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(body.id) ? body.id : null;
    if (name === 'settings') {
      const modes = {};
      for (const [k, m] of Object.entries(body.modes || {})) if (PLATFORMS[k] && MODES.includes(m)) modes[k] = m;
      const patch = { modes };
      if (typeof body.timezone === 'string' && /^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(body.timezone)) {
        try {
          new Intl.DateTimeFormat('en-GB', { timeZone: body.timezone });
          patch.timezone = body.timezone;
        } catch {
          /* not a time zone */
        }
      }
      // (phase, dryRun and live are not editable here: setup.md §7)
      queue.saveSettings(patch);
      log(`[approval] settings ${JSON.stringify(patch)}`);
      return send(res, 200, state());
    }
    if (name === 'schedule') {
      if (manual) return send(res, 409, { error: 'manual', message: 'Modo manual: nada se programa, cada publicación la haces tú.' });
      const done = queue.schedule(now());
      return send(res, 200, { scheduled: done.length, state: state() });
    }
    if (!id) return send(res, 400, { error: 'id' });
    const before = queue.get(id);
    if (!before) return send(res, 404, { error: 'no such item' });
    let it = null;
    if (name === 'approve') {
      if (before.compliance && before.compliance.ok === false) return send(res, 409, { error: 'compliance', message: 'Este elemento no pasó el control de cumplimiento y no puede aprobarse.' });
      if (!tiktokReady(before)) return send(res, 409, { error: 'tiktok', message: 'TikTok (publicación directa): elige la privacidad y acepta la confirmación de uso de música antes de aprobar.' });
      // "approve on every network": the same piece's other pending items, each still under its own compliance verdict
      // (a TikTok sibling waiting for its own choices is left to wait for them)
      const ids = body.all === true ? queue.list({ status: 'pending' }).filter((x) => groupOf(x) === groupOf(before) && x.compliance?.ok !== false && tiktokReady(x)).map((x) => x.id) : [];
      for (const one of [...new Set([id, ...ids])]) {
        it = queue.approve(one, 'owner');
        const rv = compliance.recordReview(one, { by: 'owner', verdict: 'approve', note: 'approval page' }, { dataDir });
        if (rv.ok) queue.save(queue.note(it, 'review recorded', 'owner'));
      }
      it = queue.get(id);
    } else if (name === 'reject') {
      it = queue.reject(id, 'owner', typeof body.reason === 'string' ? body.reason.slice(0, 300) : '');
      compliance.recordReview(id, { by: 'owner', verdict: 'reject', note: typeof body.reason === 'string' ? body.reason.slice(0, 300) : '' }, { dataDir });
    } else if (name === 'tiktok') {
      if (before.platform !== 'tiktok') return send(res, 400, { error: 'not a TikTok item' });
      if (body.privacy !== null && body.privacy !== undefined && !TIKTOK_PRIVACY.includes(body.privacy)) return send(res, 400, { error: 'privacy' });
      if (['published', 'publishing'].includes(before.status)) return send(res, 409, { error: 'already out' });
      const t = { privacy: body.privacy || null, allowComment: body.allowComment === true, allowDuet: body.allowDuet === true, allowStitch: body.allowStitch === true, consent: body.consent === true };
      it = queue.save(queue.note({ ...before, tiktok: t }, 'tiktok choices', 'owner', { privacy: t.privacy }));
    } else if (name === 'prepare') {
      if (!manual) return send(res, 409, { error: 'not manual', message: 'Solo en el modo manual (PUBLISH_MODE=manual).' });
      const r = await prepareManual(queue, id, { dataDir, now: now(), env, ...manualOpts });
      log(`[approval] prepare ${id}: ${r.ok ? 'ready' : r.error}`);
      if (!r.ok) return send(res, r.status || 409, { error: r.error, message: r.message, item: r.item ? itemView(r.item, { tz: queue.tzOf(before.platform), now: now() }) : null });
      it = r.item;
    } else if (name === 'published') {
      if (!manual) return send(res, 409, { error: 'not manual', message: 'Solo en el modo manual (PUBLISH_MODE=manual).' });
      const r = recordManual(queue, id, { url: typeof body.url === 'string' ? body.url.slice(0, 500) : '', checks: Array.isArray(body.checks) ? body.checks.slice(0, 20).map((c) => String(c).slice(0, 40)) : [], dataDir, now: now() });
      log(`[approval] published by hand ${id}: ${r.ok ? (r.item.result.url || 'no address') : r.error}`);
      if (!r.ok) return send(res, r.status || 409, { error: r.error, message: r.message });
      it = r.item;
    } else if (name === 'edit') {
      it = queue.edit(id, { title: typeof body.title === 'string' ? body.title.slice(0, 500) : undefined, text: typeof body.text === 'string' ? body.text.slice(0, 5000) : undefined }, 'owner');
      // (new words: what was prepared to paste is checked again before it is handed out)
      if (it?.manual) {
        it.manual = null;
        it = queue.save(it);
      }
    } else return send(res, 404, { error: 'no such action' });
    log(`[approval] ${name} ${id}`);
    return send(res, 200, { item: itemView(queue.get(id) || it, { tz: queue.tzOf(before.platform), now: now() }) });
  }

  async function handle(req, res) {
    if (!hostOk(req)) return send(res, 421, { error: 'host' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const nonce = crypto.randomBytes(12).toString('base64');
      return send(res, 200, page(token, nonce), 'text/html; charset=utf-8', {
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      });
    }
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, state());
    let m = /^\/media\/([a-z0-9-]{1,80})\/(video|thumb|contact|captions)$/i.exec(p);
    if (req.method === 'GET' && m) return media(res, req, m[1], m[2]);
    m = /^\/media\/([a-z0-9-]{1,80})\/cover\/([0-2])$/i.exec(p);
    if (req.method === 'GET' && m) return media(res, req, m[1], 'cover', m[2]);
    m = /^\/download\/([a-z0-9-]{1,80})\/(video|cover|cover2|cover3)$/i.exec(p);
    if (req.method === 'GET' && m) return download(res, m[1], m[2]);
    m = /^\/api\/(approve|reject|edit|tiktok|settings|schedule|prepare|published)$/.exec(p);
    if (req.method === 'POST' && m) return action(req, res, m[1]);
    return send(res, 404, { error: 'not found' });
  }

  return {
    token,
    get port() {
      return port;
    },
    listen(p = 0, host = '127.0.0.1') {
      if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('the approval page listens on 127.0.0.1 only');
      return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
          handle(req, res).catch((err) => {
            log(`[approval] ${err.message}`);
            if (!res.headersSent) send(res, 500, { error: 'internal' });
          });
        });
        server.on('error', reject);
        server.listen(p, '127.0.0.1', () => {
          port = server.address().port;
          resolve(port);
        });
      });
    },
    close() {
      return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    },
  };
}

// ---------------------------------------------------------------- the page (Spanish, one file, no outside requests)

function page(token, nonce) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GLOBIT 24 · Aprobar publicaciones</title>
<style>
  :root { --bg: #0e1018; --panel: #171a26; --ink: #e8e9f0; --dim: #9aa0b4; --line: #2a2f42; --ok: #3fbf7f; --bad: #e0565b; --warn: #f0b43c; --accent: #e83b46; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: #0b0d14; border-bottom: 1px solid var(--line); padding: 10px 16px; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }
  header h1 { font-size: 17px; margin: 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; background: var(--line); color: var(--ink); }
  .badge.dry { background: #23406b; } .badge.stub { background: #6b4b16; } .badge.live { background: var(--bad); }
  main { padding: 12px 16px 40px; max-width: 1300px; margin: 0 auto; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
  .tabs button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 14px; }
  .tabs button.on { border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .card.held { border-color: #6b2d31; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .media { display: flex; gap: 8px; align-items: flex-start; }
  video { width: 100%; max-height: 420px; background: #000; border-radius: 6px; }
  .vertical video { width: 56%; }
  img.contact { width: 100%; border-radius: 4px; image-rendering: pixelated; cursor: zoom-in; }
  .pack { border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
  .covers { display: flex; gap: 6px; margin: 6px 0; }
  .covers figure { margin: 0; flex: 1; }
  .covers img { width: 100%; image-rendering: pixelated; border-radius: 4px; display: block; }
  .covers.tall img { max-height: 260px; object-fit: contain; }
  .covers figcaption { font-size: 11px; color: #8a8fa3; }
  .title { width: 100%; background: #0e1018; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; font-weight: 600; }
  textarea { width: 100%; min-height: 70px; background: #0e1018; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 14px; }
  .count { font-size: 12px; color: var(--dim); }
  .count.over { color: var(--bad); }
  .btn { border: 0; border-radius: 6px; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; }
  .approve { background: var(--ok); color: #06210f; } .reject { background: #3a2226; color: #ffd9db; } .save { background: var(--line); color: var(--ink); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .comp { font-size: 13px; padding: 6px 8px; border-radius: 6px; background: #12261b; color: #bfeccf; }
  .comp.bad { background: #2b1416; color: #ffc9cc; }
  .dim { color: var(--dim); font-size: 13px; }
  fieldset.tiktok { border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; display: grid; gap: 4px; font-size: 14px; }
  fieldset.tiktok legend { font-weight: 600; padding: 0 4px; }
  details { font-size: 13px; color: var(--dim); }
  a { color: #8ab4ff; }
  .settings { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 14px; display: none; }
  .settings.open { display: block; }
  .settings table { border-collapse: collapse; }
  .settings td { padding: 4px 10px 4px 0; }
  select { background: #0e1018; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 4px; font: inherit; }
  .hand { border: 1px solid #2f5d46; border-radius: 8px; padding: 10px; display: grid; gap: 8px; background: #101d17; }
  .hand h3 { margin: 0; font-size: 15px; }
  .hand .field { display: grid; gap: 4px; }
  .hand .field pre { margin: 0; max-height: 140px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #0e1018; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace; }
  .hand .checks { display: grid; gap: 4px; font-size: 14px; }
  .hand label.opt { display: flex; gap: 8px; align-items: flex-start; }
  .hand a.btn { text-decoration: none; display: inline-block; }
  .copy { background: #23406b; color: #fff; padding: 4px 10px; font-size: 13px; }
  .done { background: var(--ok); color: #06210f; }
  .caps { font-size: 14px; margin: 0 0 10px; }
  .toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #222838; border: 1px solid var(--line); padding: 8px 14px; border-radius: 8px; display: none; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .vertical video { width: 100%; } }
</style>
</head>
<body>
<header>
  <h1>GLOBIT 24 · Publicaciones</h1>
  <span id="mode" class="badge dry">Modo de prueba: no se publica nada</span>
  <span id="stub" class="badge stub" hidden>Control de cumplimiento provisional</span>
  <span class="dim" id="summary"></span>
  <span style="flex:1"></span>
  <button class="btn save" id="schedule" title="Da hora a todo lo aprobado, respetando el espaciado y los límites de cada red">Programar lo aprobado</button>
  <button class="btn save" id="toggleSettings">Ajustes</button>
</header>
<main>
  <section class="settings" id="settings">
    <p class="dim">Cómo trata cada red lo que hace el canal. <b>Manual</b>: todo espera tu aprobación. <b>Muestra</b> y <b>Automático</b> solo existen en la fase 3. <b>Apagada</b>: no se prepara nada para esa red. Publicar de verdad no se activa aquí (ver la guía, apartado 7).</p>
    <table id="modes"></table>
    <p><label>Zona horaria <input id="tz" class="title" style="width:220px"></label></p>
    <button class="btn save" id="saveSettings">Guardar ajustes</button>
  </section>
  <div class="tabs" id="tabs"></div>
  <p class="caps dim" id="caps" hidden></p>
  <div class="grid" id="grid"></div>
  <p class="dim" id="empty" hidden>No hay nada aquí.</p>
</main>
<div class="toast" id="toast"></div>
<script nonce="${nonce}">
const TOKEN = ${JSON.stringify(token)};
const STATUS = { pending: 'Por aprobar', held: 'Retenido', approved: 'Aprobado', scheduled: 'Programado', publishing: 'Publicándose', published: 'Publicado', failed: 'Falló', rejected: 'Rechazado', duplicate: 'Duplicado' };
const MODE = { manual: 'Manual', sample: 'Muestra (1 de cada 5)', auto: 'Automático', off: 'Apagada' };
const ORDER = ['pending', 'held', 'approved', 'scheduled', 'published', 'failed', 'rejected', 'duplicate'];
const NET = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', x: 'X', threads: 'Threads', bluesky: 'Bluesky', telegram: 'Telegram' };
const KIND = { video: 'clips', episode: 'programas', text: 'textos' };
let S = null;
let tab = null;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
};
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.style.display = 'none'), 2600);
}
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-approval-token': TOKEN }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || r.status);
  return j;
}
async function load() {
  S = await (await fetch('/api/state')).json();
  render();
}
function render() {
  if (S.manual) {
    $('mode').textContent = 'Beta: publicas tú, a mano. El sistema no sube nada a ninguna red';
    $('mode').className = 'badge dry';
    $('schedule').hidden = true;
  } else {
    $('mode').textContent = S.settings.dryRun || !S.publishLive ? 'Modo de prueba: no se publica nada' : 'PUBLICACIÓN REAL ACTIVADA';
    $('mode').className = 'badge ' + (S.settings.dryRun || !S.publishLive ? 'dry' : 'live');
  }
  $('stub').hidden = !S.usingStub;
  $('summary').textContent = 'Fase ' + S.settings.phase + ' · ' + (S.counts.pending || 0) + ' por aprobar';
  if (!tab) tab = S.manual ? 'today' : 'pending';
  const pick = new Set(S.pick ? S.pick.ids : []);
  const tabs = $('tabs');
  const today = S.manual ? [el('button', { class: tab === 'today' ? 'on' : '', text: 'Para hoy (' + pick.size + ')', onclick: () => { tab = 'today'; render(); } })] : [];
  tabs.replaceChildren(...today, ...ORDER.filter((s) => S.counts[s] || s === 'pending').map((s) => el('button', { class: s === tab ? 'on' : '', text: STATUS[s] + ' (' + (S.counts[s] || 0) + ')', onclick: () => { tab = s; render(); } })));
  // the pre-rendered playout's held programmes (read only: nothing here puts them on air)
  if (S.playout) tabs.append(el('button', { class: tab === 'air' ? 'on' : '', text: 'Retenidos del aire (' + S.playout.held.length + ')', onclick: () => { tab = 'air'; render(); } }));
  $('caps').hidden = tab !== 'today';
  if (tab === 'air' && S.playout) {
    $('empty').hidden = S.playout.held.length > 0;
    $('grid').replaceChildren(airInfo(), ...S.playout.held.map(airCard));
  } else {
    const items = tab === 'today' ? S.items.filter((i) => pick.has(i.id)) : S.items.filter((i) => i.status === tab);
    if (tab === 'today' && S.pick) {
      const parts = [];
      for (const [net, kinds] of Object.entries(S.pick.caps)) for (const [k, c] of Object.entries(kinds)) parts.push((NET[net] || net) + ' (' + KIND[k] + '): ' + c.done + ' de ' + c.cap + ' publicados');
      $('caps').textContent = 'Hoy: ' + (parts.join(' · ') || 'nada esperando') + '. Lo demás sigue en «Por aprobar» para otro día.';
    }
    $('empty').hidden = items.length > 0;
    $('grid').replaceChildren(...items.map(card));
  }
  const modes = $('modes');
  modes.replaceChildren(...Object.entries(S.platforms).map(([k, p]) => {
    const sel = el('select', { 'data-platform': k });
    for (const m of S.modes) {
      const o = el('option', { value: m, text: MODE[m] || m });
      if ((m === 'auto' || m === 'sample') && S.settings.phase < 3) o.disabled = true;
      if (S.settings.modes[k] === m) o.selected = true;
      sel.append(o);
    }
    return el('tr', {}, el('td', { text: p.label }), el('td', {}, sel));
  }));
  $('tz').value = S.settings.timezone;
}
// the pre-rendered playout: programmes held from air (never aired; nothing here puts them on air)
function airInfo() {
  const b = S.playout.buffer;
  return el('div', { class: 'card' },
    el('b', { text: 'Emisión pregrabada' }),
    el('span', { class: 'dim', text: 'Cada programa se prepara y se comprueba con antelación. Lo que no pasa el control se queda aquí y no se emite nunca: en su lugar sale el programa siguiente.' }),
    b ? el('span', { text: 'Preparado por adelantado: ' + b.minutes + ' de ' + b.target + ' minutos' }) : null,
    S.playout.onAir ? el('span', { class: 'dim', text: 'En antena: ' + S.playout.onAir }) : null);
}
function airCard(h) {
  return el('div', { class: 'card held' },
    el('div', { class: 'row' }, el('span', { class: 'badge', text: h.title }), h.time ? el('span', { class: 'dim', text: 'iba a salir ' + h.time }) : null,
      el('span', { class: 'dim', text: h.stage === 'air' ? '(retenido tras grabarlo)' : '(retenido al prepararlo)' })),
    ...h.violations.map((v) => el('div', { class: 'comp bad' }, el('div', { text: v.es || v.rule }), el('details', {}, el('summary', { text: 'Mensaje del control' }), el('div', { text: v.message })))));
}
function counter(input, max) {
  const c = el('span', { class: 'count' });
  const upd = () => {
    const n = [...input.value].length;
    c.textContent = max ? n + ' / ' + max : n + ' caracteres';
    c.className = 'count' + (max && n > max ? ' over' : '');
  };
  input.addEventListener('input', upd);
  upd();
  return c;
}
function card(i) {
  const c = el('div', { class: 'card ' + i.status + (i.format === 'vertical' ? ' vertical' : '') });
  c.append(el('div', { class: 'row' },
    el('span', { class: 'badge', text: i.platformLabel }),
    i.format ? el('span', { class: 'badge', text: i.format === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9' }) : null,
    i.duration ? el('span', { class: 'dim', text: Math.round(i.duration) + ' s' }) : null,
    i.programme ? el('span', { class: 'dim', text: i.programme }) : null,
    i.sample ? el('span', { class: 'badge', text: 'Muestra para revisar' }) : null,
  ));
  if (i.has.video) {
    const v = el('video', { controls: '', preload: 'none', playsinline: '' });
    if (i.has.thumb) v.setAttribute('poster', '/media/' + i.id + '/thumb');
    v.append(el('source', { src: '/media/' + i.id + '/video', type: 'video/mp4' }));
    if (i.has.captions) v.append(el('track', { kind: 'captions', src: '/media/' + i.id + '/captions', srclang: 'en', label: 'English' }));
    c.append(el('div', { class: 'media' }, v));
  }
  const title = el('input', { class: 'title', value: i.title, 'aria-label': 'Título' });
  if (i.pack) c.append(packBox(i, title));
  c.append(el('label', { class: 'dim', text: 'Título' }), title, counter(title, i.titleMax));
  const text = el('textarea', { 'aria-label': 'Texto' });
  text.value = i.text;
  c.append(el('label', { class: 'dim', text: 'Texto de la publicación' }), text, counter(text, i.textMax));
  if (i.links.length) c.append(el('div', { class: 'dim' }, document.createTextNode('Enlaces: '), ...i.links.map((l, n) => el('span', {}, n ? document.createTextNode(' · ') : null, el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.label })))));
  const comp = el('div', { class: 'comp' + (i.compliance.ok ? '' : ' bad') });
  if (i.compliance.ok) comp.textContent = 'Cumplimiento: correcto' + (i.compliance.stub ? ' (control provisional)' : '') + (i.disclosure ? ' · etiqueta de IA puesta' : '');
  else comp.append(el('b', { text: i.compliance.recheck ? 'Retenido al revisarlo otra vez antes de publicar (algo cambió mientras esperaba):' : 'Retenido por cumplimiento:' }), ...i.compliance.violations.map((v) => el('div', {}, document.createTextNode('· ' + (v.es || v.message)), v.es ? el('div', { class: 'dim', text: v.message }) : null)));
  c.append(comp);
  if (i.schedule) c.append(el('div', { class: 'dim', text: 'Saldría el ' + i.schedule.day + ' a las ' + i.schedule.time + ' (' + i.schedule.tz + ')' }));
  const tt = i.tiktok && !S.manual ? tiktokBox(i) : null;
  if (tt) c.append(tt.box);
  if (S.manual && ['approved', 'scheduled'].includes(i.status)) c.append(handBox(i));
  if (i.result && i.result.manual) c.append(el('div', { class: 'comp' }, document.createTextNode('Publicado a mano' + (i.result.at ? ' el ' + new Date(i.result.at).toLocaleString('es-ES') : '') + (i.result.url ? ': ' : '.')), i.result.url ? el('a', { href: i.result.url, target: '_blank', rel: 'noopener noreferrer', text: i.result.url }) : null));
  if (S.manual && i.grave && S.settings.phase <= 1 && ['pending', 'approved'].includes(i.status)) c.append(el('div', { class: 'comp bad', text: 'Noticia grave: en la fase 1 no se publica nada grave.' }));
  if (i.has.contact) {
    const d = el('details', {}, el('summary', { text: 'Hoja de contactos (fotogramas)' }));
    d.addEventListener('toggle', () => {
      if (d.open && !d.querySelector('img')) d.append(el('img', { class: 'contact', src: '/media/' + i.id + '/contact', alt: 'Fotogramas del clip', onclick: (e) => window.open(e.target.src, '_blank') }));
    });
    c.append(d);
  }
  if (i.description) c.append(el('details', {}, el('summary', { text: 'Descripción completa' }), el('pre', { style: 'white-space:pre-wrap', text: i.description })));
  const done = ['published', 'publishing'].includes(i.status);
  const approve = el('button', { class: 'btn approve', text: 'Aprobar', onclick: () => act('approve', i, { title, text, tt }) });
  approve.disabled = done || !i.compliance.ok || i.status === 'approved' || i.status === 'scheduled';
  // (a direct TikTok post waits for the owner's privacy and consent: TikTok allows no default)
  if (tt && S.tiktokMode === 'direct') {
    const gate = () => { approve.disabled = done || !i.compliance.ok || i.status === 'approved' || i.status === 'scheduled' || !tt.ready(); };
    tt.box.addEventListener('change', gate);
    gate();
  }
  const sibs = S.items.filter((x) => x.group === i.group && x.id !== i.id && x.status === 'pending' && x.compliance.ok);
  const all = sibs.length && i.status === 'pending' ? el('button', { class: 'btn approve', text: 'Aprobar en ' + (sibs.length + 1) + ' redes', title: 'También: ' + sibs.map((x) => x.platformLabel).join(', '), onclick: () => act('approve', i, { title, text, tt }, true) }) : null;
  if (all) all.disabled = approve.disabled;
  const reject = el('button', { class: 'btn reject', text: 'Rechazar', onclick: () => act('reject', i) });
  reject.disabled = done || i.status === 'rejected';
  const save = el('button', { class: 'btn save', text: 'Guardar cambios', onclick: () => act('edit', i, { title, text, tt }) });
  save.disabled = done;
  if (sibs.length) c.append(el('div', { class: 'dim', text: (i.kind === 'text' ? 'El mismo texto' : i.kind === 'episode' ? 'El mismo programa' : 'El mismo clip') + ' espera también en: ' + sibs.map((x) => x.platformLabel).join(', ') }));
  c.append(el('div', { class: 'row' }, approve, all, reject, save));
  return c;
}
// the packaging (docs/publishing/thumbnails-titles.md): the three covers (A the story's picture, B the presenter, C the
// words) and the three titles; "Usar" puts a title in the title box (saved with the card)
const VARIANT_ES = ['A · la foto', 'B · el presentador', 'C · las palabras'];
function packBox(i, titleInput) {
  const box = el('div', { class: 'pack' });
  const tc = i.kind === 'episode' && i.platform === 'youtube';
  box.append(el('div', { class: 'dim', text: (i.format === 'vertical' ? 'Portadas' : 'Miniaturas') + ' y títulos' + (i.pack.writer === 'fallback' ? ' (redactor de reserva: sin IA)' : i.pack.writer === 'ai' ? ' (escritos por la IA y revisados)' : ' (IA y redactor de reserva, revisados)') }));
  if (i.has.covers) {
    const row = el('div', { class: 'covers' + (i.format === 'vertical' ? ' tall' : '') });
    for (let n = 0; n < i.has.covers; n++) row.append(el('figure', {}, el('img', { src: '/media/' + i.id + '/cover/' + n, alt: 'Portada ' + VARIANT_ES[n], loading: 'lazy' }), el('figcaption', { text: VARIANT_ES[n] + (i.pack.thumbs[n] ? ': «' + i.pack.thumbs[n] + '»' : '') })));
    box.append(row);
  }
  if (i.platform === 'youtube') {
    i.pack.titles.forEach((t, n) => {
      const use = el('button', { class: 'btn copy', text: 'Usar', onclick: () => { titleInput.value = t; titleInput.dispatchEvent(new Event('input')); } });
      box.append(el('div', { class: 'row' }, el('b', { text: 'ABC'[n] }), el('span', { text: t }), use));
    });
    box.append(el('div', { class: 'dim', text: tc ? 'YouTube «Probar y comparar» (YouTube Studio en el ordenador) prueba hasta 3 títulos y miniaturas y se queda con la que más tiempo de visionado consigue: sube las tres.' : 'Un Short no admite «Probar y comparar»: elige un título y una portada (la portada de un Short se sube en YouTube Studio en el ordenador).' }));
  } else if (i.pack.hook) box.append(el('div', { class: 'dim', text: 'Primera línea del texto: «AI-produced news: ' + i.pack.hook + '»' }));
  return box;
}
function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
  const t = el('textarea');
  t.value = value;
  document.body.append(t);
  t.select();
  document.execCommand('copy');
  t.remove();
  return Promise.resolve();
}
// hand publishing (the beta): prepare (the gate again, the signed files), download, copy, tick, "Ya lo he publicado"
function handBox(i) {
  const net = NET[i.platform] || i.platformLabel;
  const box = el('div', { class: 'hand' }, el('h3', { text: 'Publicar a mano en ' + net }));
  const m = i.manual;
  if (!m || !m.fresh) {
    box.append(el('div', { class: 'dim', text: 'Primero se revisa otra vez (cumplimiento, registro, fuentes) y se firma el archivo. Tarda unos segundos.' }));
    const b = el('button', { class: 'btn approve', text: 'Preparar para publicar', onclick: async () => {
      b.disabled = true;
      b.textContent = 'Revisando…';
      try {
        await post('/api/prepare', { id: i.id });
        toast('Listo para publicar');
      } catch (err) {
        toast('No se pudo: ' + err.message);
      }
      await load();
    } });
    box.append(el('div', { class: 'row' }, b));
    return box;
  }
  box.append(el('div', { class: 'dim', text: 'Revisado y firmado: pasa el control. ' + (m.devCert ? 'Firma C2PA de desarrollo (vale para la beta; para el lanzamiento hace falta un certificado reconocido).' : '') }));
  let step = 1;
  if (m.files.video || m.files.cover) {
    box.append(el('div', { class: 'row' },
      m.files.video ? el('a', { class: 'btn approve', href: '/download/' + i.id + '/video', download: '', text: (step++) + '. Descargar ' + (i.format === 'vertical' ? 'el vídeo vertical' : 'el vídeo horizontal') }) : null,
      m.files.cover ? el('a', { class: 'btn save', href: '/download/' + i.id + '/cover', download: '', text: m.files.cover2 ? 'Portada A' : 'Descargar la portada' }) : null,
      m.files.cover2 ? el('a', { class: 'btn save', href: '/download/' + i.id + '/cover2', download: '', text: 'Portada B' }) : null,
      m.files.cover3 ? el('a', { class: 'btn save', href: '/download/' + i.id + '/cover3', download: '', text: 'Portada C' }) : null));
  }
  box.append(el('div', { class: 'dim', text: (step++) + '. Copia y pega cada texto en ' + net + ':' }));
  for (const f of m.fields) {
    const n = [...f.value].length;
    box.append(el('div', { class: 'field' }, el('div', { class: 'row' }, el('b', { text: f.label }), el('span', { class: 'count', text: n + (f.max ? ' / ' + f.max : '') + ' caracteres' }), el('button', { class: 'btn copy', text: 'Copiar', onclick: async (e) => {
      try {
        await copyText(f.value);
        e.target.textContent = 'Copiado';
        setTimeout(() => (e.target.textContent = 'Copiar'), 1600);
      } catch {
        toast('No se pudo copiar: selecciona el texto a mano');
      }
    } })), el('pre', { text: f.value })));
  }
  if (m.files.cover) box.append(el('div', { class: 'dim', text: 'Portada: si ' + net + ' te deja poner una imagen, usa la portada descargada; si no, elige el primer fotograma.' }));
  box.append(el('div', { class: 'dim', text: (step++) + '. En ' + net + ', antes de publicar, marca cada cosa al hacerla:' }));
  const checks = m.checklist.map((c) => {
    const x = el('input', { type: 'checkbox', value: c.id });
    return { x, label: el('label', { class: 'opt' }, x, el('span', { text: c.text })) };
  });
  box.append(el('div', { class: 'checks' }, ...checks.map((c) => c.label)));
  const url = el('input', { class: 'title', placeholder: 'Dirección de la publicación (opcional), p. ej. https://…', 'aria-label': 'Dirección de la publicación' });
  const done = el('button', { class: 'btn done', text: 'Ya lo he publicado', onclick: async () => {
    try {
      await post('/api/published', { id: i.id, url: url.value.trim(), checks: checks.filter((c) => c.x.checked).map((c) => c.x.value) });
      toast('Apuntado: no se te ofrecerá otra vez');
      await load();
    } catch (err) {
      toast('No se pudo: ' + err.message);
    }
  } });
  const gate = () => { done.disabled = !checks.every((c) => c.x.checked); };
  for (const c of checks) c.x.addEventListener('change', gate);
  gate();
  box.append(el('div', { class: 'dim', text: (step++) + '. Cuando esté publicado, pega aquí su dirección si la tienes, y pulsa:' }), url, el('div', { class: 'row' }, done));
  return box;
}
function tiktokBox(i) {
  const t = i.tiktok;
  const box = el('fieldset', { class: 'tiktok' }, el('legend', { text: 'TikTok' }));
  box.append(el('div', { class: 'dim', text: S.tiktokMode === 'direct' ? 'Publicación directa: elige quién puede verlo (TikTok no deja un valor por defecto).' : 'Ahora el vídeo llega a tu bandeja de TikTok y allí eliges la privacidad. Lo que marques aquí se usará cuando TikTok apruebe la publicación directa.' }));
  const opts = [['PUBLIC_TO_EVERYONE', 'Todo el mundo'], ['MUTUAL_FOLLOW_FRIENDS', 'Amigos'], ['FOLLOWER_OF_CREATOR', 'Seguidores'], ['SELF_ONLY', 'Solo yo']];
  const radios = opts.map(([v, label]) => {
    const r = el('input', { type: 'radio', name: 'tt-' + i.id, value: v });
    if (t.privacy === v) r.checked = true;
    box.append(el('label', { class: 'opt' }, r, document.createTextNode(' ' + label)));
    return r;
  });
  box.append(el('div', { class: 'dim', text: 'TikTok dirá qué opciones admite tu cuenta. Mientras la app no esté auditada, todo sale como «Solo yo».' }));
  const check = (key, label) => {
    const x = el('input', { type: 'checkbox' });
    x.checked = !!t[key];
    box.append(el('label', { class: 'opt' }, x, document.createTextNode(' ' + label)));
    return x;
  };
  const comment = check('allowComment', 'Permitir comentarios');
  const duet = check('allowDuet', 'Permitir dúos');
  const stitch = check('allowStitch', 'Permitir stitch');
  const consent = check('consent', 'Acepto la confirmación de uso de música de TikTok (Music Usage Confirmation)');
  box.append(el('div', { class: 'dim', text: 'Contenido de marca: no (el canal no publica contenido pagado). Etiqueta «Generado con IA»: siempre puesta.' }));
  const value = () => ({ privacy: (radios.find((r) => r.checked) || {}).value || null, allowComment: comment.checked, allowDuet: duet.checked, allowStitch: stitch.checked, consent: consent.checked });
  const changed = () => JSON.stringify(value()) !== JSON.stringify({ privacy: t.privacy, allowComment: t.allowComment, allowDuet: t.allowDuet, allowStitch: t.allowStitch, consent: t.consent });
  return { box, value, changed, ready: () => !!value().privacy && consent.checked };
}
async function act(name, i, f, all = false) {
  try {
    if (f && (f.title.value !== i.title || f.text.value !== i.text)) await post('/api/edit', { id: i.id, title: f.title.value, text: f.text.value });
    if (f?.tt && f.tt.changed()) await post('/api/tiktok', { id: i.id, ...f.tt.value() });
    if (name === 'approve') await post('/api/approve', { id: i.id, all });
    if (name === 'reject') await post('/api/reject', { id: i.id, reason: prompt('¿Por qué? (opcional)') || '' });
    toast(name === 'approve' ? 'Aprobado' : name === 'reject' ? 'Rechazado' : 'Guardado');
    await load();
  } catch (err) {
    toast('No se pudo: ' + err.message);
  }
}
$('toggleSettings').addEventListener('click', () => $('settings').classList.toggle('open'));
$('saveSettings').addEventListener('click', async () => {
  const modes = {};
  for (const s of document.querySelectorAll('#modes select')) modes[s.dataset.platform] = s.value;
  try {
    S = await post('/api/settings', { modes, timezone: $('tz').value.trim() });
    toast('Ajustes guardados');
    render();
  } catch (err) {
    toast('No se pudo: ' + err.message);
  }
});
$('schedule').addEventListener('click', async () => {
  try {
    const r = await post('/api/schedule', {});
    S = r.state;
    toast(r.scheduled + ' programados');
    render();
  } catch (err) {
    toast('No se pudo: ' + err.message);
  }
});
load();
</script>
</body>
</html>`;
}
