#!/usr/bin/env node
// How long can a viewer watch GLOBIT 24 without seeing the channel's ident (the AI disclosure since 18 Oct:
// docs/publishing/compliance.md §2.10, §3.1)? The station runs a whole day on a fake clock with the real channel
// (config/channel.json: the rotation, NEWS IN 60 pinned to :00 and :30, the dayparts, the break cadence), every item
// airing for its expected length (server/station.js episodeAir, breakAir), and the director's rule for the ident
// (public/js/pace.js identBefore: before every programme; before a filler break once CHANNEL.ident.refresh s have
// passed). Only idents count: the ads, the bumpers and the promos carry no disclosure.
//
//   node tools/compliance/ident-gaps.mjs [--lengths mid|max] [--day 2026-10-19] [--outage 14:00+30]
//
// --lengths  each programme as long as the middle of its targetSeconds (mid, the default) or its top plus 10 % (max)
// --outage   no programme can be made for that many minutes from that London time (the channel plays filler breaks,
//            then replays the last programme): the worst case for the gap
//
//   measureIdentGaps({ start, hours, lengths, outage, channel }) -> { longest, at, idents, gaps, items }
//     longest  the longest stretch (s) with no ident on screen; at: when it began (ms); gaps: every stretch (s)
import { fileURLToPath } from 'node:url';
import { Station, episodeAir, breakAir } from '../../server/station.js';
import { loadChannel } from '../../server/channel.js';
import { identBefore, IDENT_AIR } from '../../public/js/pace.js';

const silent = { info() {}, warn() {}, error() {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Run the channel on a fake clock from `start` (ms) for `hours`: when each ident aired, and the stretches between. */
export async function measureIdentGaps({ start, hours = 24, lengths = 'mid', outage = null, channel = loadChannel() } = {}) {
  let t = start;
  let n = 0;
  const down = (at) => !!outage && at >= outage.from && at < outage.to;
  const producer = {
    canProduce: () => !down(t),
    async produce(ch, id) {
      if (down(t)) return null;
      const [lo, hi] = ch.programs[id].targetSeconds || [300, 300];
      const air = lengths === 'max' ? hi * 1.1 : (lo + hi) / 2;
      return { kind: 'episode', id: `e${n++}`, program: { id, title: ch.programs[id].title }, segments: [{ audio: { duration: Math.max(1, air - 12) } }] };
    },
  };
  const station = new Station({
    config: { queueSize: 2, clock: true, now: () => t },
    newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
    producer,
    chain: { status: () => [] },
    channel: () => channel,
    log: silent,
  });
  await station.fill();
  const idents = []; // { at, until } ms
  const items = [];
  let lastIdent = -Infinity;
  while (t < start + hours * 3600_000) {
    const item = station.next();
    if (!item) {
      t += 6000; // standby: the director retries every 6 s
      await station.fill();
      continue;
    }
    const since = (t - lastIdent) / 1000;
    const ident = identBefore(item, since);
    if (ident) {
      idents.push({ at: t, until: t + IDENT_AIR * 1000 });
      lastIdent = t;
    }
    // (an episode's episodeAir already counts its ident; a filler break's ident is added to it)
    const air = item.kind === 'episode' ? episodeAir(item) : breakAir(item) + (ident ? IDENT_AIR : 0);
    items.push({ at: t, kind: item.kind, id: item.program?.id || null, filler: !!item.filler, replay: !!item.replay, ident, air });
    t += air * 1000;
    for (let i = 0; i < 10; i++) await tick();
    if (item.kind === 'break') await station.fill(); // (the server's own timer refills an empty queue during breaks)
  }
  const gaps = [];
  let longest = 0;
  let at = null;
  for (let i = 1; i < idents.length; i++) {
    const g = (idents[i].at - idents[i - 1].until) / 1000;
    gaps.push(g);
    if (g > longest) {
      longest = g;
      at = idents[i - 1].until;
    }
  }
  return { longest, at, idents, gaps, items };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const day = opt('day', '2026-10-19');
  const tz = (d) => (Date.parse(`${d}T12:00:00+01:00`) && new Date(`${d}T12:00:00Z`).getUTCMonth() >= 2 && new Date(`${d}T12:00:00Z`) < new Date('2026-10-25T01:00:00Z') ? '+01:00' : '+00:00');
  const start = Date.parse(`${day}T00:00:00${tz(day)}`);
  let outage = null;
  if (opt('outage', null)) {
    const [hm, mins] = opt('outage').split('+');
    const from = Date.parse(`${day}T${hm}:00${tz(day)}`);
    outage = { from, to: from + Number(mins || 30) * 60_000 };
  }
  const r = await measureIdentGaps({ start, hours: 24, lengths: opt('lengths', 'mid'), outage });
  const fmt = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false });
  const sorted = [...r.gaps].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  console.log(`${day} (London), programmes ${opt('lengths', 'mid')}${outage ? `, no programme ${opt('outage')} min` : ''}`);
  console.log(`  ${r.idents.length} idents, ${r.items.filter((x) => x.kind === 'episode').length} programmes, ${r.items.filter((x) => x.filler).length} filler breaks`);
  console.log(`  longest stretch without the ident: ${(r.longest / 60).toFixed(1)} min (${Math.round(r.longest)} s), from ${fmt(r.at)}`);
  console.log(`  median ${(pct(0.5) / 60).toFixed(1)} min, 90th percentile ${(pct(0.9) / 60).toFixed(1)} min`);
}
