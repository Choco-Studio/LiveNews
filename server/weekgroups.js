// The week's airings grouped by event, for SEVEN DAYS (server/archive.js week, weekAsync; server/weekworker.js runs the
// same in a thread of its own, server/weekgrouper.js).
//
// Each airing joins the first group, in the order the groups began, that holds its story or, with `same`, an airing of
// the same section that `same` calls the same event; else it begins one. Round 10 of the pictures desk: on the 5,900
// airings of 18 Oct that took 1.1 million calls of the news desk's sameStory and 88 s with the station's event loop held
// (SEVEN DAYS "ready in" 121-212 s). The same walk, the same groups in the same order, from far fewer calls:
//   - sameStory reads an airing's words (its story, section, outlet, headline, summary) and one thing more, whether it
//     has read that airing before (it sets the airing's keywords on it then, and its rule for an outlet's update needs
//     them on both). So an answer is asked once for each pair of word sets in each of those states, and given again to
//     every other telling with the same words in the same state, with what sameStory would have set on it (answerOf);
//   - `memo` keeps, for the next edition, the answers between two airings both already read (they never change);
//   - each edition reads fresh copies of the airings, so it groups as the first edition after a restart would.
// test/week-grouping.test.js holds the old grouping beside the new; tools/pictures/weekdiff.mjs compares them on a real
// archive.
//
//   groupSteps(entries, { since, now, same, memo, sliceMs })  a generator: yields every sliceMs, returns raw groups
//   scoreGroups(raw)                                          the week as archive.week() returns it
//   groupWeek(entries, opts) / groupWeekAsync(entries, opts)  both together

/** The words the news desk's sameStory reads from an airing: two tellings with the same words get the same answer. */
export function wordsOf(e) {
  return `${e.id}\u0001${e.category ?? ''}\u0001${e.source ?? ''}\u0001${e.title ?? ''}\u0001${e.summary ?? ''}\u0001${Array.isArray(e.kw) ? e.kw.join(' ') : ''}`;
}

const SPAN = 2 ** 22; // (ordinals of word sets: up to four million a memo)

/**
 * `same(o, e)` for the walk: its answer for each pair of word sets and states asked once an edition, and kept in `memo`
 * ({}, filled here) across editions for two airings both already read: each set of words an ordinal, and a row of
 * bytes an ordinal (0 not asked, 1 no, 2 yes). An answer given again puts on the airings what sameStory would have
 * put on them (their keywords), so every later answer is the one the old walk got.
 */
export function answerOf(same, memo = null) {
  const ids = memo ? (memo.ids ||= new Map()) : new Map();
  const rows = memo ? (memo.rows ||= []) : null;
  const ords = new WeakMap(); // (a copy's ordinal, worked out once: its words are long)
  const ord = (e) => {
    let n = ords.get(e);
    if (n === undefined) {
      const w = wordsOf(e);
      n = ids.get(w);
      if (n === undefined) ids.set(w, (n = ids.size));
      ords.set(e, n);
    }
    return n;
  };
  const read = (e) => e.kw !== undefined && e.kw !== null;
  const asked = new Map(); // this edition: (word sets, states) -> { v, kwO, kwE }
  const answer = (o, e) => {
    const ro = read(o);
    const re = read(e);
    const a = ord(o);
    const b = ord(e);
    const key = ((a * 2 + (ro ? 1 : 0)) * SPAN + b) * 2 + (re ? 1 : 0);
    const hit = asked.get(key);
    if (hit) {
      answer.reused++;
      if (hit.kwO && !ro) o.kw = hit.kwO;
      if (hit.kwE && !re) e.kw = hit.kwE;
      return hit.v;
    }
    let v;
    const row = rows && ro && re ? rows[a] : null;
    if (row && b < row.length && row[b]) v = row[b] === 2;
    else {
      v = !!same(o, e);
      if (rows && ro && re) {
        let r = rows[a];
        if (!r || b >= r.length) {
          const grown = new Uint8Array(Math.max(64, ids.size + 256));
          if (r) grown.set(r);
          rows[a] = r = grown;
        }
        r[b] = v ? 2 : 1;
      }
    }
    asked.set(key, { v, kwO: !ro && read(o) ? o.kw : null, kwE: !re && read(e) ? e.kw : null });
    return v;
  };
  answer.reused = 0;
  return answer;
}

/**
 * The groups, raw ({ ids, entries }), in the order they began. A generator that yields whenever `sliceMs` have gone by
 * (weekAsync hands the event loop back then). `entries` in the archive's order, oldest first.
 */
export function* groupSteps(entries, { since = -Infinity, now = Infinity, same = null, memo = null, sliceMs = Infinity } = {}) {
  const list = entries.slice(); // (what is archived meanwhile waits for the next edition)
  const groups = [];
  const groupOf = new Map(); // story id -> its group (a story is in one group only)
  let t0 = performance.now();
  const answer = same ? answerOf(same, memo) : null;
  // sameStory keeps what it has read on the airing it reads (its keywords, its place); each edition reads fresh copies,
  // so an edition groups as the first after a restart would, whatever was read before (the quiz desk reads the same
  // airings): never one that depends on how often the week was grouped
  const copies = new Map();
  const fresh = (e) => {
    let c = copies.get(e);
    if (!c) {
      c = { ...e };
      if (!Array.isArray(c.kw)) delete c.kw;
      delete c.ev;
      delete c.where;
      copies.set(e, c);
    }
    return c;
  };
  for (const e of list) {
    if (e.at < since || e.at > now) continue;
    let g = groupOf.get(e.id);
    if (!g && answer) {
      // the groups in the order they began, each airing of the same section in its order, until one is the same event
      search: for (const x of groups) {
        for (const o of x.entries) {
          if (o.category !== e.category) continue;
          if (answer(fresh(o), fresh(e))) {
            g = x;
            break search;
          }
          if (performance.now() - t0 > sliceMs) {
            yield;
            t0 = performance.now();
          }
        }
      }
    }
    if (!g) groups.push((g = { ids: new Set(), entries: [] }));
    g.ids.add(e.id);
    groupOf.set(e.id, g);
    g.entries.push(e);
    if (performance.now() - t0 > sliceMs) {
      yield;
      t0 = performance.now();
    }
  }
  return groups;
}

/** The week as archive.week() returns it: each group's figures, the most told first. */
export function scoreGroups(groups) {
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  return groups
    .map((g) => {
      const es = g.entries;
      const best = [...es].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0) || (a.roundup ? 1 : 0) - (b.roundup ? 1 : 0))[0];
      const programmes = new Set(es.map((e) => e.programId));
      const daysTold = new Set(es.map((e) => dayKey(e.at)));
      const leads = es.filter((e) => e.rank === 0).length;
      return {
        key: [...g.ids][0],
        ids: [...g.ids],
        entries: es,
        first: es[0].at,
        last: es.at(-1).at,
        times: es.length,
        programmes: [...programmes],
        days: [...daysTold].sort(),
        best,
        latest: es.at(-1),
        category: best.category,
        score: es.length + 1.5 * programmes.size + 2 * daysTold.size + 2 * leads + (es.some((e) => e.breaking) ? 3 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.last - a.last);
}

export function groupWeek(entries, opts = {}) {
  const steps = groupSteps(entries, { ...opts, sliceMs: Infinity });
  let r = steps.next();
  while (!r.done) r = steps.next();
  return scoreGroups(r.value);
}

export async function groupWeekAsync(entries, { breathe = () => new Promise((resolve) => setImmediate(resolve)), sliceMs = 20, ...opts } = {}) {
  const steps = groupSteps(entries, { ...opts, sliceMs });
  let r = steps.next();
  while (!r.done) {
    await breathe();
    r = steps.next();
  }
  await breathe();
  return scoreGroups(r.value);
}
