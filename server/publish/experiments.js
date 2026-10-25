// The publishing desk's experiments (docs/publishing/shorts-v2.md §4): one change tried at a time, its two arms
// alternated clip by clip on the same days (so a day's news never decides for us), each clip's arm written into its
// JSON and its queue item, so its numbers can be read by arm (tools/publish/metrics.mjs). A change stays when, with 20
// clips an arm or more, the share that stayed to watch (Instagram: the skip rate) is better by 5 points or more and
// neither the average viewed nor the sends fall.
//
//   EXPERIMENTS                                 the experiments, the running one first
//   runningFor(moment, { now })                 the experiment a moment's clip takes part in, or null
//   assignArm(store, experiment, momentId)      its arm: the next in turn, the same again for a moment that has one
//   armStore(file)                              the turns, kept in a small JSON file (data/publish/experiments.json)
import fs from 'node:fs';
import path from 'node:path';

/**
 * B1, the face hook (shorts-v2.md §3): the two players rise from behind their desk under the question board in the
 * clip's first quarter second, eyes on the question, and sink back by 2.6 s (or a tenth before the first cut): motion
 * where the eye starts, two faces, and their gaze on the words. The host, whose voice reads the question, is not
 * shown: a still face under a speaking voice reads as wrong.
 */
export const EXPERIMENTS = Object.freeze([
  Object.freeze({ id: 'face-hook-1', from: '2026-10-25', until: null, kinds: Object.freeze(['quiz-question']), arms: Object.freeze(['control', 'face']), what: 'the two players rise from behind their desk under the question for its first 2.6 s, eyes on it' }),
]);

/** The experiment a moment's clip takes part in (its kind, on its day), or null. */
export function runningFor(moment, { now = Date.now(), experiments = EXPERIMENTS } = {}) {
  const day = new Date(now).toISOString().slice(0, 10);
  return experiments.find((e) => e.kinds.includes(moment?.kind) && (!e.from || day >= e.from) && (!e.until || day <= e.until)) || null;
}

/**
 * The arm of a moment's clip: the one it already has (a run again keeps it), else the next in turn for the experiment
 * (control, face, control, …): alternated, never by chance, so two short weeks hold as many clips of each.
 */
export function assignArm(store, experiment, momentId) {
  const s = store.read();
  const e = (s[experiment.id] ||= { n: 0, arms: {} });
  if (!e.arms[momentId]) {
    e.arms[momentId] = experiment.arms[e.n % experiment.arms.length];
    e.n++;
    store.write(s);
  }
  return e.arms[momentId];
}

/** The turns in a JSON file ({ [experiment]: { n, arms: { [momentId]: arm } } }); a store in memory without a file. */
export function armStore(file = null) {
  let mem = {};
  return {
    read() {
      if (!file) return mem;
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return {};
      }
    },
    write(v) {
      if (!file) {
        mem = v;
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(v, null, 1));
      fs.renameSync(tmp, file);
    },
  };
}
