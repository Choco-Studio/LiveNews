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
    Object.entries(channel.presenters).map(([id, p]) => [id, { name: p.name, voice: p.voice }])
  );
  const programs = Object.fromEntries(
    Object.entries(channel.programs).map(([id, p]) => [
      id,
      { title: p.title, tagline: p.tagline, theme: p.theme, presenters: p.presenters },
    ])
  );
  return { name: channel.name, slogan: channel.slogan, presenters, programs, rotation: channel.rotation };
}
