// The week's grouping in a thread of its own (server/weekgrouper.js starts it): the news desk's sameStory is called a
// few hundred thousand times for a week's first grouping, and on the station's own thread that held its event loop
// (88 s at once; in slices, still up to 250 ms at a time while its garbage was collected). Here its garbage is this
// thread's, and the work goes in slices with a breath between (`breathMs`): on a machine shared with other work, the
// station's own thread is never starved of the processor by it.
//
// Messages: { type: 'add', entries } the airings (the fields sameStory and the scoring read, and `ord`, their place in
// the archive's order); { type: 'drop', before } forgets those older; { type: 'group', id, since, now, storms } answers
// { type: 'groups', id, groups: [[ord, ...], ...] } (the groups in the order they began, each airing's ord in order),
// or { type: 'error', id, message }. Groupings run one at a time.
import { parentPort, workerData } from 'node:worker_threads';
import { NewsDesk } from './news.js';
import { groupSteps } from './weekgroups.js';

const quiet = { warn() {}, info() {}, error() {} };
const desk = new NewsDesk({ log: quiet });
let storms = new Set();
// (the desk's storm names are the station's: sameStory reads them, and they are sent with each request)
desk.stormNames = () => storms;
const entries = new Map(); // ord -> airing
let memo = {};
let memoKey = null;
const sliceMs = workerData?.sliceMs ?? 25;
const breathMs = workerData?.breathMs ?? 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let busy = Promise.resolve();

async function group(m) {
  try {
    storms = new Set(m.storms || []);
    const key = [...storms].sort().join('|');
    // (the kept answers hold while the storm names do; a week's worth of new words starts them again)
    if (key !== memoKey || (memo.ids?.size || 0) > 20000) {
      memo = {};
      memoKey = key;
    }
    let calls = 0;
    const same = (a, b) => {
      calls++;
      try {
        return desk.sameStory(a, b);
      } catch {
        return false;
      }
    };
    const list = [...entries.values()].sort((a, b) => a.ord - b.ord);
    const t0 = performance.now();
    const steps = groupSteps(list, { since: m.since, now: m.now, same, memo, sliceMs });
    let r = steps.next();
    while (!r.done) {
      if (breathMs > 0) await sleep(breathMs);
      r = steps.next();
    }
    parentPort.postMessage({ type: 'groups', id: m.id, groups: r.value.map((g) => g.entries.map((e) => e.ord)), calls, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    parentPort.postMessage({ type: 'error', id: m.id, message: err?.message || String(err) });
  }
}

parentPort.on('message', (m) => {
  if (m?.type === 'add') {
    for (const e of m.entries || []) entries.set(e.ord, e);
  } else if (m?.type === 'drop') {
    for (const [ord, e] of entries) if (e.at < m.before) entries.delete(ord);
  } else if (m?.type === 'group') {
    busy = busy.then(() => group(m));
  }
});
