// How long an episode runs on air as a viewer with the real voices sees it: the open, every line at its voice's
// measured Kokoro rate (server/voice/rates.json, tools/lengths/rates.mjs) or its recorded clip, the pace profile's
// pause after every segment (public/js/pace.js gapAfter), the sign-off hold, the stinger and the end card. It is the
// director's own timeline (public/js/director.js) in closed form: tools/lengths/voiced.mjs plays episodes through the
// director at the same rates, and the two agree to a fraction of a second (test/airtime.test.js).
//
//   voicedAir(episode) -> seconds, open to end card
//   speechOf(episode, segment) -> seconds the segment is spoken for
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL, gapAfter, paceFor } from '../public/js/pace.js';
import { durationOf } from '../public/js/scenes/opens/cues.js';
import { WN_DURATION } from '../public/js/scenes/opens/worldcues.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let RATES = { median: 2.6, presenters: {} };
try {
  RATES = JSON.parse(fs.readFileSync(path.join(here, 'voice', 'rates.json'), 'utf8'));
} catch {
  /* the median for every voice */
}
// the opens' lengths (public/js/scenes/opens.js: WORLD NOW's titles have their own cue sheet)
const openOf = (id) => (id === 'world-now' ? WN_DURATION : durationOf(id));
const words = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;

/** Words a second of the voice in a segment's slot: its cast, correspondent or expert; a re-staged guest the median. */
export function rateOf(ep, slot) {
  const id = ep?.cast?.[slot] || ep?.correspondents?.[slot] || null;
  return RATES.presenters?.[id]?.wps || RATES.median || 2.6;
}

/** Seconds a segment is spoken for: its recorded clip, else its words at its voice's rate. */
export function speechOf(ep, seg) {
  const d = Number(seg?.audio?.duration);
  return Number.isFinite(d) && d > 0 ? d : words(seg?.text) / rateOf(ep, seg?.anchor);
}

/** An episode's air in seconds, from the stinger into its open to the end card. */
export function voicedAir(ep) {
  const segs = Array.isArray(ep?.segments) ? ep.segments : [];
  const id = ep?.program?.id;
  const P = paceFor(id);
  let t = CHANNEL.stinger / 2 + (Number(openOf(id)) || 0) + (P.open?.firstWord || 0);
  for (let i = 0; i < segs.length; i++) {
    t += speechOf(ep, segs[i]);
    if (segs[i]?.breaking && i <= 1) t += CHANNEL.stinger + (P.holds?.breakingCard || 0);
    t += gapAfter(ep, i).gap; // (after the last segment: the sign-off hold)
  }
  return t + CHANNEL.stinger + (P.holds?.endcard || 0);
}
