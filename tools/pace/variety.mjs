#!/usr/bin/env node
// Visual variety, measured (docs/roadmap/critique/visual-variety.md): plays a saved episode (a /api/queue episode, as
// tools/quiz/onair.mjs and tools/sport/onair.mjs save it) through the real director on the fake clock, with the v2
// direction (the planner that cuts the stories on air) and each line at its recorded length (15 characters a second
// when it has none), and measures what the viewer sees: every visible shot named by public/js/variety.js (its group,
// kind and layout), the share of presenters, boards, pictures and maps, the longest shot and the longest run of one
// kind, layouts twice in a row, the most repeated layout, the distinct kinds in every minute, and the programme's
// standard (VARIETY) with its breaches.
//
//   node tools/pace/variety.mjs episode.json [--timeline] [--json out.json] [--default]
//
// `--default` plays the old renderer's director path (no v2 planner). The recordings themselves are the proof; this is
// the quick measure between them.
import { sportOfKicker, iconOf } from '../../public/js/scenes/cards-sport.js';
import fs from 'node:fs';
import { Director } from '../../public/js/director.js';
import { splitSentences } from '../../public/js/audio/sentences.js';
import { fakeClock, speechMarks } from './fakeplay.mjs';
import { varietyReport, varietyFaults, shotLayout, VARIETY } from '../../public/js/variety.js';
import { HALF_NOTE } from '../../public/js/quizplay.js';

/**
 * Play `ep` on the fake clock: { shots (visible cuts: { t, shot, framing, focus, card }), says, end }. Each line lasts
 * its recording (seg.audio.duration, its sentences in proportion to their characters), else 15 characters a second.
 */
export async function playForVariety(ep, { v2 = true, channel = null, startLag = 0.3 } = {}) {
  const lengths = new Map();
  for (const s of ep.segments || []) if (s?.text && Number.isFinite(s?.audio?.duration)) lengths.set(s.text, s.audio.duration);
  const clock = fakeClock();
  const log = { shots: [], says: [], end: 0 };
  let d;
  try {
    const audio = {
      mode: 'mute',
      setVoices() {},
      stop() {},
      playTune: () => ({ stop() {} }),
      sfx() {},
      speak(text, slot, { onSentence, marks = [], onMark } = {}) {
        return new Promise((resolve) => {
          const lines = splitSentences(text);
          const total = lengths.get(text);
          const chars = lines.reduce((a, l) => a + l.length, 0) || 1;
          // (recorded: the sentences share the clip's length by their characters, the pauses inside it)
          const dur = (l, i) => (Number.isFinite(total) ? (total * l.length) / chars : l.length / 15 + (i + 1 < lines.length ? 0.3 : 0));
          const say = { text, slot, on: clock.now(), off: null };
          log.says.push(say);
          if (typeof onMark === 'function') {
            const k = Number.isFinite(total) ? total / Math.max(0.1, chars / 15 + 0.3 * (lines.length - 1)) : 1;
            speechMarks(text, lines, marks).forEach((t, j) => setTimeout(() => onMark(j), t * k * 1000));
          }
          let i = 0;
          const step = () => {
            if (i >= lines.length) {
              say.off = clock.now();
              resolve();
              return;
            }
            onSentence?.(lines[i], i);
            const dd = dur(lines[i], i);
            i++;
            setTimeout(step, dd * 1000);
          };
          step();
        });
      },
    };
    d = new Director({ audio, channel: channel || { name: 'GLOBIT 24', slogan: '', presenters: {}, programs: {} }, v2 });
    if (v2) await d.v2ready;
    // (the recorded voice as on air: the v2 plan is timed on its words)
    d.voices = { episode() {}, audioFor: (seg) => Promise.resolve(seg?.audio?.url ? seg.audio : null), refreshAds() {}, prepareAd() {}, adLine: () => null };
    d.prepareImages = async () => {};
    d.loadQuizPicture = (q) => Promise.resolve({ picture: q.imageId || q.key, width: 64, height: 32 });
    for (const r of ep.rundown || []) if (r.hasImage) d.images.set(r.storyId, { small: {}, full: {}, card: {} });
    d.music.countdown = (halves, lead = 0.05) => {
      const start = lead + startLag;
      return { start, ticks: Array.from({ length: halves }, (_, i) => start + i * HALF_NOTE), end: start + halves * HALF_NOTE, half: HALF_NOTE };
    };
    const setShot = d.setShot.bind(d);
    d.setShot = (shot, extra = {}) => {
      const seen = d.seenSince;
      const since = d.scene.shotSince;
      setShot(shot, extra);
      const s = d.scene;
      // a visible cut: the director's own mark (a re-set of the same wide is none; v2: a new framing is one)
      // (the card as it is at the cut: a question's board and its reveal view are one card object, its view a field)
      const card = s.card ? { ...s.card, o: s.card.o ? { ...s.card.o } : s.card.o } : null;
      if (card && s.shot === 'montage') card.look = montageLook(ep, s.rundown?.[card.index]);
      if (d.seenSince !== seen || (s.shotSince !== since && shot !== 'wide')) log.shots.push({ t: clock.now(), shot: s.shot, framing: s.framing ?? null, focus: s.focus ?? null, card });
    };
    await clock.run(d.playEpisode(structuredClone(ep)));
    log.end = clock.now();
  } finally {
    clock.restore();
  }
  // the body ends where the end card starts
  const endCard = log.shots.find((x) => x.shot === 'endcard');
  log.bodyEnd = endCard ? endCard.t : log.end;
  return log;
}

/**
 * What fills a headline frame (studio.js 'montage'): its picture, its footage, its place on the map, FULL TIME's sport
 * emblem (cards-sport-more.js drawSportBackdrop), else the headline alone.
 */
function montageLook(ep, item) {
  if (!item) return 'text';
  if (item.hasImage) return 'picture';
  if (item.footage?.id) return 'footage';
  if (Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lon)) return 'map';
  const key = ep?.program?.theme === 'sport' ? sportOfKicker(item.kicker) : null;
  if (key && iconOf(key)) return `sport:${key}`;
  return 'text';
}

/** The report of an episode against its programme's standard. */
export async function measureVariety(ep, opts = {}) {
  const id = ep?.program?.id || opts.programId || null;
  const V = VARIETY[id] || {};
  const log = await playForVariety(ep, opts);
  const shots = log.shots.filter((x) => x.t <= log.bodyEnd + 1e-6);
  const report = varietyReport(shots, { end: log.bodyEnd, window: V.window || 60, maxShot: V.maxShot ?? Infinity, maxStudio: V.maxStudio ?? Infinity, limits: V.limits || null, minShot: V.minShot || 0 });
  return { id, report, faults: varietyFaults(report, id), log };
}

async function cli() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/pace/variety.mjs episode.json [--timeline] [--json out.json] [--default]');
    process.exit(1);
  }
  const ep = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { id, report, faults, log } = await measureVariety(ep, { v2: !process.argv.includes('--default') });
  if (process.argv.includes('--timeline')) {
    const t0 = log.shots.find((x) => x.shot !== 'open')?.t ?? 0;
    log.shots.forEach((x, i) => {
      const len = (i + 1 < log.shots.length ? log.shots[i + 1].t : log.bodyEnd) - x.t;
      console.log(`${(x.t - t0).toFixed(2).padStart(7)}  ${len.toFixed(2).padStart(6)}  ${shotLayout(x).layout}`);
    });
  }
  const j = process.argv.indexOf('--json');
  if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ id, report, faults }, null, 1));
  console.log(JSON.stringify({ id, ...report, repeats: report.repeats.slice(0, 8) }, null, 1));
  console.log(faults.length ? `STANDARD BREACHED (${faults.length}):\n  ${faults.join('\n  ')}` : 'standard held');
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
