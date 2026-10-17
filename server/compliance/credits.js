// Credits and rights (docs/publishing/compliance.md §6): every non-original asset that reaches air or a published
// file carries a rights record (server/compliance/rights.json) and is credited as its licence asks.
//
//   loadRights()                       the register of asset classes and repository files
//   fileClass(relPath, rights)         the class of a file in the repository, or null (no record: the test fails)
//   scanRepoAssets(root)               every asset file in the repository with its class
//   auditItem(item)                    -> { assets: [{ kind, class, credit, ok, reason, where }], missing, credits }
//   creditsFor(item)                   the description's credit lines (credits.js is what describe() lists)
//   rightsGate(episode, { mode })      the producer's assets stage: 'report' counts what has no record, 'strict' also
//                                      takes it off air (a picture goes, the story keeps its map or card)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
let RIGHTS = null;

export function loadRights() {
  if (!RIGHTS) RIGHTS = JSON.parse(fs.readFileSync(path.join(HERE, 'rights.json'), 'utf8'));
  return RIGHTS;
}

const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);

/** The class of a repository file (a path relative to the root), from rights.json's `files`; null when it has none. */
export function fileClass(rel, rights = loadRights()) {
  const p = String(rel).split(path.sep).join('/');
  for (const f of rights.files) if (globRe(f.glob).test(p)) return f.class;
  return null;
}

// What counts as an asset in the repository: media, fonts, models, data files and data written as code.
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|webm|mp4|mov|ogg|oga|wav|mp3|m4a|flac|ttf|otf|woff2?|bin|onnx|xml|json|geojson|csv|tsv)$/i;
const DATA_JS = /(^|\/)(worlddata|[a-z-]*data)\.js$/i;
const SKIP_DIR = new Set(['node_modules', '.git', 'data', '.claude']);

/** Every asset file under the repository (media, fonts, models, data), with its class (null: no rights record). */
export function scanRepoAssets(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else {
        const rel = path.relative(root, abs).split(path.sep).join('/');
        if (rel === 'package.json' || rel === 'package-lock.json') continue;
        if (ASSET_EXT.test(rel) || DATA_JS.test(rel)) out.push({ path: rel, class: fileClass(rel) });
      }
    }
  };
  walk(root);
  return out;
}

const FREE = /\b(cc0|public domain|pd|cc[ -]?by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?)\b/i;
let FIXTURE_OUTLETS = null;
function fixtureOutlets() {
  if (!FIXTURE_OUTLETS) {
    try {
      FIXTURE_OUTLETS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'feeds.fixture.json'), 'utf8')).map((f) => f.name));
    } catch {
      FIXTURE_OUTLETS = new Set();
    }
  }
  return FIXTURE_OUTLETS;
}

/** A picture's rights record: the picture pipeline's own (imageRights), a free FILE licence, or a fixture's. */
function pictureRecord(seg) {
  const r = seg.imageRights;
  if (r && r.licence && (r.credit || r.author || r.source)) return { ok: true, class: 'picture', credit: `${r.credit || r.author || r.source}${r.licence ? ` (${r.licence})` : ''}` };
  const credit = String(seg.imageCredit || '');
  const file = /^FILE\s*·\s*([^·]+)·\s*(.+)$/i.exec(credit);
  if (file && FREE.test(file[2])) return { ok: true, class: 'picture', credit: `${file[1].trim()} (${file[2].trim()}, Wikimedia Commons)` };
  const outlet = seg.outlet || seg.source || '';
  if (fixtureOutlets().has(outlet) || fixtureOutlets().has(credit)) return { ok: true, class: 'fixture-art', credit: null, publish: false };
  return { ok: false, class: 'picture', credit: credit || null, reason: credit ? `a picture credited "${credit}" has no licence on record (an outlet's photo is not cleared for our use)` : 'a picture with no credit and no licence' };
}

function footageRecord(f) {
  const credit = String(f?.credit || '');
  const m = /^FILE\s*·\s*([^·]+)·\s*(.+)$/i.exec(credit);
  if (m && FREE.test(m[2])) return { ok: true, class: 'commons-footage', credit: `${m[1].trim()} (${m[2].trim()}, Wikimedia Commons)` };
  return { ok: false, class: 'commons-footage', credit: credit || null, reason: `footage credited "${credit || 'nothing'}" has no free licence on record` };
}

/**
 * Every asset an item puts on screen or in its file, with its rights record. `item` = { episode } (or an episode).
 * -> { assets, missing: [assets without a record], credits: [description lines] }
 */
export function auditItem(item) {
  const rights = loadRights();
  const episode = item?.episode || item || {};
  const segs = Array.isArray(episode.segments) ? episode.segments : [];
  const items = [...segs, ...(Array.isArray(episode.rundown) ? episode.rundown : [])];
  const assets = [];
  const add = (a) => assets.push(a);
  const cls = (name) => rights.classes[name] || null;
  // always: the channel's own drawing, music and voices
  add({ kind: 'graphics', class: 'channel-original', ok: !!cls('channel-original'), credit: null });
  add({ kind: 'music', class: 'channel-music', ok: !!cls('channel-music'), credit: null });
  add({ kind: 'voices', class: 'synthetic-voices', ok: !!cls('synthetic-voices'), credit: cls('synthetic-voices')?.credit || null });
  const outlets = new Set();
  let maps = false;
  for (const [i, seg] of items.entries()) {
    const where = i < segs.length ? `segment ${i}` : `rundown ${i - segs.length}`;
    const outlet = seg.outlet || seg.source;
    if (seg.storyId && outlet) outlets.add(String(outlet).replace(/\s*\/\s*Photo:.*$/i, ''));
    if (seg.location || seg.map || (seg.visuals || []).some?.((v) => v?.kind === 'map')) maps = true;
    if (seg.hasImage) add({ kind: 'picture', where, storyId: seg.storyId || null, ...pictureRecord(seg) });
    if (seg.footage) add({ kind: 'footage', where, storyId: seg.storyId || null, ...footageRecord(seg.footage) });
  }
  if (maps) add({ kind: 'map', class: 'natural-earth', ok: !!cls('natural-earth'), credit: cls('natural-earth')?.credit || null });
  for (const o of outlets) add({ kind: 'reporting', class: 'news-reporting', ok: true, credit: o });
  const weather = episode.weather;
  if (weather) {
    const src = String(weather.source || weather.report?.source || '');
    const demo = !!weather.demo || /DEMO/.test(src);
    add({ kind: 'weather', class: demo ? 'fixture-art' : 'open-meteo', ok: true, credit: demo ? null : cls('open-meteo').credit, ...(demo ? { publish: false } : {}) });
    if (/GDACS/i.test(src) || (weather.warnings || weather.report?.warnings || []).length) add({ kind: 'warnings', class: 'gdacs', ok: true, credit: cls('gdacs').credit });
  }
  const missing = assets.filter((a) => !a.ok);
  return { assets, missing, credits: creditLines(assets) };
}

function creditLines(assets) {
  const out = [];
  const reporting = assets.filter((a) => a.kind === 'reporting').map((a) => a.credit);
  if (reporting.length) out.push(`Reporting: ${[...new Set(reporting)].join(', ')}`);
  const pics = [...new Set(assets.filter((a) => a.kind === 'picture' && a.ok && a.credit).map((a) => a.credit))];
  if (pics.length) out.push(`Pictures: ${pics.join('; ')}`);
  const vids = [...new Set(assets.filter((a) => a.kind === 'footage' && a.ok && a.credit).map((a) => a.credit))];
  if (vids.length) out.push(`Footage: ${vids.join('; ')}`);
  for (const k of ['weather', 'warnings', 'map', 'voices']) {
    const a = assets.find((x) => x.kind === k && x.credit);
    if (a) out.push(a.credit);
  }
  out.push('Presenters, sets, graphics and music: original, by GLOBIT 24');
  return out;
}

/** The description's credit lines for an item (episode, clip or Short: the episode's assets). */
export function creditsFor(item) {
  return auditItem(item).credits;
}

/**
 * The producer's rights stage. 'report' (the default until the cleared-pictures pipeline gives every picture its
 * record) notes what has no record in episode.rights; 'strict' (RIGHTS_GATE=strict, required at launch:
 * compliance.md §9) also takes each such picture or clip off air, so nothing without a record airs.
 */
export function rightsGate(episode, { mode = 'report', annotate = true } = {}) {
  if (!episode?.segments) return { rights: 'none', missing: 0 };
  const { missing } = auditItem(episode);
  let dropped = 0;
  if (mode === 'strict' && missing.length) {
    for (const seg of [...episode.segments, ...(episode.rundown || [])]) {
      if (seg.hasImage && !pictureRecord(seg).ok) {
        seg.hasImage = false;
        delete seg.imageCredit;
        delete seg.imageCreditLine;
        seg.source = seg.outlet || seg.source;
        dropped++;
      }
      if (seg.footage && !footageRecord(seg.footage).ok) {
        delete seg.footage;
        dropped++;
      }
    }
  }
  if (annotate) episode.rights = { mode, missing: missing.length, dropped, ...(missing.length ? { reasons: [...new Set(missing.map((m) => m.reason))].slice(0, 6) } : {}) };
  return { rights: mode, missing: missing.length, ...(dropped ? { dropped } : {}) };
}
