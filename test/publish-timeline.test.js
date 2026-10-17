// The publishing desk's timeline and cut (server/publish/timeline.js, render.js; docs/publishing/clips.md §3-4): a
// recording's report placed on the episode to the word, the clip's window on whole frames that opens on the first
// frame of a fresh shot and never inside a word, the ffmpeg graph, the caption files and the contact sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceRanges, wordsAt, sentencesAt, buildTimeline, estimateTimeline, cutsAround, segmentAt } from '../server/publish/timeline.js';
import { clipWindow, composeArgs, srtFor, vttFor, cuesFor, contactTimes, contactArgs, FPS, WEATHER_WIPE } from '../server/publish/render.js';

/** A segment with its recorded voice's word marks (every word 0.3 s, a phrase per sentence). */
function voiced(text, anchor = 'A', extra = {}) {
  const words = [];
  const re = /\S+/g;
  let m;
  let t = 0.05;
  while ((m = re.exec(text))) {
    words.push({ t: +t.toFixed(3), char: m.index, len: m[0].length });
    t += 0.3;
  }
  const phrases = sentenceRanges(text).map((r) => {
    const ws = words.filter((w) => w.char >= r.from && w.char < r.to);
    return { t: ws[0].t, dur: ws.length * 0.3 - 0.05, char: r.from, len: r.to - r.from };
  });
  return { type: 'story', anchor, text, audio: { url: '/api/voice/x.ogg', duration: +(t + 0.1).toFixed(3), words, phrases }, ...extra };
}

const EP = {
  id: 'ep1',
  program: { id: 'cosmos', title: 'COSMOS DESK' },
  segments: [
    voiced('Good evening. This is COSMOS DESK.', 'A', { type: 'intro' }),
    voiced('A rare family of barn owls has moved into Manhattan. New Yorkers are delighted.', 'A', { storyId: 's1', headline: 'Barn owls move to Manhattan' }),
    voiced('Texas. Logged.', 'B', { type: 'chat' }),
  ],
};
const REPORT = {
  seconds: 30,
  events: [
    { type: 'shot', shot: 'studio', v: 0 },
    { type: 'speak', slot: 'A', text: 'Good evening. This is COSMOS DESK.', v: 2.0 },
    { type: 'clip', va: 2.12, duration: 2.5, v: 2.0 },
    { type: 'shot', shot: 'full', v: 6.9 },
    { type: 'speak', slot: 'A', text: 'A rare family of barn owls has moved into Manhattan.', v: 7.0 },
    { type: 'clip', va: 7.12, duration: 4.4, v: 7.0 },
    { type: 'shot', shot: 'studio', v: 12.4 },
    { type: 'speak', slot: 'B', text: 'Texas. Logged.', v: 13.0 },
    { type: 'clip', va: 13.12, duration: 0.8, v: 13.0 },
  ],
};

test('sentenceRanges finds every sentence with its characters in the source', () => {
  const text = 'One sentence here.  Two  more words! And a third?';
  const r = sentenceRanges(text);
  assert.equal(r.length, 3);
  for (const s of r) assert.equal(text.slice(s.from, s.to).replace(/\s+/g, ' ').trim(), s.text);
});

test('wordsAt and sentencesAt put every word and sentence in recording time', () => {
  const seg = EP.segments[1];
  const ws = wordsAt(seg, 10);
  assert.equal(ws[0].w, 'A');
  assert.equal(ws[0].at, 10.05);
  for (let i = 1; i < ws.length; i++) assert.ok(ws[i].at >= ws[i - 1].at && ws[i - 1].end <= ws[i].at + 1e-9);
  const ss = sentencesAt(seg, 10, ws);
  assert.equal(ss.length, 2);
  assert.ok(ss[0].end <= ss[1].start, 'the first sentence ends before the second starts');
});

test('buildTimeline matches each speak to its segment and starts it at its recorded clip', () => {
  const tl = buildTimeline(EP, REPORT);
  assert.deepEqual(tl.segments.map((s) => s.index), [0, 1, 2]);
  assert.equal(tl.segments[1].start, 7.12, 'the clip, not the speak event');
  assert.equal(tl.duration, 30);
  assert.deepEqual(tl.shots.map((s) => s.at), [0, 6.9, 12.4]);
  assert.equal(segmentAt(tl, 2).slot, 'B');
  assert.deepEqual(cutsAround(tl, 7.2), { before: 6.9, after: 12.4 });
});

test('a segment that did not air is left out of the timeline', () => {
  const tl = buildTimeline(EP, { events: REPORT.events.filter((e) => !(e.v >= 12)) });
  assert.deepEqual(tl.segments.map((s) => s.index), [0, 1]);
});

test('estimateTimeline places every spoken segment in order without a recording', () => {
  const tl = estimateTimeline(EP, { open: 5, gap: 1 });
  assert.equal(tl.measured, false);
  assert.equal(tl.segments[0].start, 5);
  for (let i = 1; i < tl.segments.length; i++) assert.ok(tl.segments[i].start > tl.segments[i - 1].end);
});

test('clipWindow opens on the first whole frame after a cut, never after the first word, and on whole frames', () => {
  const tl = buildTimeline(EP, REPORT);
  const moment = { start: tl.segments[1].sentences[0].start, end: tl.segments[1].sentences[1].end };
  const w = clipWindow(moment, tl);
  assert.equal(w.snappedStart, true);
  // the cut's event at 6.9 s: the picture changes from the next frame
  assert.ok(w.start > 6.9 && w.start <= 6.9 + 2 / FPS + 1e-9, `start ${w.start}`);
  assert.ok(w.start <= moment.start, 'never after the first word');
  assert.ok(Math.abs(w.start * FPS - Math.round(w.start * FPS)) < 1e-6 && Math.abs(w.end * FPS - Math.round(w.end * FPS)) < 1e-6);
  // the next cut (12.4 s) is within 1.2 s of the last word: the clip ends a frame before it
  assert.equal(w.snappedEnd, true);
  assert.ok(w.end < 12.4 && w.end >= moment.end);
});

test('clipWindow with no cut nearby keeps a breath before and after the words', () => {
  const tl = { segments: [], shots: [] };
  const w = clipWindow({ start: 10, end: 20 }, tl);
  assert.ok(Math.abs(w.start - 9.7) < 0.04 && Math.abs(w.end - 20.55) < 0.04);
});

test('composeArgs: the window, the hook for the whole vertical clip, the end card, a nearest-neighbour 5x', () => {
  const window = { start: 12.5, end: 40, duration: 27.5 };
  const v = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4' });
  const graph = v[v.indexOf('-filter_complex') + 1];
  assert.ok(v.includes('-ss') && v[v.indexOf('-ss') + 1] === '12.500');
  assert.match(graph, /overlay=0:0:eof_action=repeat/, 'vertical: the hook all clip long');
  assert.match(graph, /scale=iw\*5:ih\*5:flags=neighbor/);
  assert.match(graph, /concat=n=2:v=1:a=1/);
  assert.ok(v.includes('+faststart'));
  const h = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: null, window, format: 'horizontal', out: 'o.mp4', hookSeconds: 4 });
  assert.match(h[h.indexOf('-filter_complex') + 1], /enable='lt\(t,4\)'/, 'horizontal: the first seconds only');
});

test('the caption files: cues from the words, never overlapping, two lines at most, inside the window', () => {
  const tl = buildTimeline(EP, REPORT);
  const window = { start: 7, end: 12.3, duration: 5.3 };
  const cues = cuesFor(tl, window);
  assert.ok(cues.length >= 2);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].start >= 0 && cues[i].end <= window.duration + 1e-9 && cues[i].end > cues[i].start);
    if (i) assert.ok(cues[i].start >= cues[i - 1].end);
  }
  const srt = srtFor(tl, window);
  assert.match(srt, /^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\n/);
  assert.match(vttFor(tl, window), /^WEBVTT\n\n/);
  assert.ok(!/Texas/.test(srt), 'a word after the window is not captioned');
});

test('the contact sheet: frames from the open, the hook, the body and the end card, one input split', () => {
  const times = contactTimes(36, 2.6);
  assert.ok(times.length >= 8 && times[0] === 0);
  assert.ok(times.some((t) => t > 36 - 2.6), 'the end card is on the sheet');
  const a = contactArgs({ clip: 'c.mp4', format: 'vertical', times, out: 'c.png' });
  const g = a[a.indexOf('-filter_complex') + 1];
  assert.match(g, /split=\d+/);
  assert.match(g, /xstack/);
  assert.equal((g.match(/\[0:v\]/g) || []).length, 1, 'the input is read once');
});

test('clipWindow: no cut event, the clip opens on the segment\'s hand-over, never on the last sentence\'s caption', () => {
  // WORLD WEATHER draws its own shots: no cut events, only the hand-over of each segment to the voice
  const ep = { segments: [voiced('Keep watching.', 'A', { type: 'weather' }), voiced('And here is the next three days.', 'A', { type: 'weather' })] };
  const report = { events: [
    { type: 'speak', slot: 'A', text: 'Keep watching.', v: 10 },
    { type: 'clip', va: 10.12, duration: 1.4, v: 10 },
    { type: 'speak', slot: 'A', text: 'And here is the next three days.', v: 11.6 },
    { type: 'clip', va: 11.72, duration: 2.2, v: 11.6 },
  ] };
  const tl = buildTimeline(ep, report);
  assert.equal(tl.segments[1].spokeAt, 11.6);
  const m = { from: 1, to: 1, start: tl.segments[1].sentences[0].start, end: tl.segments[1].sentences[0].end, trimmed: false };
  const w = clipWindow(m, tl);
  assert.ok(w.start > 11.6 && w.start < m.start, `${w.start}`);
  const prevEnd = tl.segments[0].sentences[0].end;
  assert.ok(w.start >= prevEnd + 0.39 - 1 / FPS, 'the last sentence\'s caption has gone');
  // the horizontal board wipes in from the hand-over: the clip holds the first whole frame after the wipe over it
  assert.equal(w.hold, 0, 'no wipe, no hold');
  const wiped = clipWindow(m, tl, { wipeIn: WEATHER_WIPE });
  assert.equal(wiped.start, w.start, 'the same cut: the first word is kept');
  assert.ok(wiped.start + wiped.hold > 11.6 + WEATHER_WIPE && wiped.start + wiped.hold <= 11.6 + WEATHER_WIPE + 2 / FPS + 1e-9, `${wiped.hold}`);
  assert.ok(Math.abs(wiped.hold * FPS - Math.round(wiped.hold * FPS)) < 1e-6, 'on a whole frame');
  const g = composeArgs({ master: 'm.mkv', hook: null, endcard: null, window: wiped, format: 'horizontal', out: 'o.mp4' });
  const graph = g[g.indexOf('-filter_complex') + 1];
  assert.match(graph, new RegExp(`trim=start=${wiped.hold.toFixed(3)},setpts=PTS-STARTPTS,tpad=start_duration=${wiped.hold.toFixed(3)}:start_mode=clone`));
  assert.doesNotMatch(composeArgs({ master: 'm.mkv', window: w, format: 'horizontal', out: 'o.mp4' }).join(' '), /tpad/);
  // a moment that starts on a later sentence of its segment: the breath before it, after the sentence before
  const later = { from: 1, to: 1, start: 30, end: 33, trimmed: true };
  const w2 = clipWindow(later, { segments: [{ index: 1, spokeAt: 20, sentences: [{ start: 28, end: 29.2 }, { start: 30, end: 33 }] }], shots: [] });
  assert.ok(Math.abs(w2.start - 29.7) < 1 / FPS, `the breath, after the last caption: ${w2.start}`);
  // back to back (a quarter second apart): the new sentence replaces the old caption; the cut stays before the word
  const w3 = clipWindow(later, { segments: [{ index: 1, spokeAt: 20, sentences: [{ start: 28, end: 29.9 }, { start: 30, end: 33 }] }], shots: [] });
  assert.ok(w3.start > 29.9 && w3.start < 30, `${w3.start}`);
});

test('WEATHER_WIPE is the weather scene\'s own wipe', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../public/js/scenes/weather/index.js', import.meta.url), 'utf8');
  const m = /const WIPE_DUR = ([\d.]+);/.exec(src);
  assert.ok(m, 'the weather scene names its wipe WIPE_DUR');
  assert.equal(Number(m[1]), WEATHER_WIPE);
});
