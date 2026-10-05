import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { FEATURES } from './writer.js';
import { ACTIONS } from '../public/js/cues.js';
import { TOPIC_NAMES } from './topics.js';
import { DESKS } from './correspondents.js';

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
    if (p.kind !== undefined && p.kind !== 'weather') throw new Error(`programme "${id}" has an unknown "kind" (only "weather")`);
    // a weather programme is written from the weather data (server/weatherwriter.js): no stories, no sections
    const news = p.kind !== 'weather';
    for (const key of news ? ['title', 'tagline', 'style', 'storyLength'] : ['title', 'tagline']) {
      if (typeof p[key] !== 'string' || !p[key].trim()) throw new Error(`programme "${id}" needs a "${key}" text`);
    }
    if (news && (!Number.isInteger(p.stories) || p.stories < 1)) throw new Error(`programme "${id}" needs "stories" (a whole number ≥ 1)`);
    if (news && (!Array.isArray(p.categories) || !p.categories.length)) throw new Error(`programme "${id}" needs a list of "categories"`);
    // Optional: running time [min, max] seconds (pace.js length.target, mirrored for the writer's prompt and the mock).
    if (p.targetSeconds !== undefined) {
      const t = p.targetSeconds;
      if (!Array.isArray(t) || t.length !== 2 || !t.every((n) => Number.isFinite(n) && n > 0) || t[0] > t[1]) {
        throw new Error(`programme "${id}" has a "targetSeconds" that is not [min, max] seconds with min ≤ max`);
      }
    }
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
    // Optional: the correspondents a programme hands stories to (server/correspondents.js), and how many links it airs.
    if (p.correspondents !== undefined) {
      if (!isList(p.correspondents)) throw new Error(`programme "${id}" has "correspondents" that are not a list of presenter ids`);
      for (const who of p.correspondents) {
        if (!ch.presenters[who]) throw new Error(`programme "${id}" references unknown correspondent "${who}"`);
        if (!DESKS[ch.presenters[who].desk]) throw new Error(`correspondent "${who}" has no known "desk" (${Object.keys(DESKS).join(', ')})`);
      }
    }
    if (p.crosses !== undefined && !(Number.isInteger(p.crosses) && p.crosses >= 0 && p.crosses <= 3)) throw new Error(`programme "${id}" has a "crosses" outside 0..3`);
    // Optional: the boards a programme's stories may carry (WHAT WE KNOW: the writer's "known" points).
    if (p.boards !== undefined && !(isList(p.boards) && p.boards.every((b) => b === 'known'))) throw new Error(`programme "${id}" has "boards" other than ["known"]`);
    // Optional: IN PLAIN ENGLISH (server/glossary.js): a presenter of the programme translates a story's jargon.
    if (p.terms !== undefined && !(p.terms && typeof p.terms === 'object' && typeof p.terms.explainer === 'string' && (p.presenters || []).includes(p.terms.explainer))) throw new Error(`programme "${id}" has "terms" without one of its presenters as "explainer"`);
    validateEditorial(id, p);
  }
  for (const [id, who] of Object.entries(ch.presenters)) {
    if (who.role !== undefined && typeof who.role !== 'string') throw new Error(`presenter "${id}" has a "role" that is not text`);
    if (who.desk !== undefined && !DESKS[who.desk]) throw new Error(`presenter "${id}" has an unknown "desk" (${Object.keys(DESKS).join(', ')})`);
  }
  const b = ch.breaks;
  if (b !== undefined) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('channel "breaks" is not an object');
    const whole = (k, lo, hi) => b[k] === undefined || (Number.isInteger(b[k]) && b[k] >= lo && b[k] <= hi);
    if (!whole('adsPerBreak', 1, 10)) throw new Error('channel "breaks.adsPerBreak" is not a whole number 1..10');
    if (!whole('maxExtraAds', 0, 50)) throw new Error('channel "breaks.maxExtraAds" is not a whole number 0..50');
    if (!(b.minProgrammeBetween === undefined || (typeof b.minProgrammeBetween === 'number' && b.minProgrammeBetween >= 0 && b.minProgrammeBetween <= 3600))) {
      throw new Error('channel "breaks.minProgrammeBetween" is not 0..3600 seconds');
    }
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
  // Optional: "every" = a picture on every item (NEWS IN 60's bible): picture stories are preferred while the desk has them.
  if (p.pictures !== undefined && !['every', 'prefer'].includes(p.pictures)) fail('has a "pictures" that is not "every" or "prefer"');
  // Optional: the topics a secondary section's stories must have to be on this programme's beat (server/topics.js).
  if (p.beat !== undefined) {
    if (!p.beat || typeof p.beat !== 'object' || Array.isArray(p.beat)) fail('has a "beat" that is not { section: [topics] }');
    for (const [section, topics] of Object.entries(p.beat)) {
      if (!p.categories?.includes(section)) fail(`has a "beat" for "${section}", which is not one of its categories`);
      if (!isList(topics) || !topics.length || !topics.every((t) => TOPIC_NAMES.includes(t))) fail(`has a "beat" for "${section}" naming an unknown topic (known: ${TOPIC_NAMES.join(', ')})`);
    }
  }
  if (p.numberSlot !== undefined && !['main', 'second', 'last'].includes(p.numberSlot)) fail('has an unknown "numberSlot" (main, second or last)');
  if (p.toss !== undefined && (typeof p.toss !== 'string' || !p.toss.includes('{name}'))) fail('has a "toss" without {name}');
  if (p.outroAnchor !== undefined && !['A', 'B'].includes(p.outroAnchor)) fail('has an "outroAnchor" that is not A or B');
  for (const key of ['noQuestions']) if (p[key] !== undefined && typeof p[key] !== 'boolean') fail(`has a "${key}" that is not true/false`);
  if (p.thanksMax !== undefined && !(Number.isInteger(p.thanksMax) && p.thanksMax >= 0)) fail('has a "thanksMax" that is not a whole number');
  if (p.maxChats !== undefined && !(Number.isInteger(p.maxChats) && p.maxChats >= 0)) fail('has a "maxChats" that is not a whole number');
  if (p.sentenceWords !== undefined && !(Number.isInteger(p.sentenceWords) && p.sentenceWords >= 8 && p.sentenceWords <= 40)) fail('has a "sentenceWords" outside 8..40');
  if (p.happyOnly !== undefined && !(isList(p.happyOnly) && p.happyOnly.every((r) => HAPPY_ROLES.includes(r)))) fail(`has a "happyOnly" that is not a list of ${HAPPY_ROLES.join(', ')}`);
  if (p.roundup !== undefined) {
    const r = p.roundup;
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail('has a "roundup" that is not an object');
    if (r.opener !== undefined && typeof r.opener !== 'string') fail('has a round-up "opener" that is not text');
    for (const k of ['min', 'max']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] >= 2 && r[k] <= 6)) fail(`has a round-up "${k}" outside 2..6`);
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) fail('has a round-up "min" above its "max"');
    if (r.words !== undefined && !(typeof r.words === 'string' ? /^\d{1,2}(?:\s*(?:to|-|–)\s*\d{1,2})?$/.test(r.words.trim()) : Number.isInteger(r.words) && r.words > 0)) fail('has round-up "words" that are not "12 to 20" or a number');
    if (r.reader !== undefined && !['A', 'B'].includes(r.reader)) fail('has a round-up "reader" that is not A or B');
    if (r.timed !== undefined && typeof r.timed !== 'boolean') fail('has a round-up "timed" that is not true/false');
    // "places" (AROUND THE WORLD: one item per country, each on its map) or "pictures" (TECH BYTES' QUICK BYTES:
    // stories with a picture of their own, each over it); the kicker names it on the strap
    if (r.kind !== undefined && !['places', 'pictures'].includes(r.kind)) fail('has a round-up "kind" that is not "places" or "pictures"');
    if (r.kicker !== undefined && !(typeof r.kicker === 'string' && /^[A-Z0-9 &'-]{3,24}$/.test(r.kicker))) fail('has a round-up "kicker" that is not 3-24 capitals');
  }
  if (p.chats !== undefined) {
    const c = p.chats;
    if (!c || typeof c !== 'object' || (c.after !== undefined && !(isList(c.after) && c.after.every((a) => CHAT_SLOTS.includes(a))))) fail('has "chats" with an invalid "after" (lead, story, lighter)');
    if (c.max !== undefined && !(c.max && typeof c.max === 'object' && !Array.isArray(c.max) && Object.entries(c.max).every(([k, v]) => CHAT_SLOTS.includes(k) && Number.isInteger(v) && v >= 0))) fail('has chats "max" that is not { lead|story|lighter: whole number }');
  }
  if (p.timing !== undefined) {
    const t = p.timing;
    if (!t || typeof t !== 'object' || !(t.target > 0) || !(t.wpm > 0)) fail('has a "timing" without a positive target and wpm');
    if (t.accept !== undefined && !(Array.isArray(t.accept) && t.accept.length === 2 && t.accept.every((x) => typeof x === 'number' && x > 0) && t.accept[0] < t.accept[1])) fail('has timing "accept" that is not [low, high] seconds');
    if (t.gap !== undefined && !(typeof t.gap === 'number' && t.gap >= 0 && t.gap <= 5)) fail('has a timing "gap" outside 0..5 seconds');
    if (t.minStories !== undefined && !(Number.isInteger(t.minStories) && t.minStories >= 1)) fail('has a timing "minStories" that is not a whole number ≥ 1');
  }
  if (p.gestures !== undefined) {
    const g = p.gestures;
    if (!g || typeof g !== 'object' || Array.isArray(g)) fail('has "gestures" that are not an object');
    const known = (list) => list.every((n) => ACTIONS[n]);
    const names = (v) => (Array.isArray(v) ? v : Object.values(v).flat());
    for (const k of ['allow', 'listener']) {
      if (g[k] === undefined) continue;
      if (!isListOrMap(g[k])) fail(`has gestures "${k}" that are not a list (or a list per presenter)`);
      if (!known(names(g[k]))) fail(`has gestures "${k}" naming an unknown action (${names(g[k]).filter((n) => !ACTIONS[n]).join(', ')})`);
    }
    for (const k of ['deny', 'grave']) {
      if (g[k] === undefined) continue;
      if (!isList(g[k])) fail(`has gestures "${k}" that are not a list`);
      if (!known(g[k])) fail(`has gestures "${k}" naming an unknown action (${g[k].filter((n) => !ACTIONS[n]).join(', ')})`);
    }
    if (g.map !== undefined && !(g.map && typeof g.map === 'object' && !Array.isArray(g.map) && Object.entries(g.map).every(([a, b]) => ACTIONS[a] && ACTIONS[b]))) fail('has gestures "map" that is not { action: action } with known actions');
    if (g.only !== undefined && !(g.only && typeof g.only === 'object' && !Array.isArray(g.only) && Object.entries(g.only).every(([a, w]) => ACTIONS[a] && (Array.isArray(w) ? w : [w]).every((x) => GESTURE_PLACES.includes(x))))) fail(`has gestures "only" that is not { action: ${GESTURE_PLACES.join('|')} }`);
    const count = (v) => Number.isInteger(v) && v >= 0;
    if (g.perSegment !== undefined && !(count(g.perSegment) || (g.perSegment && typeof g.perSegment === 'object' && !Array.isArray(g.perSegment) && Object.values(g.perSegment).every(count)))) fail('has gestures "perSegment" that is not a whole number (or one per presenter)');
    if (g.perEpisode !== undefined && !count(g.perEpisode)) fail('has gestures "perEpisode" that is not a whole number');
    if (g.defaults !== undefined && !(g.defaults && typeof g.defaults === 'object' && Object.entries(g.defaults).every(([k, a]) => ['intro', 'outro'].includes(k) && ACTIONS[a]))) fail('has gestures "defaults" that are not { intro|outro: known action }');
  }
}

const HAPPY_ROLES = ['lighter', 'last', 'chat', 'outro', 'lead', 'story', 'intro'];
const CHAT_SLOTS = ['lead', 'story', 'lighter'];
const GESTURE_PLACES = ['lead', 'story', 'intro', 'outro', 'chat'];

/** Presenter slots for a programme: A (left/solo) and optionally B (right). */
export function castOf(channel, programId) {
  const [a, b] = channel.programs[programId].presenters;
  return b ? { A: a, B: b } : { A: a };
}

/** Public view of the channel for the browser (no prompt-only fields). */
export function publicChannel(channel) {
  const presenters = Object.fromEntries(
    Object.entries(channel.presenters).map(([id, p]) => [id, { name: p.name, voice: p.voice, ...(p.role ? { role: p.role } : {}), ...(p.desk ? { desk: p.desk } : {}) }])
  );
  const programs = Object.fromEntries(
    Object.entries(channel.programs).map(([id, p]) => [
      id,
      { title: p.title, tagline: p.tagline, theme: p.theme, presenters: p.presenters },
    ])
  );
  return { name: channel.name, slogan: channel.slogan, presenters, programs, rotation: channel.rotation };
}
