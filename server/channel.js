import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { FEATURES } from './writer.js';

const FILE = path.join(ROOT, 'config', 'channel.json');

/**
 * Channel definition: presenters, programmes and the rotation (the schedule).
 * Re-read when the file changes, so the line-up can be edited live.
 */
let cache = null;
let mtime = 0;

export function loadChannel(file = FILE) {
  const stat = fs.statSync(file);
  if (cache && stat.mtimeMs === mtime && cache.file === file) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateChannel(data);
    cache = { file, data };
    return data;
  } catch (err) {
    // A broken edit keeps the channel on air with the last good line-up.
    if (cache?.file === file) {
      console.error(`[channel] ${path.basename(file)} is invalid, keeping the previous version: ${err.message}`);
      return cache.data;
    }
    throw err;
  } finally {
    mtime = stat.mtimeMs;
  }
}

export function validateChannel(ch) {
  if (!ch?.programs || !ch?.presenters || !Array.isArray(ch.rotation) || !ch.rotation.length) {
    throw new Error('channel.json needs presenters, programs and a non-empty rotation');
  }
  for (const id of ch.rotation) {
    if (!ch.programs[id]) throw new Error(`rotation references unknown programme "${id}"`);
  }
  for (const [id, p] of Object.entries(ch.programs)) {
    for (const key of ['title', 'tagline', 'style', 'storyLength']) {
      if (typeof p[key] !== 'string' || !p[key].trim()) throw new Error(`programme "${id}" needs a "${key}" text`);
    }
    if (!Number.isInteger(p.stories) || p.stories < 1) throw new Error(`programme "${id}" needs "stories" (a whole number ≥ 1)`);
    if (!Array.isArray(p.categories) || !p.categories.length) throw new Error(`programme "${id}" needs a list of "categories"`);
    if (!Array.isArray(p.presenters) || p.presenters.length < 1 || p.presenters.length > 2) {
      throw new Error(`programme "${id}" needs 1 or 2 presenters`);
    }
    for (const who of p.presenters) {
      if (!ch.presenters[who]) throw new Error(`programme "${id}" references unknown presenter "${who}"`);
    }
    // Optional: recurring features (see FEATURES in server/writer.js) and a note on the presenters' chemistry.
    if (p.features !== undefined) {
      if (!Array.isArray(p.features)) throw new Error(`programme "${id}" has "features" that are not a list`);
      for (const f of p.features) {
        if (!FEATURES.includes(f)) throw new Error(`programme "${id}" has an unknown feature "${f}" (known: ${FEATURES.join(', ')})`);
      }
    }
    if (p.chemistry !== undefined && typeof p.chemistry !== 'string') throw new Error(`programme "${id}" has a "chemistry" that is not text`);
    validateEditorial(id, p);
  }
  for (const [id, who] of Object.entries(ch.presenters)) {
    if (who.role !== undefined && typeof who.role !== 'string') throw new Error(`presenter "${id}" has a "role" that is not text`);
  }
}

const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isListOrMap = (v) => isList(v) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isList));

/** Optional editorial keys a programme may carry (see CONTRACTS.md, editorial): types and ranges. */
function validateEditorial(id, p) {
  const fail = (msg) => {
    throw new Error(`programme "${id}" ${msg}`);
  };
  if (p.headlineMax !== undefined && !(Number.isInteger(p.headlineMax) && p.headlineMax >= 20 && p.headlineMax <= 80)) fail('has a "headlineMax" outside 20..80');
  if (p.intro !== undefined && !['headlines', 'teaser', 'frame'].includes(p.intro)) fail('has an unknown "intro" (headlines, teaser or frame)');
  if (p.numberSlot !== undefined && !['main', 'second', 'last'].includes(p.numberSlot)) fail('has an unknown "numberSlot" (main, second or last)');
  if (p.toss !== undefined && (typeof p.toss !== 'string' || !p.toss.includes('{name}'))) fail('has a "toss" without {name}');
  if (p.outroAnchor !== undefined && !['A', 'B'].includes(p.outroAnchor)) fail('has an "outroAnchor" that is not A or B');
  for (const key of ['noQuestions']) if (p[key] !== undefined && typeof p[key] !== 'boolean') fail(`has a "${key}" that is not true/false`);
  if (p.thanksMax !== undefined && !(Number.isInteger(p.thanksMax) && p.thanksMax >= 0)) fail('has a "thanksMax" that is not a whole number');
  if (p.happyOnly !== undefined && !isList(p.happyOnly)) fail('has a "happyOnly" that is not a list');
  if (p.roundup !== undefined) {
    const r = p.roundup;
    if (!r || typeof r !== 'object') fail('has a "roundup" that is not an object');
    if (r.opener !== undefined && typeof r.opener !== 'string') fail('has a round-up "opener" that is not text');
    for (const k of ['min', 'max']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] >= 2 && r[k] <= 6)) fail(`has a round-up "${k}" outside 2..6`);
  }
  if (p.chats !== undefined) {
    const c = p.chats;
    if (!c || typeof c !== 'object' || (c.after !== undefined && !(isList(c.after) && c.after.every((a) => ['lead', 'story', 'lighter'].includes(a))))) fail('has "chats" with an invalid "after" (lead, story, lighter)');
  }
  if (p.timing !== undefined) {
    const t = p.timing;
    if (!t || typeof t !== 'object' || !(t.target > 0) || !(t.wpm > 0)) fail('has a "timing" without a positive target and wpm');
  }
  if (p.gestures !== undefined) {
    const g = p.gestures;
    if (!g || typeof g !== 'object') fail('has "gestures" that are not an object');
    for (const k of ['allow', 'listener']) if (g[k] !== undefined && !isListOrMap(g[k])) fail(`has gestures "${k}" that are not a list (or a list per presenter)`);
    for (const k of ['deny', 'grave']) if (g[k] !== undefined && !isList(g[k])) fail(`has gestures "${k}" that are not a list`);
  }
}

/** Presenter slots for a programme: A (left/solo) and optionally B (right). */
export function castOf(channel, programId) {
  const [a, b] = channel.programs[programId].presenters;
  return b ? { A: a, B: b } : { A: a };
}

/** Public view of the channel for the browser (no prompt-only fields). */
export function publicChannel(channel) {
  const presenters = Object.fromEntries(
    Object.entries(channel.presenters).map(([id, p]) => [id, { name: p.name, voice: p.voice, ...(p.role ? { role: p.role } : {}) }])
  );
  const programs = Object.fromEntries(
    Object.entries(channel.programs).map(([id, p]) => [
      id,
      { title: p.title, tagline: p.tagline, theme: p.theme, presenters: p.presenters },
    ])
  );
  return { name: channel.name, slogan: channel.slogan, presenters, programs, rotation: channel.rotation };
}
