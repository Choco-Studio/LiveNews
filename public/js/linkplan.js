// The shots of a correspondent link (WORLD NOW, director.js playCross), planned from the sentence timings before
// the part airs, so that no shot breaks the programme's floor (owner 24/7: 4 s) and none comes late:
//   piece    the correspondent (LOCATION), then pictures of the place (BROLL), then the correspondent again for a
//            last line when there is room. When the hand-over's two-way has only just come up, the correspondent's
//            first words stay in it (they start talking in the box, as on air) and the pictures follow. Without
//            pictures (an expert's analysis) the speaker comes full frame by their second sentence.
//   ask      the two-way (when the shot on air has held the floor; else the prompt is heard over the
//            correspondent listening, and the two-way comes with the answer)
//   answer   the two-way, the correspondent from the next sentence (already on the correspondent: stays)
//   thanks   whatever is on air (the next segment cuts back to the studio)
// Cuts fall on sentence starts. Every candidate plan is played through: a cut only once the shot on air has held
// the floor, and the part's last shot holding it too before the next part cuts away (the studio's first cut never
// waits, so that one is a hard limit). The plan closest to the wanted shots wins.
//
//   planLink({ part, starts, end, current, held, min, broll, next, nextAt }) -> [shot | null per sentence]
//     starts   seconds from the part's start to each sentence's first word (sentenceStarts)
//     end      the part's length (s)
//     current  the shot on air when the part starts, held = how long it has been on air (s)
//     broll    pictures of the place can be shown (footage, the story's picture or its map)
//     next     the shot the following part opens on ('twoway', 'studio'; null: none), nextAt its time (s)

export const LINK_PLAN_SHOTS = new Set(['location', 'twoway', 'broll']);

/** The shots a part wants, in order, each with the sentence it is meant to open (it may come later) and its worth. */
export function wantedShots(part, n, { current = null, broll = true } = {}) {
  if (!n || part === 'thanks') return [];
  if (part === 'ask') return [{ shot: 'twoway', at: 0, worth: 6 }];
  if (part === 'answer') {
    if (current === 'location') return [];
    const out = [{ shot: 'twoway', at: 0, worth: 3 }];
    if (n > 1) out.push({ shot: 'location', at: 1, worth: 3 });
    return out;
  }
  // the correspondent on camera for their first words: full frame, or the two-way the hand-over opened (then
  // straight to the pictures, the live into tape; a little dearer than the full frame when that could come)
  const out = [{ shot: 'location', at: 0, worth: 6, or: 'twoway', orCost: 0.5 }];
  if (broll && n >= 2) out.push({ shot: 'broll', at: 1, worth: 4 });
  // no pictures (an expert, a place without any): the speaker full frame from the next sentence at the latest
  if (!broll && n >= 2) out.push({ shot: 'location', at: 1, worth: 4 });
  if (broll && n >= 3) out.push({ shot: 'location', at: n - 1, worth: 2 });
  return out;
}

const EPS = 1e-6;
const FLOOR = 1000; // a shot under the floor before a cut that will not wait (the studio's)
const SOFT = 50; // the part's last shot too young for the next part's own cut (that part waits: shot kept)
const STUDIO_VOICE = 2000; // the correspondent's words heard over the studio: worse than a short shot

/**
 * Plays a plan through: the shots and how long each holds, and what it costs (floor breaks, lateness, shots missed).
 * plan: shot | null per sentence (null = no cut).
 */
export function playPlan(plan, { want, starts, end, current = null, held = Infinity, min = 4, next = null, nextAt = null }) {
  const fromStudio = !LINK_PLAN_SHOTS.has(current);
  let shot = current, since = -held, cost = 0;
  const holds = [];
  for (let i = 0; i < plan.length; i++) {
    const to = plan[i];
    if (!to || to === shot) continue;
    // off the studio the correspondent's first shot cannot wait for a sentence: it comes once the floor allows
    // (inside the first sentence: the director's cut waits the cooldown)
    const t = fromStudio && shot === current && i === 0 ? Math.max(starts[0], since + min) : starts[i];
    if (t - since < min - EPS) cost += FLOOR;
    holds.push({ shot, from: since, to: t });
    shot = to;
    since = t;
  }
  if (fromStudio && shot === current && plan.length) cost += STUDIO_VOICE;
  const cutAt = nextAt ?? end;
  if (next && next !== shot && cutAt - since < min - EPS) cost += next === 'studio' ? FLOOR : SOFT;
  holds.push({ shot, from: since, to: next && next !== shot ? cutAt : end });
  // what was wanted: each shot on air by its sentence (late costs a point a sentence), else its worth
  let w = 0;
  for (let i = 0; i < plan.length && w < want.length; i++) {
    const on = onAirAt(plan, i, current);
    while (w < want.length && want[w].at <= i && (on === want[w].shot || on === want[w].or)) {
      cost += i - want[w].at + (on === want[w].shot ? 0 : want[w].orCost);
      w++;
    }
  }
  for (; w < want.length; w++) cost += want[w].worth;
  // a cut costs a little: of two plans as good, the calmer one
  cost += holds.length * 0.01;
  return { cost, holds };
}

function onAirAt(plan, i, current) {
  for (let k = i; k >= 0; k--) if (plan[k]) return plan[k];
  return current;
}

export function planLink({ part, starts, end, current = null, held = Infinity, min = 4, broll = true, next = null, nextAt = null }) {
  const n = starts.length;
  const want = wantedShots(part, n, { current, broll });
  const empty = new Array(n).fill(null);
  if (!want.length) return empty;
  // every way of opening the wanted shots on sentences, in order (each taken on or after its sentence, or not
  // at all): a part has at most a few sentences, so a few hundred plans at most
  const opts = { want, starts, end, current, held, min, next, nextAt };
  let best = empty, bestCost = playPlan(empty, opts).cost;
  const plan = empty.slice();
  const walk = (k, from) => {
    if (k === want.length) {
      const { cost } = playPlan(plan, opts);
      if (cost < bestCost - EPS) [best, bestCost] = [plan.slice(), cost];
      return;
    }
    walk(k + 1, from); // without this shot
    for (let i = Math.max(from, want[k].at); i < n; i++) {
      plan[i] = want[k].shot;
      walk(k + 1, i + 1);
      plan[i] = null;
    }
  };
  walk(0, 0);
  // a cut to the shot already on air is no cut
  let on = current;
  return best.map((x) => {
    if (!x || x === on) return null;
    on = x;
    return x;
  });
}

/** Seconds from a part's start to each sentence's first word: the recorded words (by character), else the characters. */
export function sentenceStarts(lines, words, cps = 14.5) {
  const out = [];
  let at = 0, est = 0;
  for (let i = 0; i < lines.length; i++) {
    let t = null;
    if (Array.isArray(words) && words.length) {
      const w = words.find((x) => x.char >= at);
      if (w && Number.isFinite(w.t)) t = w.t;
    }
    out.push(t ?? est);
    est += (lines[i].length + 1) / cps;
    at += lines[i].length + 1;
  }
  return out;
}
