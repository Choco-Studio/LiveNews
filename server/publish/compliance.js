// The publishing desk's door to the compliance desk (server/compliance/, contract: docs/publishing/compliance.md §8).
// The real module when it is installed; else the clearly marked stub (compliance-stub.js) with the same names. The
// stub is chosen ONLY when the module is not there at all: a real module that fails to load is an error, never a
// silent fallback to the stub.
//
//   disclosureFor(item), describe(item, o), textPost(item, o), creditsFor(item), checkClip(clip, opts),
//   preflight(item, opts), buildManifest(item, o), markFile(path, manifest) (async, never throws: { ok, ... })
//   register(dataDir) the compliance register (takedowns, reviews) or null; recordReview(itemId, review, o)
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
export const checkClip = (clip, opts = {}) => mod.checkClip(clip, opts);
export const describe = (item, o = {}) => (mod.describe ? mod.describe(item, o) : [...mod.disclosureFor(item).description.lines, ...(o.credits?.length ? ['', 'Credits:', ...o.credits.map((c) => `· ${c}`)] : [])].join('\n'));
export const textPost = (item, o = {}) => (mod.textPost ? mod.textPost(item, o) : `AI-generated: ${item.text}`);
export const buildManifest = (item, o = {}) => (mod.buildManifest ? mod.buildManifest(item, o) : { title: o.title || null });

/** The publish-time gate: preflight when the module has it, else checkClip (video) or the text prefix rule. */
export function preflight(item, opts = {}) {
  if (mod.preflight) return mod.preflight(item, opts);
  const kind = item.kind || (item.episode ? 'episode' : 'text');
  if (['live', 'episode', 'clip', 'short'].includes(kind)) return mod.checkClip({ ...item, kind }, opts);
  const ok = /^AI-generated:/.test(String(item.text || '').trim());
  return { ok, violations: ok ? [] : [{ rule: 'text-disclosure-missing', message: 'a text post starts with "AI-generated:"' }], warnings: [] };
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
