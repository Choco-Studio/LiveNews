// The re-check of what waits (docs/publishing/pipeline.md §4.1). A clip, an upload or a post can wait in the queue for
// days while the rules move under it: a takedown or a withdrawn story in the compliance register, a picture's licence
// read again, the verbatim rule against an article the cache now holds, an election period that has begun. Before each
// round the publisher (and tools/publish/recheck.mjs, by hand) runs the compliance gate again on everything waiting
// (pending, approved, scheduled) against the current rules, the register and the current rights records, and holds
// what no longer passes; the approval page shows why in the owner's words (approval.js RULE_ES). An item the re-check
// held that passes again goes back to the owner (pending), never straight out.
//
//   recheckQueue({ queue, view, dataDir, gate, now, register, getStory, usingStub })
//       -> { checked, passed, held: [items], released: [items] }
//   refreshRights(episode, { now }) -> how many picture records the current terms no longer clear (rights.js rejudge)
import * as compliance from './compliance.js';
import { rejudge } from '../rights.js';

export const WAITING = Object.freeze(['pending', 'approved', 'scheduled']);

/** Each picture's record on the episode judged again under today's terms (never cleared where it was not). */
export function refreshRights(episode, { now = Date.now() } = {}) {
  if (!episode || typeof episode !== 'object') return 0;
  let n = 0;
  for (const it of [...(Array.isArray(episode.segments) ? episode.segments : []), ...(Array.isArray(episode.rundown) ? episode.rundown : [])]) {
    if (!it?.imageRights) continue;
    const again = rejudge(it.imageRights, { now });
    if (again !== it.imageRights) {
      it.imageRights = again;
      it.imageUncleared = true;
      n++;
    }
  }
  if (Array.isArray(episode.pictureRights)) episode.pictureRights = episode.pictureRights.map((r) => rejudge(r, { now }));
  return n;
}

const heldBy = (item) => [...(item.history || [])].reverse().find((h) => h.action === 'held')?.by || null;
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/**
 * Run the gate again on every waiting item (and on the items an earlier re-check held). `view(item)` is the gate's view
 * of an item (publisher.js gateView). The register and the stories' sources are read fresh unless given.
 */
export function recheckQueue({ queue, view, dataDir = null, gate = compliance.preflight, now = () => Date.now(), register, getStory, usingStub = compliance.usingStub } = {}) {
  if (!queue || typeof view !== 'function') throw new Error('recheckQueue needs the queue and the gate view');
  const t = typeof now === 'function' ? now() : now;
  const reg = register === undefined ? compliance.register(dataDir) : register;
  const sources = getStory === undefined ? compliance.archiveGetStory({ dataDir }) : getStory;
  const out = { checked: 0, passed: 0, held: [], released: [] };
  const folders = new Map(); // (an item with its own sources folder: the beta's news day)
  const waiting = queue.list({ status: [...WAITING] });
  const ours = queue.list({ status: 'held' }).filter((it) => heldBy(it) === 'recheck');
  for (const item of [...waiting, ...ours]) {
    const v = view(item);
    const pictures = refreshRights(v.episode, { now: t });
    const g = gate(v, { now: t, register: reg, getStory: compliance.clipGetStory(item.source?.storyIds, compliance.sourcesForItem(item, sources, folders)) });
    out.checked++;
    const verdict = { ok: !!g.ok, violations: g.violations || [], warnings: g.warnings || [], stub: !!usingStub, checkedAt: t, recheck: true };
    if (!g.ok && item.status !== 'held') {
      const was = item.status;
      item.status = 'held';
      item.schedule = null;
      item.compliance = verdict;
      queue.save(queue.note(item, 'held', 'recheck', { was, rules: [...new Set(verdict.violations.map((x) => x.rule))], ...(pictures ? { pictures } : {}) }));
      out.held.push(item);
    } else if (g.ok && item.status === 'held') {
      item.status = 'pending';
      item.compliance = verdict;
      queue.save(queue.note(item, 'released', 'recheck'));
      out.released.push(item);
    } else if (g.ok) {
      out.passed++;
      // the latest verdict kept when it says something new (no write for every round otherwise)
      if (item.compliance?.ok === false || !same(item.compliance?.warnings, verdict.warnings)) {
        item.compliance = verdict;
        queue.save(item);
      }
    }
  }
  return out;
}
