// The publishing desk's door to the compliance desk (server/compliance/, contract: docs/publishing/compliance.md §8).
// The real module when it is installed; else the clearly marked stub (compliance-stub.js) with the same names. The
// stub is chosen ONLY when the module is not there at all: a real module that fails to load is an error, never a
// silent fallback to the stub.
//
//   disclosureFor(item), describe(item, o), textPost(item, o), creditsFor(item), auditItem(item), checkClip(clip, opts),
//   clipCards(o) what a clip's end card says,
//   preflight(item, opts), buildManifest(item, o), markFile(path, manifest) (async, never throws: { ok, ... })
//   register(dataDir) the compliance register (takedowns, reviews) or null; recordReview(itemId, review, o)
//   recordPublication(publication, o) one publication in the register (the owner's own, by hand: manual.js)
//   editorialLine(env) who answers for the channel, as the descriptions name it (null while it is not set)
//   storyReport(text, sources) the verbatim measure; archiveGetStory({ dataDir }) a story's sources with its article;
//   clipGetStory(storyIds, getStory) that, for the stories one clip tells only
//   sourcesForItem(item, fallback, cache) an item's own sources folder's getStory (gate.sourcesDir), else the fallback
//   storiesWithoutSources(item, getStory) the stories the verbatim rule cannot measure (preflight refuses the item)
//   usingStub   true while the stub stands in
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.join(HERE, '..', 'compliance', 'index.js');

async function load() {
  if (fs.existsSync(REAL)) return { mod: await import(pathToFileURL(REAL).href), stub: false };
  return { mod: await import('./compliance-stub.js'), stub: true };
}
const { mod, stub } = await load();

export const usingStub = stub;
export const complianceModule = mod;

export const disclosureFor = (item) => mod.disclosureFor(item);
export const creditsFor = (item) => mod.creditsFor(item);
/** Every asset an item puts on screen with its rights record ({ assets, missing, credits }); the stub knows none. */
export const auditItem = (item) => (mod.auditItem ? mod.auditItem(item) : { assets: [], missing: [], credits: [] });
export const checkClip = (clip, opts = {}) => mod.checkClip(clip, opts);
/** What a clip's own cards say (the AI notice over its first seconds, its end card): the gate's clip.cards. */
export const clipCards = (o = {}) => (mod.clipCards ? mod.clipCards(o) : null);
export const describe = (item, o = {}) => (mod.describe ? mod.describe(item, o) : [...mod.disclosureFor(item).description.lines, ...(o.credits?.length ? ['', 'Credits:', ...o.credits.map((c) => `· ${c}`)] : [])].join('\n'));
export const textPost = (item, o = {}) => (mod.textPost ? mod.textPost(item, o) : `AI-generated: ${item.text}`);
export const buildManifest = (item, o = {}) => (mod.buildManifest ? mod.buildManifest(item, o) : { title: o.title || null });
/** The verbatim measure of a text against its sources (the compliance desk's rule: runs of 12, a share of 20 %). */
export const storyReport = (text, sources, o = {}) => mod.storyReport(text, sources, o);
/**
 * The stories' sources as the archive keeps them, with the article where the article cache holds it (server/
 * articlecache.js, filled as the channel airs; the compliance desk's audit writes the same files):
 * getStory(id) -> { title, summary, body } or null. The stub has no cache: body is always null there.
 */
export const archiveGetStory = (o = {}) => (mod.archiveGetStory ? mod.archiveGetStory(o) : () => null);
/** The verbatim lint of an episode's stories (the stub has none: everything passes there, as before). */
export const lintEpisode = (episode, o = {}) => (mod.lintEpisode ? mod.lintEpisode(episode, o) : { ok: true, stories: [], violations: [] });
/**
 * The stories' sources for one queued item: its own folder's when it has one (`item.gate.sourcesDir`: the beta's news
 * day keeps the stories the AI writer told, with their articles, in a folder of its own, server/publish/newsday.js),
 * else `fallback` (the station's archive). `cache` keeps one reader a folder for a round.
 */
export function sourcesForItem(item, fallback, cache = null) {
  const dir = item?.gate?.sourcesDir;
  if (!dir || typeof dir !== 'string') return fallback;
  if (cache?.has(dir)) return cache.get(dir);
  const getStory = archiveGetStory({ dataDir: dir });
  cache?.set(dir, getStory);
  return getStory;
}

/**
 * The gate's getStory for one clip or post: the sources of the stories it tells only (a clip's episode tells others it
 * does not carry). preflight's verbatim lint then measures the clip's own aired words against their sources.
 */
export function clipGetStory(storyIds, getStory) {
  const ids = new Set((storyIds || []).filter(Boolean));
  return (id) => (ids.has(id) && typeof getStory === 'function' ? getStory(id) : null);
}

/**
 * The stories an item tells as stories whose sources are not at hand (getStory gives no title or summary): the verbatim
 * rule cannot measure their words, so the item is not published (publishing round 6: a FULL TIME edition replayed from
 * a sport snapshot told stories the archive never kept, and the lint let them through as "unverified"). A text post
 * carries its own sources (sourceTexts) and is not concerned.
 */
export function storiesWithoutSources(item, getStory) {
  if (!item?.episode || typeof getStory !== 'function') return [];
  const told = new Set((item.episode.segments || []).filter((s) => s.type === 'story' && s.storyId).map((s) => s.storyId));
  // a clip: the stories it tells (none listed, none checked here); a whole programme: every story it tells
  const listed = Array.isArray(item.storyIds) ? item.storyIds.filter(Boolean) : [];
  const ids = listed.length || item.kind === 'clip' || item.kind === 'short' ? listed : [...told];
  return [...new Set(ids)].filter((id) => told.has(id)).filter((id) => {
    const s = getStory(id);
    return !s || !(String(s.title || '').trim() || String(s.summary || '').trim());
  });
}

/** The publish-time gate: preflight when the module has it, else checkClip (video) or the text prefix rule. */
export function preflight(item, opts = {}) {
  const kind = item.kind || (item.episode ? 'episode' : 'text');
  let r;
  if (mod.preflight) r = mod.preflight(item, opts);
  else if (['live', 'episode', 'clip', 'short'].includes(kind)) r = mod.checkClip({ ...item, kind }, opts);
  else {
    const ok = /^AI-generated:/.test(String(item.text || '').trim());
    r = { ok, violations: ok ? [] : [{ rule: 'text-disclosure-missing', message: 'a text post starts with "AI-generated:"' }], warnings: [] };
  }
  // the verbatim rule fails closed: a story whose sources are not at hand cannot be shown not to copy them
  const blind = kind === 'text' || kind === 'live' ? [] : storiesWithoutSources(item, opts.getStory);
  if (!blind.length) return r;
  const extra = blind.map((id) => ({ rule: 'sources-missing', message: `story ${id}: its sources are not at hand, so its words cannot be checked against them`, storyId: id }));
  return { ...r, ok: false, violations: [...(r?.violations || []), ...extra] };
}

/** C2PA marking; never throws (the real module throws when a file cannot be marked: an unmarked file is not published). */
export async function markFile(file, manifest, opts = {}) {
  try {
    const r = await mod.markFile(file, manifest, opts);
    return r && typeof r === 'object' ? r : { ok: false, reason: 'no answer' };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

/** The compliance register (the real module's: takedowns, people not to re-stage, the owner's reviews), or null. */
export function register(dataDir = null) {
  try {
    return mod.sharedRegister ? mod.sharedRegister(dataDir) : null;
  } catch {
    return null;
  }
}

/**
 * The owner's review of an item, kept in the register (the real module's checkClip refuses an item with a recreation
 * until it is there). { by, verdict: 'approve'|'reject', checks, note }. -> { ok, stub }
 */
export function recordReview(itemId, review = {}, { dataDir = null } = {}) {
  const reg = register(dataDir);
  if (!reg?.recordReview) return { ok: false, stub: true };
  try {
    reg.recordReview(itemId, { by: review.by || 'owner', verdict: review.verdict || 'approve', checks: review.checks || {}, note: review.note || '' });
    return { ok: true, stub: false };
  } catch (err) {
    return { ok: false, stub: false, reason: String(err?.message || err) };
  }
}

/**
 * One publication in the register (where everything was published: the takedown workflow finds it there, compliance.md
 * §7). { itemId, parentId, kind, platform, remoteId, url, programId, storyIds, outlets, recreations, flags, manifest }
 * -> { ok, stub, reason }
 */
export function recordPublication(publication = {}, { dataDir = null } = {}) {
  const reg = register(dataDir);
  if (!reg?.recordPublication) return { ok: false, stub: true, reason: 'no compliance register (the stub stands in)' };
  try {
    reg.recordPublication(publication);
    return { ok: true, stub: false };
  } catch (err) {
    return { ok: false, stub: false, reason: String(err?.message || err) };
  }
}

/** "Editorial responsibility and complaints: …", as describe() writes it, or null while EDITORIAL_CONTACT is not set. */
export function editorialLine(env = process.env) {
  const who = mod.editorialContact ? mod.editorialContact(env) : String(env.EDITORIAL_CONTACT || '').trim() ? { name: String(env.EDITORIAL_RESPONSIBLE || '').trim() || null, contact: String(env.EDITORIAL_CONTACT).trim() } : null;
  return who ? `Editorial responsibility and complaints: ${who.name ? `${who.name}, ` : ''}${who.contact}` : null;
}
