// The check before air (docs/publishing/playout.md §3): in pre-rendered playout every programme passes the compliance
// desk's preflight (server/compliance/ through server/publish/compliance.js) before it may enter the playout queue, as
// the live stream's own output (kind 'live': the rules of compliance.md §1's first column). What fails is held, with
// its reasons; it never airs, and the hole it leaves is filled by the next programme or by filler.
//
// Two passes, the same function:
//   - when the station makes an episode (no recording yet): rights, demo data, verbatim, the register, election holds,
//     the owner's review of a recreation, the no-LIVE rule. A programme that fails here is never rendered.
//   - when the renderer has rendered it (with the recording's report): all of that again, with the recreations'
//     labels and the AI mark checked against the timeline of what aired.
//
// Rules that are not about the programme's picture and words, reported (`skipped`) but not holding it:
//   editorial-contact-missing   who answers for the channel goes in the stream's description (the supervisor's), and
//                               in every upload's, where the publishing desk's gate requires it
//   flag-missing, flag-unavailable   the synthetic-media flag is set on the broadcast once (compliance.md §2.5), not
//                               per programme
//   unmarked                    C2PA cannot survive RTMP ingest (compliance.md §4); the masters the publishing desk
//                               exports are marked by its own gate
//
//   airGate(episode, { recording, getStory, register, now, verbatim, requireReview, dataDir, env, recorded, calendar })
//     -> { ok, violations: [{ rule, message }], warnings, skipped, stub }
import * as compliance from '../publish/compliance.js';
import { falseLive } from '../../public/js/airmode.js';

export const NOT_FOR_AIR = Object.freeze({
  'editorial-contact-missing': 'a description rule: the stream description and every upload name who answers (EDITORIAL_CONTACT)',
  'flag-missing': 'the synthetic-media flag is set once on the broadcast, not per programme',
  'flag-unavailable': 'the synthetic-media flag is set once on the broadcast, not per programme',
  unmarked: 'C2PA does not survive RTMP ingest; exported files are marked by the publishing gate',
});

/** Every text the programme shows or says (for the no-LIVE rule): segments' words, headlines, kickers, straps. */
export function programmeTexts(episode) {
  const out = [];
  const add = (where, s) => {
    if (typeof s === 'string' && s.trim()) out.push({ where, text: s });
  };
  add('title', episode?.title);
  for (const [i, seg] of (episode?.segments || []).entries()) {
    add(`segment ${i} words`, seg?.text);
    add(`segment ${i} headline`, seg?.headline);
    add(`segment ${i} kicker`, seg?.kicker);
    add(`segment ${i} strap`, seg?.strap);
  }
  return out;
}

/** The no-LIVE rule on a pre-recorded programme: every live claim it would make, as violations. */
export function liveClaims(episode) {
  const v = [];
  for (const { where, text } of programmeTexts(episode)) {
    // (the spoken text carries the director's cues in brackets: "[wave] Good evening")
    const said = falseLive(String(text).replace(/\[[^\]]*\]/g, ' '));
    if (said) v.push({ rule: 'false-live', message: `${where} says "${said}": a pre-recorded programme never claims to be live`, where, said });
  }
  return v;
}

export function airGate(episode, { recording = null, getStory = null, register = null, now = Date.now(), verbatim = 'block', requireReview = true, dataDir = null, env = process.env, recorded = true, calendar = undefined } = {}) {
  if (!episode || episode.kind === 'break') return { ok: true, violations: [], warnings: [], skipped: [], stub: compliance.usingStub };
  const item = {
    id: episode.id,
    kind: 'live',
    episode,
    ...(recording ? { recording } : {}),
    storyIds: episode.storyIds || [],
    platforms: ['youtube'],
  };
  let r;
  try {
    r = compliance.preflight(item, { getStory, register, now, verbatim, requireReview, dataDir, env, ...(calendar ? { calendar } : {}) });
  } catch (err) {
    // a check that cannot run holds the programme: nothing airs unchecked
    return { ok: false, violations: [{ rule: 'gate-error', message: `the compliance check failed to run: ${String(err?.message || err).slice(0, 300)}` }], warnings: [], skipped: [], stub: compliance.usingStub };
  }
  const violations = [];
  const skipped = [];
  for (const x of r.violations || []) (NOT_FOR_AIR[x.rule] ? skipped : violations).push(NOT_FOR_AIR[x.rule] ? { ...x, why: NOT_FOR_AIR[x.rule] } : x);
  if (recorded) violations.push(...liveClaims(episode));
  return { ok: violations.length === 0, violations, warnings: r.warnings || [], skipped, stub: compliance.usingStub, recreations: (r.recreations || []).length };
}

/** The gate's settings from the environment: PLAYOUT_VERBATIM=block|warn, PLAYOUT_REVIEW=1|0 (defaults: strict). */
export function gateOptionsFromEnv(env = process.env) {
  return {
    verbatim: String(env.PLAYOUT_VERBATIM || 'block').toLowerCase() === 'warn' ? 'warn' : 'block',
    requireReview: !/^(0|false|no|off)$/i.test(String(env.PLAYOUT_REVIEW ?? '1')),
  };
}
