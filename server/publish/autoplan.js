// The autonomous round's choices (tools/publish/auto.mjs): which rendered programme to make next, and which pieces
// waiting in the queue are too old to go out. News published days late is not news, and a queue fed by every
// programme the station makes (about twenty a day) outruns the networks' daily caps (a week of backlog on the owner's
// server, 19 Oct): so the round keeps the queue to about a day, takes the programmes in turn by type, and lets a
// piece go when it would reach its network more than a day after its programme aired.
//
//   stale(item, now, { freshHours })      -> why it is too old to publish (null: fresh enough)
//   nextProgramme(candidates, lastMade, { now, freshHours }) -> the candidate to make, or null
//   backlog(items, platform)              -> how many pieces wait to go out on that network

export const AUTO_DEFAULTS = Object.freeze({ freshHours: 24, backlog: 8, clipsPerProgramme: 2 });

const H = 3600_000;

/** Why a waiting piece is too old to publish (null: fresh enough): its programme aired more than freshHours before
 * now, or before the time it is scheduled to go out. */
export function stale(item, now, { freshHours = AUTO_DEFAULTS.freshHours } = {}) {
  if (!['approved', 'scheduled', 'pending'].includes(item?.status)) return null;
  const aired = Number(item.source?.airedAt) || Date.parse(item.source?.airedAt || '') || null;
  if (!aired) return null;
  const limit = freshHours * H;
  if (now - aired > limit) return `aired ${Math.round((now - aired) / H)} h ago`;
  const at = item.schedule?.at;
  if (at && at - aired > limit) return `would go out ${Math.round((at - aired) / H)} h after it aired`;
  return null;
}

/** How many pieces wait to go out on a network (approved or scheduled). */
export const backlog = (items, platform) => items.filter((it) => it.platform === platform && ['approved', 'scheduled'].includes(it.status)).length;

/**
 * The programme to make next: among the fresh candidates ({ id, programId, airEnd }), the type made least recently
 * (lastMade: programId -> time), and of that type the newest edition. Null when none is fresh.
 */
export function nextProgramme(candidates, lastMade = {}, { now = Date.now(), freshHours = AUTO_DEFAULTS.freshHours } = {}) {
  const fresh = candidates.filter((c) => c.airEnd && now - c.airEnd <= freshHours * H);
  if (!fresh.length) return null;
  return [...fresh].sort((a, b) => (lastMade[a.programId] || 0) - (lastMade[b.programId] || 0) || b.airEnd - a.airEnd)[0];
}
