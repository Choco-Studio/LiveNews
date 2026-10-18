// Hand publishing: the beta (PUBLISH_MODE=manual, mode.js; the owner's guide: docs/publishing/beta.md; pipeline.md §8).
//
// The networks' API audits take days or weeks (unaudited YouTube API uploads are locked private; TikTok's Content
// Posting API posts privately until audited), so the beta is published by hand. For each approved item the approval
// page hands the owner, after the compliance gate has passed it again:
//   - the file to upload: the clip with its C2PA manifest signed into a copy beside it, and its cover, signed too
//     (an unmarked file is never published, by hand or by API: pipeline.md §4);
//   - the words to paste, per network, exactly as the gate measured them: the title, the description with the AI
//     disclosure first and the credits, the hashtags; a text post's text and its article's link;
//   - the network's own switches to set by hand (the AI label, the audience, the privacy), as a checklist he ticks;
// and when he says "Ya lo he publicado" (with the post's address, if he has it), the queue, the ledger and the
// compliance register record it, so the same item is never offered again (and a takedown finds it: compliance.md §7).
//
//   checklistFor(item)                     the switches to set by hand on its network: [{ id, text }]
//   manualTexts(item, { env })             { fields: [{ id, label, value, max }], gateText }: what the owner pastes
//   dailyPick(queue, { now, phase })       the day's review (plan.md Phase 1: about 15 minutes) -> { ids, caps }
//   prepareManual(queue, id, opts)         the gate again, the signed files, the texts -> { ok, item, held, ... }
//   recordManual(queue, id, { url, checks, ... })  published by hand: queue, ledger, register -> { ok, item, ... }
//   urlFits(platform, url)                 is this the address of a post on that network?
import fs from 'node:fs';
import path from 'node:path';
import * as compliance from './compliance.js';
import { gateView } from './publisher.js';
import { makeAdapter } from './adapters/index.js';
import { PLATFORMS, DAILY } from './platforms.js';
import { localParts } from './queue.js';
import { CLIP_MIN_SECONDS } from './moments.js';
import { CLIP_DISCLOSURE } from './clipmeta.js';

/** A package the gate passed is handed out for this long; after it, it is checked (and signed) again. */
export const PREPARED_TTL = 6 * 3600_000;
/** Text posts by hand in the beta (Phase 1 has none): at most this many a network a day. */
export const BETA_POSTS_PER_DAY = 2;
const OFFERED = ['pending', 'approved', 'scheduled'];

// The networks' own switches, in the owner's words. Where a network's own wording is quoted, it is the wording of the
// pages in docs/publishing/compliance.md §2.5–2.7 (YouTube "altered or synthetic content" and "made for kids"; TikTok
// "AI-generated content"; Meta "AI info"): the apps' Spanish labels were not read for this, so each switch is
// described by what it does, with the network's own English name beside it.
const CHECK = {
  file: { id: 'file', text: 'Subes el vídeo descargado de aquí (lleva dentro la firma de procedencia C2PA), no otro.' },
  ytTexts: { id: 'texts', text: 'Pegas el título, la descripción y los hashtags tal cual.' },
  capTexts: { id: 'texts', text: 'Pegas la descripción y los hashtags tal cual.' },
  // the network's own AI label (since 18 Oct what a clip's viewer sees first, beside the player: compliance.md §3.2): required
  synthetic: { id: 'synthetic', ai: true, text: 'Obligatorio: contenido alterado o sintético («altered or synthetic content»): marcas Sí.' },
  kids: { id: 'kids', text: 'Público («made for kids»): marcas que no es contenido para niños.' },
  thumb: { id: 'thumb', text: 'Miniatura: subes la portada descargada.' },
  aigc: { id: 'aigc', ai: true, text: 'Obligatorio: activas la etiqueta de contenido generado por IA («AI-generated content»).' },
  privacy: { id: 'privacy', text: 'Privacidad (quién puede verlo): la eliges tú. Para la beta, todo el mundo.' },
  branded: { id: 'branded', text: 'Contenido de marca o promocional: desactivado (el canal no publica contenido pagado).' },
  aiinfo: { id: 'aiinfo', ai: true, text: 'Obligatorio: activas la etiqueta de IA («AI info»), la opción que dice que el contenido está hecho con IA.' },
  fbLabel: { id: 'aiinfo', ai: true, text: 'Obligatorio: pones a mano la etiqueta de IA («AI info»): Facebook y Threads no la ponen solos.' },
  postText: { id: 'texts', text: 'Pegas el texto tal cual: empieza por «AI-generated:», y eso no se quita.' },
  linkIn: { id: 'link', text: 'El enlace al artículo del medio va en el texto: compruebas que sale.' },
  linkCard: { id: 'link', text: 'Pegas también el enlace del artículo, para que salga su tarjeta.' },
  linkBelow: { id: 'link', text: 'Pegas también el enlace del artículo, debajo del texto.' },
};

/**
 * The switches to set by hand for an item on its network (all of them ticked before it is recorded as published). A
 * video's first after the file is the network's own AI label (`ai: true`): the platform shows it beside the player
 * from the clip's first second, and the gate holds a video without it.
 */
export function checklistFor(item) {
  const net = item?.platform;
  if (item?.kind === 'text') return [CHECK.postText, net === 'bluesky' || net === 'threads' ? CHECK.linkCard : net === 'telegram' ? CHECK.linkBelow : CHECK.linkIn];
  const label = AI_LABEL[net] || null;
  const list = [CHECK.file, ...(label ? [label] : []), net === 'youtube' ? CHECK.ytTexts : CHECK.capTexts];
  if (net === 'youtube') list.push(CHECK.kids, ...(item.kind === 'episode' && item.media?.thumb ? [CHECK.thumb] : []));
  else if (net === 'tiktok') list.push(CHECK.privacy, CHECK.branded);
  return list;
}
/** Each network's own AI label, as the owner sets it (the gate holds a video without it: compliance.md §3.2). */
export const AI_LABEL = Object.freeze({ youtube: CHECK.synthetic, tiktok: CHECK.aigc, instagram: CHECK.aiinfo, facebook: CHECK.fbLabel, threads: CHECK.fbLabel });
/** The networks whose AI label has no API field: the owner sets it by hand, and its tick is required to record it. */
const HAND_LABEL = new Set(['facebook', 'threads']);

// a clip's caption (clipmeta.js): its disclosure sentence, which goes first (compliance.md §1: "the caption's first line");
// a caption written before 18 Oct carries the older sentence, which gives way to it
const OLD_DISCLOSURE = 'Presenters are AI-generated characters with synthetic voices; every fact is from the named source.';
const CONTACT_LINE = /^Editorial responsibility and complaints:.*$/m;

/** The credits a description lists ("Credits:" then "· …" lines: compliance.describe). */
export function creditsOf(description) {
  const lines = String(description || '').split('\n');
  const at = lines.findIndex((l) => l.trim() === 'Credits:');
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (!/^·\s/.test(l)) break;
    out.push(l.replace(/^·\s+/, '').trim());
  }
  return out;
}

const hashtagsOf = (item) => [...new Set((item.hashtags || []).map((t) => `#${String(t).replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((t) => t.length > 1))].join(' ');

/**
 * What the owner pastes on the item's network, field by field, and the words the gate measures (`gateText`: what a
 * reader sees in the post or under the video). A description names who answers for the channel as it is set now.
 */
export function manualTexts(item, { env = process.env } = {}) {
  const net = item.platform;
  const p = PLATFORMS[net] || {};
  const line = compliance.editorialLine(env);
  const withContact = (s) => (line && CONTACT_LINE.test(s) ? s.replace(CONTACT_LINE, line) : s);
  if (item.kind === 'text') {
    // (as the network shows it; Telegram's message without its markup leaves stray spaces: tidied, the words unchanged)
    const shown = makeAdapter(net, { env: {}, dryRun: true }).postText(item).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const link = (item.links || []).map((l) => l?.url).find((u) => /^https?:\/\//.test(String(u || ''))) || null;
    // Telegram's message shows its links as labels (adapters/telegram.js): by hand, the article's address goes under it
    const text = net === 'telegram' && link && !shown.includes(link) ? `${shown}\n\n${link}` : shown;
    const fields = [{ id: 'text', label: 'Texto', value: text, max: p.text?.post || p.text?.message || null }];
    if (link) fields.push({ id: 'link', label: 'Enlace del artículo', value: link, max: null });
    return { fields, gateText: text };
  }
  const hashtags = hashtagsOf(item);
  if (net === 'youtube') {
    const description = withContact(String(item.kind === 'clip' ? item.text || item.description || '' : item.description || item.text || ''));
    return {
      fields: [
        { id: 'title', label: 'Título', value: String(item.title || ''), max: p.text?.title || 100 },
        { id: 'description', label: 'Descripción', value: description, max: p.text?.description || 5000 },
        ...(hashtags ? [{ id: 'hashtags', label: 'Hashtags', value: hashtags, max: null }] : []),
      ],
      gateText: description,
    };
  }
  // TikTok, Instagram, Facebook: the caption, the AI disclosure first, then the credits (the description's)
  let caption = String(item.text || '').trim();
  for (const d of [OLD_DISCLOSURE, CLIP_DISCLOSURE]) {
    if (caption.startsWith(d) && d !== CLIP_DISCLOSURE) caption = caption.slice(d.length).trim();
    if (caption.endsWith(d)) caption = caption.slice(0, -d.length).trim();
  }
  if (!caption.startsWith(CLIP_DISCLOSURE)) caption = `${CLIP_DISCLOSURE}\n\n${caption}`;
  const credits = creditsOf(item.description);
  if (credits.length) caption += `\n\nCredits: ${credits.join(' · ')}`;
  const max = p.text?.title || p.text?.caption || p.text?.message || 2200;
  return {
    fields: [{ id: 'description', label: 'Descripción', value: caption.slice(0, max), max }, ...(hashtags ? [{ id: 'hashtags', label: 'Hashtags', value: hashtags, max: null }] : [])],
    gateText: caption.slice(0, max),
  };
}

const kindOf = (it) => (it.kind === 'text' ? 'text' : it.kind === 'episode' ? 'episode' : 'video');

/** The day's cap of hand publications per network and kind (plan.md: the lower end of the phase's daily range). */
export function dayCap(platform, kind, phase = 1) {
  const d = DAILY[phase]?.[platform] || {};
  if (kind === 'text') return d.posts ? d.posts[0] : BETA_POSTS_PER_DAY;
  if (kind === 'episode') return d.uploads ? d.uploads[0] : 0;
  return d.clips ? d.clips[0] : 0;
}

/**
 * The day's review in the beta (plan.md Phase 1: about 15 minutes): per network, its best waiting items, up to the
 * lower end of the phase's daily range less what was already published there today (in its time zone); never a
 * compliance refusal, never anything grave in Phase 1, never a clip under 10 s, never what the ledger already holds.
 * -> { ids: [item ids], caps: { [platform]: { [kind]: { cap, done } } } }
 */
export function dailyPick(queue, { now = Date.now(), phase = queue.settings().phase } = {}) {
  const ledger = queue.ledger(false);
  // (a clip under the 10-second floor, queued before the floor, is not offered either: moments.js CLIP_MIN_SECONDS)
  const items = queue.list({ status: OFFERED }).filter((it) => it.compliance?.ok !== false && !(phase <= 1 && it.grave) && !(it.kind === 'clip' && Number(it.media?.duration) < CLIP_MIN_SECONDS) && !queue.published(it.key) && !queue.nearDuplicate(it));
  const caps = {};
  const ids = [];
  const nets = [...new Set(items.map((it) => it.platform))];
  for (const net of nets) {
    const tz = queue.tzOf(net);
    const today = localParts(now, tz).day;
    for (const kind of ['video', 'episode', 'text']) {
      const mine = items.filter((it) => it.platform === net && kindOf(it) === kind);
      if (!mine.length) continue;
      const cap = dayCap(net, kind, phase);
      const done = ledger.filter((e) => e.platform === net && (e.kind === 'text' ? 'text' : e.kind === 'episode' ? 'episode' : 'video') === kind && localParts(e.at, tz).day === today).length;
      (caps[net] ||= {})[kind] = { cap, done };
      mine.sort((a, b) => (b.status === 'approved') - (a.status === 'approved') || (b.priority || 0) - (a.priority || 0) || (b.score || 0) - (a.score || 0) || (a.createdAt || 0) - (b.createdAt || 0));
      ids.push(...mine.slice(0, Math.max(0, cap - done)).map((it) => it.id));
    }
  }
  return { ids, caps };
}

/** Is `url` the address of a post on `platform` (https, the network's own host)? */
const HOSTS = { youtube: ['youtube.com', 'youtu.be'], tiktok: ['tiktok.com'], instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.watch'], x: ['x.com', 'twitter.com'], threads: ['threads.net', 'threads.com'], bluesky: ['bsky.app'], telegram: ['t.me'] };
export function urlFits(platform, url) {
  try {
    const u = new URL(String(url));
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (HOSTS[platform] || []).some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const fresh = (it, now) => !!it?.manual?.ok && now - (it.manual.preparedAt || 0) <= PREPARED_TTL;
export const isPrepared = fresh;

/** The signed copy of one of an item's files, beside it, named for the item (`<name>.<item id>.c2pa.<ext>`). */
const signedPath = (file, id) => file.replace(/(\.[a-z0-9]+)$/i, `.${id}.c2pa$1`);

/**
 * Before the owner downloads and pastes: the item must be approved; it is measured by the compliance gate again, as it
 * will go out (the words he will paste, the files he will upload, signed with their C2PA manifest and read back by the
 * gate, the register and the stories' sources as they are now). What no longer passes is held, as the re-check holds it
 * (recheck.js: it goes back to the owner if it passes again). -> { ok, item, held, violations, error, message }
 */
export async function prepareManual(queue, id, { dataDir = null, now = Date.now(), env = process.env, gate = compliance.preflight, mark = compliance.markFile, getStory = null, register = undefined } = {}) {
  const it = queue.get(id);
  if (!it) return { ok: false, status: 404, error: 'no such item', message: 'No existe.' };
  if (!OFFERED.includes(it.status) || it.status === 'pending') return { ok: false, status: 409, error: 'not approved', message: it.status === 'published' ? 'Ya está publicado.' : 'Primero apruébalo.' };
  if (it.compliance && it.compliance.ok === false) return { ok: false, status: 409, error: 'compliance', message: 'Está retenido por cumplimiento.' };
  if (queue.settings().phase <= 1 && it.grave) return { ok: false, status: 409, error: 'grave', message: 'En la fase 1 no se publica nada grave.' };
  if (queue.published(it.key) || queue.nearDuplicate(it)) {
    it.status = 'duplicate';
    queue.save(queue.note(it, 'duplicate', 'desk', { reason: 'already published to this network' }));
    return { ok: false, status: 409, error: 'duplicate', message: 'Esto ya se publicó en esta red: no se ofrece otra vez.' };
  }
  const texts = manualTexts(it, { env });
  // the files he will upload: signed copies (the clip itself keeps its hash, its identity in the ledger)
  const files = {};
  const marks = {};
  const manifest = compliance.buildManifest({ kind: it.kind === 'clip' && it.format === 'vertical' ? 'short' : it.kind, episode: null, platforms: [it.platform] }, { title: it.title, sources: (it.links || []).map((l) => l.url).filter(Boolean), credits: creditsOf(it.description), format: it.format });
  for (const [kind, src] of [['video', it.media?.video], ['cover', it.media?.thumb]]) {
    if (!src) continue;
    const out = signedPath(src, it.id);
    const m = fs.existsSync(src) ? await mark(src, manifest, { output: out, dataDir }) : { ok: false, reason: `no file ${src}` };
    marks[kind] = { ok: !!m.ok, devCert: !!m.devCert, timestamped: !!m.timestamped, reason: m.reason || null };
    // (an unsigned copy is not handed out: the gate below then refuses it, `unmarked`)
    files[kind] = m.ok ? m.path || out : out;
  }
  const sources = getStory || compliance.sourcesForItem(it, compliance.archiveGetStory({ dataDir }));
  const view = { ...gateView(it, { now }), text: texts.gateText, files: Object.values(files) };
  // a network with no API field for the AI label: the owner sets Meta's "AI info" by hand, and the publication cannot be
  // recorded until he has ticked it (recordManual: the checklist), so the gate counts it as set
  if (it.kind !== 'text' && HAND_LABEL.has(it.platform)) view.flags = { ...view.flags, [it.platform]: { ...(view.flags?.[it.platform] || {}), manualLabel: true } };
  const g = gate(view, { now, register: register === undefined ? compliance.register(dataDir) : register, getStory: compliance.clipGetStory(it.source?.storyIds, sources), env });
  const violations = [...(g.violations || [])];
  for (const [kind, m] of Object.entries(marks)) if (!m.ok && !violations.some((v) => v.rule === 'unmarked' || v.rule === 'file-missing')) violations.push({ rule: 'unmarked', message: `the ${kind} could not be signed: ${m.reason || 'no answer'}` });
  const ok = !!g.ok && violations.length === 0;
  const verdict = { ok, violations, warnings: g.warnings || [], stub: !!compliance.usingStub, checkedAt: now, recheck: true };
  if (!ok) {
    const was = it.status;
    it.status = 'held';
    it.schedule = null;
    it.compliance = verdict;
    it.manual = null;
    queue.save(queue.note(it, 'held', 'recheck', { was, rules: [...new Set(violations.map((v) => v.rule))], manual: true }));
    for (const f of Object.values(files)) if (/\.c2pa\.[a-z0-9]+$/i.test(f)) fs.rmSync(f, { force: true });
    return { ok: false, status: 409, held: true, item: it, violations, error: 'held', message: 'Al revisarlo otra vez no pasa el control: queda retenido.' };
  }
  it.compliance = verdict;
  it.manual = { ok: true, preparedAt: now, files, marks, devCert: Object.values(marks).some((m) => m.devCert), fields: texts.fields, checklist: checklistFor(it), recreations: g.recreations || [], flags: view.flags };
  queue.save(queue.note(it, 'prepared by hand', 'owner', { files: Object.keys(files) }));
  return { ok: true, item: it };
}

/**
 * The owner has published it by hand: every switch of its checklist ticked, the post's address if he has it (on the
 * network's own host). The queue (published, never offered again), the ledger (the real one: nothing twice) and the
 * compliance register (where it was published: a takedown finds it). -> { ok, item, register, status, error, message }
 */
export function recordManual(queue, id, { url = '', checks = [], dataDir = null, now = Date.now() } = {}) {
  const it = queue.get(id);
  if (!it) return { ok: false, status: 404, error: 'no such item', message: 'No existe.' };
  if (it.status === 'published') return { ok: false, status: 409, error: 'published', message: 'Ya estaba apuntado como publicado.' };
  if (!['approved', 'scheduled'].includes(it.status)) return { ok: false, status: 409, error: 'not approved', message: 'Solo se apunta lo aprobado.' };
  if (!fresh(it, now)) return { ok: false, status: 409, error: 'not prepared', message: 'Prepáralo otra vez: se vuelve a revisar antes de publicar.' };
  const ticked = new Set((Array.isArray(checks) ? checks : []).map(String));
  const missing = checklistFor(it).filter((c) => !ticked.has(c.id));
  if (missing.length) return { ok: false, status: 400, error: 'checklist', message: `Falta marcar: ${missing.map((c) => c.text).join(' · ')}` };
  const address = String(url || '').trim();
  if (address && !urlFits(it.platform, address)) return { ok: false, status: 400, error: 'url', message: `Esa dirección no es de ${PLATFORMS[it.platform]?.name || it.platform}. Déjala vacía si no la tienes.` };
  if (queue.published(it.key) || queue.nearDuplicate(it)) return { ok: false, status: 409, error: 'duplicate', message: 'El registro ya tiene esto publicado en esta red.' };
  it.status = 'published';
  it.schedule = null;
  it.result = { manual: true, url: address || null, remoteId: null, dryRun: false, at: now };
  queue.record(it, { url: address || null, remoteId: null }, { dry: false });
  queue.note(it, 'published by hand', 'owner', { url: address || null, checks: [...ticked] });
  const reg = compliance.recordPublication({
    itemId: it.id,
    kind: it.kind === 'text' ? 'text' : it.kind === 'episode' ? 'episode' : it.format === 'vertical' ? 'short' : 'clip',
    platform: it.platform,
    remoteId: null,
    url: address || null,
    programId: it.source?.programId || null,
    storyIds: it.source?.storyIds || [],
    outlets: [...new Set((it.links || []).map((l) => l.label).filter(Boolean))],
    recreations: it.manual?.recreations || [],
    flags: { manual: true, checks: [...ticked], ...(it.manual?.flags || {}) },
    manifest: it.manual?.files ? { c2pa: true, devCert: !!it.manual.devCert, files: Object.values(it.manual.files).map((f) => path.basename(f)) } : null,
  }, { dataDir });
  queue.save(queue.note(it, reg.ok ? 'register: publication recorded' : 'register: not recorded', 'desk', reg.ok ? {} : { reason: reg.reason }));
  return { ok: true, item: it, register: reg };
}
