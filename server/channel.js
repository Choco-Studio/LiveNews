import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

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
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateChannel(data);
  cache = { file, data };
  mtime = stat.mtimeMs;
  return data;
}

export function validateChannel(ch) {
  if (!ch?.programs || !ch?.presenters || !Array.isArray(ch.rotation) || !ch.rotation.length) {
    throw new Error('channel.json needs presenters, programs and a non-empty rotation');
  }
  for (const id of ch.rotation) {
    if (!ch.programs[id]) throw new Error(`rotation references unknown programme "${id}"`);
  }
  for (const [id, p] of Object.entries(ch.programs)) {
    if (!Array.isArray(p.presenters) || p.presenters.length < 1 || p.presenters.length > 2) {
      throw new Error(`programme "${id}" needs 1 or 2 presenters`);
    }
    for (const who of p.presenters) {
      if (!ch.presenters[who]) throw new Error(`programme "${id}" references unknown presenter "${who}"`);
    }
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
