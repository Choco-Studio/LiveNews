// Lab driver for the FACES stream (owner: FACES): faces, eyes, lip sync and
// listener behaviour in isolation, deterministic for contact sheets
// (public/lab/v2-face.html; DOM-free at import so node tests can use it).
//
//   const lab = createFaceLab(canvas)
//   lab.render(t)        draw instant t (seconds) of the current mode
//   lab.set({ mode, presenter, presenters, emotion, tier, text, sample, episode, cam, k, hud, seat })
//   modes
//     'sheet'         presenters x expressions at one LOD tier (TIERS: wide s 1.0,
//                     medium s 1.75, close s 2.7, xclose s 4.0); page = floor(t)
//     'lipsync'       one presenter in a close single speaking `text` (estimated
//                     timing) or a recorded SAMPLES entry (real Kokoro word times
//                     and loudness) through the LIVE path: speech.js liveSpeech()
//                     on timelineAudio(), a stand-in for AudioEngine.speechFrame
//     'strip'         24 consecutive mouth frames at 25 fps from t (6 x 4 crops),
//                     viseme and jaw level under each
//     'conversation'  an episode (EPISODES fixture or set({ episode })) planned
//                     segment by segment with direction/index.js planSegment and
//                     performed as the runtime does (looks, nods, gestures and
//                     emotions on the rig; mouths from the speech timeline), on the
//                     two-shot / wide / planned shots, with a HUD timeline at the bottom
//   exports: timelineAudio(), buildConversation(), EPISODES, SAMPLES, TIERS
import { P } from '../../../palette.js';
import { C } from '../pixbuf.js';
import { frame, actor, drawActors } from '../scene.js';
import { SET, kAt, syOf } from '../studio/geometry.js';
import { makeCamera, placeActor, singleCam } from '../camera.js';
import { GESTURES } from '../gestures/index.js';
import { liveSpeech } from '../speech.js';
import { drawGlasses } from '../glasses.js';
import { deriveLook } from '../cast/base.js';
import { planSegment } from '../direction/index.js';
import { hashSeed } from '../direction/context.js';
import { buildTimeline, sampleTimeline, wordAtChar } from '../../../audio/visemes.js';
import { splitSentences } from '../../../audio/sentences.js';

const W = 384, H = 216;
const clipRows = new Int16Array(W);
const sheet = new Uint32Array(W * H);

// The studio set is another stream's file and may be mid-edit: load it with a
// top-level await (so the very first frame of a fresh page already has its set,
// w2-set round 2 request) and fall back to a plain ink room with a slate desk if
// the import fails, so the lab keeps working.
let SETMOD = null;
try {
  SETMOD = await import('../studio/set.js');
} catch {
  SETMOD = null;
}

function drawRoom(cam, t) {
  if (SETMOD) {
    try {
      SETMOD.drawBackground(frame, cam, t);
      SETMOD.drawDesk(frame, cam, clipRows, C.red);
      return;
    } catch { /* fall through */ }
  }
  frame.clear(C.ink);
  const top = Math.round(syOf(cam, kAt(cam, SET.deskFrontZ), 0));
  frame.rect(0, top, W, H - top, C.slate);
  frame.rect(0, top, W, 1, C.steel);
  clipRows.fill(Math.max(0, Math.min(H, top)));
}

// ---------------------------------------------------------------------------
// Speech: a deterministic stand-in for AudioEngine.speechFrame (CONTRACTS
// "audio: speech timeline"), built from the same text model the engine and
// direction/context.js use, so lab mouths and planned events share one clock.

const SENT_GAP = 0.06; // s between sentences (audio.js / context.js GAP)

function sentenceSpans(text) {
  const out = [];
  let from = 0;
  for (const p of splitSentences(text)) {
    const at = text.indexOf(p.slice(0, 12), from);
    const start = at >= 0 ? at : from;
    out.push({ text: p, start });
    from = start + p.length;
  }
  return out;
}

/**
 * One speaking turn. `t0` = the time of its FIRST WORD (the runtime's
 * speechStart). Recorded turns carry `words` [{ t, char }] (t from the start of
 * the file) and optionally `levels` { rate, values 0..1 } (loudness).
 */
function buildRun({ slot, text, t0 = 0, words = null, levels = null, lang = 'en', rate = 1 }) {
  const spans = sentenceSpans(String(text || ''));
  const sents = spans.map((s) => ({ ...s, tl: buildTimeline(s.text, { lang, rate }), begin: 0, end: 0, anchors: null }));
  const run = { slot, text, sents, levels, t0, fileStart: t0, end: t0 };
  const rec = Array.isArray(words) && words.length ? words.map((w) => (Array.isArray(w) ? { t: w[0], char: w[1] } : w)).sort((a, b) => a.t - b.t) : null;
  if (!rec) {
    // estimated (mute / blips): sentences back to back, as context.js times them
    let t = 0;
    for (const s of sents) {
      s.begin = t;
      s.end = t + s.tl.total / 1000;
      t = s.end + SENT_GAP;
    }
    const lead = sents.length && sents[0].tl.words.length ? sents[0].tl.words[0].t0 / 1000 : 0;
    run.fileStart = t0 - lead;
  } else {
    // recorded: each sentence anchored to its recorded words (as AudioEngine #playRecorded)
    const lead = rec[0].t;
    run.fileStart = t0 - lead;
    const total = rec[rec.length - 1].t + 1;
    sents.forEach((s, i) => {
      const a = s.start, b = i + 1 < sents.length ? sents[i + 1].start : Infinity;
      const mine = rec.filter((w) => w.char >= a && w.char < b);
      s.begin = mine.length ? mine[0].t : (a / Math.max(1, text.length)) * total;
      const anchors = [];
      for (const w of mine) {
        let wi = wordAtChar(s.tl, w.char - a);
        const prev = anchors[anchors.length - 1];
        if (prev && wi <= prev.w && s.tl.words[prev.w + 1] && s.tl.words[prev.w + 1].ci === s.tl.words[prev.w].ci) wi = prev.w + 1;
        if (!prev || wi > prev.w) anchors.push({ at: w.t, w: wi, tt: s.tl.words[wi].t0 / 1000 });
      }
      let pace = 1;
      let end = s.begin + s.tl.total / 1000;
      if (anchors.length >= 2) {
        const f = anchors[0], l = anchors[anchors.length - 1];
        const span = l.tt - f.tt;
        pace = span > 0.05 ? Math.min(2, Math.max(0.5, (l.at - f.at) / span)) : 1;
        end = l.at + (s.tl.total / 1000 - l.tt) * pace;
      }
      s.end = end;
      s.anchors = anchors;
      s.pace = pace;
    });
    for (let i = 0; i + 1 < sents.length; i++) sents[i].end = Math.min(sents[i].end, sents[i + 1].begin);
  }
  run.end = run.fileStart + (sents.length ? sents[sents.length - 1].end : 0);
  return run;
}

/** Timeline ms of sentence `s` at file time x (s): piecewise linear through the recorded anchors. */
function timelineMs(s, x) {
  const A = s.anchors;
  if (!A || !A.length) return (x - s.begin) * 1000;
  if (x <= A[0].at) return (A[0].tt + (x - A[0].at)) * 1000;
  for (let i = 0; i + 1 < A.length; i++) {
    const a = A[i], b = A[i + 1];
    if (x < b.at) return (a.tt + ((x - a.at) * (b.tt - a.tt)) / Math.max(1e-3, b.at - a.at)) * 1000;
  }
  const l = A[A.length - 1];
  return (l.tt + (x - l.at) / (s.pace || 1)) * 1000;
}

/** The clip's raw loudness at file time x, mapped as AudioEngine.loudness() maps the envelope. */
function loudAt(levels, x) {
  if (!levels) return 1;
  const vals = levels.values;
  const n = vals.length;
  const at = (i) => (i < 0 || i >= n ? 0 : typeof vals === 'string' ? (vals.charCodeAt(i) - 48) / 74 : Number(vals[i]) || 0);
  const u = x * levels.rate, i = Math.floor(u);
  const v = at(i) + (at(i + 1) - at(i)) * (u - i);
  return Math.min(1, Math.max(0, (v - 0.2) / 0.75));
}

/**
 * The loudness as AudioEngine.loudness() reports it at file time x: the mapped envelope
 * through the engine's one-pole smoothing (25 ms to open, 60 ms to close). The engine keeps
 * that filter as state; here it is re-run over the last 0.3 s, so any instant is pure in x.
 */
function smoothLoudAt(levels, x) {
  if (!levels) return 1;
  let v = 0;
  for (let k = 60; k >= 0; k--) {
    const target = loudAt(levels, x - k * 0.005);
    v += (target - v) * (1 - Math.exp(-5 / (target > v ? 25 : 60)));
  }
  return v;
}

const SCRATCH = {};

/**
 * A stand-in for the AudioEngine's mouth (labs and tests): { speechFrame(nowMs, slot, out?), runs, end }.
 * items: [{ slot, text, t0 (s, first word), words?, levels?, lang?, rate? }]
 * It samples the audio stream's own timelines (buildTimeline / sampleTimeline) and maps the
 * loudness like the engine (smoothed; `level` = timeline level x min(1, 0.25 + 0.9 x loudness)),
 * and sends the proposed `voice` field (the smoothed loudness while a recording plays, else -1;
 * CONTRACTS request to the audio stream). One difference, on purpose: the engine re-anchors its
 * clock only when a recorded word is reached and eases the correction, while this stand-in
 * interpolates between the recorded words (it knows the next anchor in advance), so its timing
 * is OPTIMISTIC. Lip-sync acceptance is measured through the real AudioEngine
 * (test/v2-face.test.js "real AudioEngine"), never through this stand-in.
 */
export function timelineAudio(items) {
  const runs = items.map(buildRun);
  const end = runs.reduce((m, r) => Math.max(m, r.end), 0);
  return {
    runs,
    end,
    speechFrame(now, slot, out) {
      const f = out && typeof out === 'object' ? out : {};
      f.slot = slot ?? null;
      f.speaking = false;
      f.level = 0;
      f.voice = -1;
      f.viseme = 'rest';
      f.next = 'rest';
      f.mix = 0;
      f.wordIndex = -1;
      f.charIndex = -1;
      f.sentenceIndex = -1;
      f.accent = 0;
      f.pause = false;
      const t = now / 1000;
      for (const r of runs) {
        if (r.slot !== slot) continue;
        const x = t - r.fileStart;
        const playing = r.levels && x >= 0 && x <= r.end - r.fileStart + 0.3;
        const loud = playing ? smoothLoudAt(r.levels, x) : 0;
        if (playing) f.voice = loud;
        for (let i = 0; i < r.sents.length; i++) {
          const s = r.sents[i];
          if (x < s.begin - 0.07 || x > s.end + 0.07) continue;
          const sm = sampleTimeline(s.tl, timelineMs(s, x), SCRATCH);
          f.speaking = sm.speaking;
          f.level = Math.max(0, Math.min(1, r.levels ? sm.level * Math.min(1, 0.25 + loud * 0.9) : sm.level));
          f.viseme = sm.viseme;
          f.next = sm.next;
          f.mix = sm.mix;
          f.wordIndex = sm.wordIndex;
          f.charIndex = sm.charIndex;
          f.accent = sm.accent;
          f.pause = sm.pause;
          f.sentenceIndex = i;
          return f;
        }
        if (playing) return f;
      }
      return f;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures: five real offline episodes (trimmed from test/fixtures/v2-episodes)
// and three recorded Kokoro lines with word times and a 50 Hz loudness envelope
// (levels: one char per sample, (code - 48) / 74).

export const EPISODES = {"world-now":{"id":"emur828xi0","program":{"id":"world-now","title":"WORLD NOW","theme":"world"},"cast":{"A":"paco","B":"lola"},"segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Panama Canal reopens after a day-long closure. North Sea wind farm starts supplying power to 1.2 million homes. Lisbon opens a new riverside tram line. Good evening, and welcome to WORLD NOW. I'm Paco Pixel, with Lola Byte.","cues":[{"char":191,"action":"nod"},{"char":223,"slot":"B","action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Breaking news. Ledger Line reports that the Panama Canal has reopened to ships after fog closed it for a day. The canal authority says about 30 ships are waiting to cross.","breaking":true,"location":{"place":"PANAMA","lat":8.5,"lon":-80.8},"cues":[{"char":171,"slot":"B","action":"look_partner"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Thanks, Paco. From Ledger Line: An offshore wind farm in the North Sea has started supplying electricity. The developer says its 140 turbines can power about 1.2 million homes.","hasImage":true,"cues":[{"char":13,"action":"point_screen"},{"char":176,"slot":"A","action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Our number of the day: 40,000. Lisbon has opened a new tram line along the Tagus river, Pixelburg Post reports. The city says the 9 kilometre route will carry 40,000 passengers a day and cut car traffic in the old town. As the mayor put it: “This line will change how people move around the old town.”","feature":"number","hasImage":true,"location":{"place":"LISBON, PORTUGAL","lat":38.72,"lon":-9.14},"cues":[{"char":0,"action":"steeple"},{"char":219,"slot":"B","action":"nod"}]},{"type":"story","anchor":"B","emotion":"serious","text":"Now, around the world in 30 seconds. Heavy monsoon rain has flooded streets in several coastal towns in Kerala, India, Pixelburg Post reports.","feature":"roundup","roundup":{"index":0,"count":4},"location":{"place":"KERALA, INDIA","lat":10.5,"lon":76.3}},{"type":"story","anchor":"B","emotion":"neutral","text":"A fissure eruption has started again on the Reykjanes peninsula in Iceland.","feature":"roundup","hasImage":true,"roundup":{"index":1,"count":4},"location":{"place":"REYKJANES PENINSULA, ICELAND","lat":63.9,"lon":-22.3}},{"type":"story","anchor":"B","emotion":"neutral","text":"Venice has raised its sea barriers for a test ahead of the autumn high tides, Bitport Herald reports.","feature":"roundup","roundup":{"index":2,"count":4},"location":{"place":"VENICE, ITALY","lat":45.44,"lon":12.32}},{"type":"story","anchor":"B","emotion":"neutral","text":"A large solar plant on the edge of the Sahara in Morocco is now running at full power, Bitport Herald reports.","feature":"roundup","roundup":{"index":3,"count":4},"location":{"place":"MOROCCO","lat":31.8,"lon":-7.1}},{"type":"story","anchor":"B","emotion":"happy","text":"And finally: Scientists say coral cover has grown on parts of the Great Barrier Reef for a second year. “The reef is showing it can bounce back when it gets a break,” a lead researcher said.","feature":"lighter","location":{"place":"GREAT BARRIER REEF, AUSTRALIA","lat":-18.3,"lon":147.7},"cues":[{"char":190,"slot":"A","action":"nod"}]},{"type":"chat","anchor":"A","emotion":"happy","text":"A good note to end on.","cues":[{"char":0,"action":"nod"}]},{"type":"chat","anchor":"B","emotion":"happy","text":"Rare enough that we should enjoy it."},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's WORLD NOW. From Lola Byte and from me, thank you for watching. Stay with us on GLOBIT 24.","cues":[{"char":17,"action":"nod"}]}]},"tech-bytes":{"id":"emur828y11","program":{"id":"tech-bytes","title":"TECH BYTES","theme":"tech"},"cast":{"A":"max","B":"ada"},"segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Chipmaker unveils a laptop processor with all-day battery life. Also coming up: Startup launches satellite internet service for farms. And later, our number of the day. This is TECH BYTES. I'm Max Circuit, with Ada Volt.","cues":[{"char":63,"action":"nod"},{"char":188,"action":"nod"},{"char":220,"slot":"B","action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Circuit Weekly: A chipmaker has unveiled a new laptop processor it says can run for 20 hours on a single charge.","hasImage":true,"cues":[{"char":0,"action":"point_screen"},{"char":117,"slot":"B","action":"nod"}]},{"type":"chat","anchor":"B","emotion":"neutral","text":"And when does it reach actual people?","cues":[{"char":0,"action":"chin"}]},{"type":"chat","anchor":"A","emotion":"neutral","text":"The first laptops using it will go on sale in the spring.","cues":[{"char":0,"action":"lean_in"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Circuit Weekly reports that a startup has launched a satellite internet service designed for farms in remote areas. It says the service reaches speeds of 100 megabits per second.","cues":[{"char":178,"slot":"A","action":"look_partner"}]},{"type":"story","anchor":"A","emotion":"happy","text":"Our number of the day: about 1,500 dollars. From Circuit Weekly: A home robotics company has shown a robot vacuum that can climb stairs using two small legs. It will cost about 1,500 dollars when it launches next year.","feature":"number","cues":[{"char":0,"action":"count"},{"char":218,"slot":"B","action":"nod"}]},{"type":"story","anchor":"B","emotion":"happy","text":"And finally: Astronomers using a telescope in Chile have detected water vapour in the atmosphere of a planet 120 light years away, Starfield Journal reports. The planet is about twice the size of Earth.","feature":"lighter","hasImage":true,"location":{"place":"CHILE","lat":-35.7,"lon":-71.5},"cues":[{"char":202,"slot":"A","action":"nod"}]},{"type":"chat","anchor":"A","emotion":"happy","text":"Somewhere, a researcher is very pleased with themselves. Rightly.","cues":[{"char":0,"action":"look_partner"}]},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's TECH BYTES. From Ada Volt and from me, thanks for watching. More news around the clock on GLOBIT 24.","cues":[{"char":18,"action":"nod"}]}]},"cosmos":{"id":"emur8293p3","program":{"id":"cosmos","title":"COSMOS DESK","theme":"space"},"cast":{"A":"nova","B":"unit8"},"segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Rover finds layered rocks in an ancient lake bed on Mars. Also coming up: our number of the day. And later: Astronauts grow tomatoes on the space station. This is COSMOS DESK. I'm Dr Nova Reyes, with UNIT-8.","cues":[{"char":175,"action":"nod"},{"char":207,"slot":"B","action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"According to Starfield Journal, a Mars rover has photographed layered rocks in what scientists believe was an ancient lake bed. The layers could hold clues about past water on the planet.","cues":[{"char":187,"slot":"B","action":"look_partner"}]},{"type":"chat","anchor":"B","emotion":"neutral","text":"Logged, Dr Reyes.","cues":[{"char":0,"action":"nod"}]},{"type":"chat","anchor":"A","emotion":"neutral","text":"Thank you, UNIT-8. Our number of the day is yours.","cues":[{"char":0,"action":"look_partner"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Our number of the day: 2 million. From Circuit Weekly: A new handheld games console sold 2 million units in its first week, its maker says. Shops in Tokyo reported long queues on launch day.","feature":"number","location":{"place":"TOKYO, JAPAN","lat":35.68,"lon":139.69},"cues":[{"char":0,"action":"count"},{"char":190,"slot":"A","action":"nod"}]},{"type":"story","anchor":"A","emotion":"happy","text":"And finally: Astronauts on the International Space Station have harvested tomatoes grown in a small greenhouse, Starfield Journal reports. Scientists want to learn how to feed crews on long missions.","feature":"lighter","cues":[{"char":199,"slot":"B","action":"look_partner"}]},{"type":"chat","anchor":"B","emotion":"neutral","text":"I will keep one sensor pointed upwards, Dr Reyes. For the record."},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's COSMOS DESK. From UNIT-8 and from me, thank you for watching. Stay with us on GLOBIT 24.","cues":[{"char":19,"action":"nod"}]}]},"money-minute":{"id":"emur8298l5","program":{"id":"money-minute","title":"MONEY MINUTE","theme":"money"},"cast":{"A":"penny"},"segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Chocolate makers warn of higher prices as cocoa stays expensive. Also coming up: Rice prices ease in Asia after strong harvests. And later, our number of the day. This is MONEY MINUTE. I'm Penny Sterling.","cues":[{"char":64,"action":"nod"},{"char":184,"action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Ledger Line: Several chocolate makers say they will raise prices again because cocoa remains near record levels. Cocoa has more than doubled in price in two years.","cues":[{"char":0,"action":"lean_in"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Ledger Line reports that rice prices in Asia have fallen 8 percent since July after strong harvests in Thailand and Vietnam. Traders say supplies look healthy for the rest of the year."},{"type":"story","anchor":"A","emotion":"neutral","text":"Our number of the day: 62 percent. Thousands of small shops in Lagos have switched to solar panels to cut fuel costs. A survey found 62 percent of traders now use solar for some of their power.","feature":"number","location":{"place":"LAGOS, NIGERIA","lat":6.52,"lon":3.38},"cues":[{"char":0,"action":"steeple"}]},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's your MONEY MINUTE. I'm Penny Sterling. Stay with us on GLOBIT 24.","cues":[{"char":72,"action":"papers"}]}]},"news-60":{"id":"emur8291q2","program":{"id":"news-60","title":"NEWS IN 60","theme":"flash"},"cast":{"A":"sam"},"segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"This is NEWS IN 60. I'm Sam Night.","cues":[{"char":0,"action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Pixelburg Post: A solar farm north of Nairobi has started supplying power to the national grid. Officials say it can light around 300,000 homes and is the biggest in East Africa so far.","hasImage":true,"location":{"place":"NAIROBI, KENYA","lat":-1.29,"lon":36.82},"cues":[{"char":0,"action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Norway has opened a 27 kilometre road tunnel under a fjord on its west coast, Bitport Herald reports. The government says it cuts the journey between two cities by 40 minutes.","location":{"place":"NORWAY","lat":61,"lon":8.5}},{"type":"story","anchor":"A","emotion":"neutral","text":"Around the world. Japan's bullet trains mark a record year for punctuality, Pixelburg Post reports.","feature":"roundup","hasImage":true,"roundup":{"index":0,"count":3},"location":{"place":"JAPAN","lat":36.2,"lon":138.3}},{"type":"story","anchor":"A","emotion":"neutral","text":"Paris unveils plans to plant 170,000 trees by 2030.","feature":"roundup","hasImage":true,"roundup":{"index":1,"count":3},"location":{"place":"PARIS, FRANCE","lat":48.86,"lon":2.35}},{"type":"story","anchor":"A","emotion":"neutral","text":"Mexico City closes its historic centre to cars on Sundays, Bitport Herald reports.","feature":"roundup","roundup":{"index":2,"count":3},"location":{"place":"MEXICO CITY, MEXICO","lat":19.43,"lon":-99.13}},{"type":"story","anchor":"A","emotion":"happy","text":"Volunteers in Ghana have planted one million mangrove seedlings along the coast near Accra. The project aims to protect fishing villages from coastal erosion.","location":{"place":"ACCRA, GHANA","lat":5.6,"lon":-0.19}},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's the minute. Stay with us on GLOBIT 24."}]}};

export const SAMPLES = {
  paco: { presenter: 'paco', text: "Good evening. Markets in Mumbai moved sharply today, as the central bank promised more support for borrowers.", duration: 6.497, words: [[0.012,0,4],[0.314,5,8],[1.35,14,7],[1.838,22,2],[1.948,25,6],[2.363,32,5],[2.728,38,7],[3.204,46,6],[3.653,53,2],[3.797,56,3],[3.905,60,7],[4.313,68,4],[4.587,73,8],[5.204,82,4],[5.402,87,7],[5.803,95,3],[5.986,99,10]], levels: 'zzzzzzzzzzeL^zzzzzzzzzzzzzzzzzzzzzzzzzo`RQQJC>60000000000000000000nzzzzzzx`\\azzzochpozzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyo[jwzzzzzyzzzzzzzt^HLlzzzzzojizzzzzzzzzzzzyxwsl\\800000uzzzzr]xzzzxtrryzzzzzyqstzzzzzzzubzzzzzzzzzr_XWF80000Hdtzzzzzzzzzzs`=?]zzzzzzzzzzssqzzzsTM]jzzzzzzucRTVTXYzzzzznzzzzzzzzzzzzzvtqlge_anuurmaG000' },
  lola: { presenter: 'lola', text: "Thanks, Paco. Back home, a bumper harvest has pushed bread prices down, and bakers are cautiously pleased.", duration: 6.435, words: [[0.012,0,7],[0.381,8,5],[1.237,14,4],[1.521,19,5],[1.93,25,1],[1.976,27,6],[2.291,34,7],[2.783,42,3],[3.034,46,6],[3.419,53,5],[3.709,59,6],[4.145,66,5],[4.53,72,3],[4.714,76,6],[5.092,83,3],[5.254,87,10],[5.816,98,8]], levels: 'GYzzzzzzzzzzzwsqqpg;irvzzzzzzxSjnzzzzzzzzzu^5000000000000000UzzzzzzzhGknmozzzzzzzzzzzzzzzzmI700EzzzzpvzzzzzzpwzzzzzyxzzzzzzzzsozzzzzxnniczzzzzvndE0]`Vzzzzzzz^dh\\107kzzzzzzzzyo\\2_b]szzzzzzztnlqzzzzzshKlzzzzzzzzwutuvqtuqiC00000izzzzzzlzzzzzzzpOZlxzzzzzzzzzysyxyzzzyb60sukkmzzzzzzzzzzzzsnfyzzzztI[_TjzzzzzzxuojmhbcikliOiiF000' },
  ada: { presenter: 'ada', text: "Maybe. But a phone that folds is still a phone. Probably a more expensive one.", duration: 6.178, words: [[0.012,0,6],[1.37,7,3],[1.605,11,1],[1.66,13,5],[1.98,19,4],[2.239,24,5],[2.692,30,2],[2.852,33,5],[3.196,39,1],[3.251,41,6],[4.067,48,8],[4.673,57,1],[4.726,59,4],[5.056,64,9],[5.816,74,4]], levels: '^mzzzzzzzzzzzzzzz_dzzzzzzzzzzyqcZVRG<000000000000000000000000000000LVtzzzzzzzme^X[wzzzzzzzzzzzzzzzzpYbee`YX[zzzzzzzzzzzzzzztg_konlzzzzsooqob[uzzzzzzzzzshgb\\Zrzzzzzzzzzzzzzzzzzzxtpj\\OC90000000000000000009GEasvzzzzzruzzzsbpzzzzzzzzvzzzzzzzzzzzzzzzzzzeKhrtqoqkL0zzzzzzzukgmpolqzzzzqc^WbtzzzzzzzzzzzzzwuqokaRH;000' },
};

// ---------------------------------------------------------------------------
// Sheet: presenters x expressions at one level of detail

export const TIERS = {
  wide: { s: 1.0, tw: 48, th: 27, dy: 0.5, cols: ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking', 'talk', 'partner'] },
  medium: { s: 1.75, tw: 48, th: 54, dy: 0.5, cols: ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking', 'talk', 'partner'] },
  close: { s: 2.7, tw: 64, th: 72, dy: 0.5, cols: ['neutral', 'happy', 'serious', 'surprised', 'talk', 'partner'] },
  xclose: { s: 4.0, tw: 96, th: 108, dy: 0.5, cols: ['neutral', 'happy', 'talk', 'partner'] },
};
const EMOS = new Set(['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking']);
const TALK = { speaking: true, level: 0.62, viseme: 'AH', next: 'AH', mix: 0, accent: 0, pause: false, sentenceIndex: 0, wordIndex: 0, charIndex: 0, emph: 0 };
const TALK_SRC = { frame: () => TALK };
const ALL = ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam'];

const tileActors = new Map();
const glassLooks = new Map();
/** A look wearing lab glasses (style 'rect' | 'round' | 'half') on top of its own `over` hook. */
function withGlasses(look, style) {
  const key = `${look.id}|${style}`;
  let g = glassLooks.get(key);
  if (g) return g;
  const over = look.parts.over;
  g = deriveLook(look, {
    id: `${look.id}-g${style}`,
    glasses: { style, ramp: [P.slate, P.ink, P.black, P.black] },
    parts: { over: (buf, L, m, head, s, sk) => { if (over) over(buf, L, m, head, s, sk); drawGlasses(buf, L, head, sk.face, s); } },
  });
  glassLooks.set(key, g);
  return g;
}

function tileActor(id, variant, seat, glasses = null) {
  const key = `${id}|${variant}|${seat}|${glasses}`;
  let a = tileActors.get(key);
  if (a) return a;
  const perf = { side: seat, seed: 11, emotions: [], look: [] };
  if (EMOS.has(variant)) perf.emotions = [{ t0: -10, name: variant }];
  else if (variant === 'talk') perf.speech = TALK_SRC;
  else if (variant === 'partner' || variant === 'notes' || variant === 'wall') perf.look = [{ t0: -5, t1: 500, target: variant }];
  a = actor(id, perf);
  if (glasses) a.look = withGlasses(a.look, glasses);
  tileActors.set(key, a);
  return a;
}

function blit(dst, dx, dy, src, sx, sy, w, h, bg) {
  for (let y = 0; y < h; y++) {
    const ty = dy + y, fy = sy + y;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x, fx = sx + x;
      if (tx < 0 || tx >= W) continue;
      dst[ty * W + tx] = fx >= 0 && fx < W && fy >= 0 && fy < H ? src[fy * W + fx] : bg;
    }
  }
}

function drawSheet(t, st) {
  const tier = TIERS[st.tier] || TIERS.close;
  const list = (st.presenters || ALL).filter(Boolean);
  const rows = Math.max(1, Math.floor(H / tier.th));
  const cols = Math.min(tier.cols.length, Math.floor(W / tier.tw));
  const pages = Math.max(1, Math.ceil(list.length / rows));
  const page = ((Math.floor(t) % pages) + pages) % pages;
  sheet.fill(C.black);
  const ox = Math.floor((W - cols * tier.tw) / 2), oy = Math.floor((H - rows * tier.th) / 2);
  for (let r = 0; r < rows; r++) {
    const id = list[page * rows + r];
    if (!id) break;
    for (let c = 0; c < cols; c++) {
      const variant = tier.cols[c];
      const seat = st.seat === -1 ? -1 : 1;
      frame.clear(C.ink);
      const heads = drawActors(st.tileT ?? 0.3, [{ actor: tileActor(id, variant, seat, st.glasses), x: 192, y: 150, s: tier.s }]);
      const hd = heads[0];
      const cx = hd.cx, cy = Math.round(hd.cy + tier.dy * tier.s);
      blit(sheet, ox + c * tier.tw, oy + r * tier.th, frame.px, cx - (tier.tw >> 1) + 1, cy - (tier.th >> 1) + 1, tier.tw - 1, tier.th - 1, C.ink);
    }
  }
  frame.px.set(sheet);
}

// ---------------------------------------------------------------------------
// Lip sync: one presenter in a close single

const SEAT_OF = { paco: 'A', max: 'A', nova: 'A', sam: 'A', lola: 'B', ada: 'B', unit8: 'B', penny: 'A' };
const lip = { key: '', audio: null, actor: null, slot: 'A' };

function lipSetup(st) {
  const sample = st.sample && SAMPLES[st.sample] ? SAMPLES[st.sample] : null;
  const who = sample ? sample.presenter : st.presenter;
  const key = `${who}|${sample ? st.sample : st.text}|${st.emotion || ''}`;
  if (lip.key === key) return lip;
  const slot = SEAT_OF[who] || 'A';
  const text = sample ? sample.text : st.text;
  lip.audio = timelineAudio([{ slot, text, t0: 0.5, words: sample ? sample.words : null, levels: sample ? { rate: 50, values: sample.levels } : null }]);
  lip.actor = actor(who, {
    side: slot === 'B' ? -1 : 1,
    seed: 23,
    emotions: st.emotion ? [{ t0: -10, name: st.emotion }] : [],
    speech: liveSpeech(lip.audio, slot),
  });
  lip.slot = slot;
  lip.who = who;
  lip.key = key;
  return lip;
}

function lipCam(st, l) {
  return singleCam(l.slot, st.k || 4.0);
}

function drawLipsync(t, st) {
  const l = lipSetup(st);
  const cam = lipCam(st, l);
  drawRoom(cam, t);
  drawActors(t, [{ actor: l.actor, ...placeActor(cam, l.slot === 'B' ? SET.seatX.B : SET.seatX.A) }], clipRows);
}

const stripLabels = [];
function drawStrip(t, st) {
  const l = lipSetup(st);
  const cam = lipCam(st, l);
  const pl = placeActor(cam, l.slot === 'B' ? SET.seatX.B : SET.seatX.A);
  const tw = 64, th = 54;
  sheet.fill(C.black);
  stripLabels.length = 0;
  for (let i = 0; i < 24; i++) {
    const ti = t + i / 25;
    frame.clear(C.ink);
    const hd = drawActors(ti, [{ actor: l.actor, ...pl }])[0];
    const M = l.actor.look.mouth;
    const cy = Math.round(hd.cy + (M ? M.y - 0.6 : 5) * pl.s);
    const c = i % 6, r = Math.floor(i / 6);
    blit(sheet, c * tw, r * th, frame.px, hd.cx - (tw >> 1) + 1, cy - (th >> 1), tw - 1, th - 1, C.ink);
    const fr = l.audio.speechFrame(ti * 1000, l.slot);
    stripLabels.push({ x: c * tw + 2, y: r * th + th - 8, text: `${fr.speaking ? (fr.mix > 0.5 ? fr.next : fr.viseme) : '-'} ${fr.level.toFixed(2)}` });
  }
  frame.px.set(sheet);
}

// ---------------------------------------------------------------------------
// Conversation: an episode planned and performed like the runtime

const GAP = { 'money-minute': 1.2, 'news-60': 0.7 };
const listenerEmotion = (e) => (e === 'happy' ? 'happy' : e === 'serious' || e === 'sad' ? 'serious' : 'neutral');

/**
 * Plan every segment of `episode` (planSegment) and lay it on one clock: the
 * first word of segment 0 at `start` s, each next one after its gap.
 * Returns { segs: [{ i, ctx, events, start, end, gap }], perfs: { slot: perf }, audio, end }.
 */
export function buildConversation(episode, { start = 1.0, presenters = {}, gapOf = null } = {}) {
  const segs = [];
  const slots = Object.keys(episode.cast || { A: 'paco' });
  const programId = episode.program?.id || 'world-now';
  const perfs = {};
  for (const slot of slots) perfs[slot] = { emotions: [], look: [], gestures: [], shots: [] };
  const items = [];
  let t = start;
  const n = episode.segments.length;
  // one gap function for the whole episode (like the runtime's pace gaps): every segment's
  // context, and the neighbours the planners read (the hand-over look carried across), see the
  // same pauses
  const gapAt = (k) => {
    if (!(k + 1 < n)) return null;
    const seg = episode.segments[k];
    return gapOf ? gapOf(seg, k) : episode.segments[k + 1].type === 'chat' && seg.type === 'chat' ? 0.6 : GAP[programId] ?? 0.9;
  };
  for (let i = 0; i < n; i++) {
    const seg = episode.segments[i];
    const gap = gapAt(i) ?? (GAP[programId] ?? 0.9);
    const plan = planSegment(episode, i, { presenters, gapAfter: gapAt });
    const ctx = plan.ctx;
    const speaker = ctx?.speaker || seg.anchor;
    items.push({ slot: speaker, text: seg.text, t0: t, words: seg.audio?.words || null });
    // seg.emotion on the speaker at speech start; the listeners get the derived one (director.js)
    for (const slot of slots) perfs[slot].emotions.push({ t0: t, name: slot === speaker ? seg.emotion || 'neutral' : listenerEmotion(seg.emotion) });
    for (const e of plan.events) {
      const at = t + e.at;
      if (e.kind === 'look' && perfs[e.slot]) perfs[e.slot].look.push({ t0: at, t1: at + (e.dur || 1), target: e.target || 'partner', amt: e.amt, style: e.style, src: e.src });
      else if (e.kind === 'gesture' && perfs[e.slot] && GESTURES[e.name]) perfs[e.slot].gestures.push({ name: e.name, t0: at, speed: e.speed, n: e.n, variant: e.variant, amp: e.amp, planner: e.planner });
      else if (e.kind === 'emotion' && perfs[e.slot]) perfs[e.slot].emotions.push({ t0: at, name: e.name });
      else if (e.kind === 'shot') perfs[slots[0]].shots.push({ t0: at, shot: e.shot, focus: e.focus });
    }
    const dur = ctx ? ctx.duration : 3;
    segs.push({ i, ctx, events: plan.events, errors: plan.errors, start: t, end: t + dur, gap, speaker });
    t += dur + gap;
  }
  for (const slot of slots) {
    const p = perfs[slot];
    p.emotions.sort((a, b) => a.t0 - b.t0);
    p.look.sort((a, b) => a.t0 - b.t0);
    p.gestures.sort((a, b) => a.t0 - b.t0);
  }
  const audio = timelineAudio(items);
  return { episode, segs, perfs, audio, end: t, slots, programId };
}

const conv = { key: null, data: null, actors: null };
const WIDE = makeCamera({ x: 0, y: -60, z: 0, zoom: 1, hy: 52 });
const TWO = makeCamera({ x: 0, y: -60, z: 370, zoom: 1, hy: 42 });

function soloCam(k) {
  const cz = 460;
  const zoom = (k * (SET.presenterZ - cz)) / 1000;
  const neck = 26 + 23.6 * k;
  return makeCamera({ x: 0, y: -60, z: cz, zoom, hy: neck - (SET.neckY + 60) * k, soft: 1 });
}
const SOLO_WIDE = makeCamera({ x: 0, y: -60, z: 250, zoom: 1, hy: 46 });

function convSetup(st) {
  const ep = st.episode && typeof st.episode === 'object' ? st.episode : EPISODES[st.episode] || EPISODES['world-now'];
  if (conv.key === ep) return conv;
  const data = buildConversation(ep, {});
  const duo = data.slots.length > 1;
  conv.actors = data.slots.map((slot) => {
    const id = ep.cast[slot];
    const side = duo ? (slot === 'A' ? 1 : -1) : 0;
    const p = data.perfs[slot];
    const a = actor(id, { side, seed: hashSeed(`${ep.id}${slot}`) % 997, emotions: p.emotions, look: p.look, gestures: p.gestures, listen: true, speech: liveSpeech(data.audio, slot) });
    return { slot, a, X: duo ? SET.seatX[slot] : SET.seatX.solo };
  });
  conv.data = data;
  conv.key = ep;
  return conv;
}

function shotAt(data, t) {
  let cur = null;
  for (const s of data.perfs[data.slots[0]].shots) {
    if (s.t0 > t) break;
    cur = s;
  }
  return cur;
}

function convCam(st, cv, t) {
  const duo = cv.actors.length > 1;
  const mode = st.cam || 'auto';
  if (mode === 'wide') return duo ? WIDE : SOLO_WIDE;
  if (mode === 'two') return duo ? TWO : soloCam(2.4);
  const s = shotAt(cv.data, t);
  if (s && s.shot === 'close') return duo ? singleCam(s.focus || 'A', 3.4) : soloCam(3.0);
  if (s && s.shot === 'wide') return duo ? TWO : SOLO_WIDE;
  return duo ? TWO : soloCam(2.4);
}

function drawConversation(t, st) {
  const cv = convSetup(st);
  const cam = convCam(st, cv, t);
  drawRoom(cam, t);
  const heads = drawActors(t, cv.actors.map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) })), clipRows);
  HEADS.length = 0;
  for (const h of heads) HEADS.push(h.cx, h.cy, h.s);
}
const HEADS = [];

/** Side-by-side 2x crops (96 x 108 px each) round every head of the last conversation frame. */
function zoomHeads() {
  sheet.set(frame.px);
  frame.px.fill(C.black);
  const n = Math.min(2, HEADS.length / 3);
  for (let k = 0; k < n; k++) {
    const cx = HEADS[k * 3], cy = HEADS[k * 3 + 1], hs = HEADS[k * 3 + 2];
    const sx = Math.round(cx - 48), sy = Math.round(cy - 30 - 2 * hs);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(H - 1, Math.max(0, sy + (y >> 1)));
      for (let x = 0; x < 190; x++) {
        const fx = Math.min(W - 1, Math.max(0, sx + (x >> 1)));
        frame.px[y * W + k * 194 + x] = sheet[fy * W + fx];
      }
    }
  }
}

const HUD_COL = { partner: P.yellow, notes: P.green, wall: P.cyan, camera: P.white, interest: P.pink };

function drawHud(ctx, t, st) {
  const cv = conv.data;
  if (!cv) return;
  const span = st.hudSpan || 24;
  const x0 = t - span / 2;
  const px = (x) => Math.round(((x - x0) / span) * W);
  const top = H - 4 - cv.slots.length * 6;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, top - 2, W, H - top + 2);
  cv.slots.forEach((slot, r) => {
    const y = top + r * 6;
    for (const s of cv.segs) {
      if (s.speaker !== slot) continue;
      ctx.fillStyle = P.slate;
      ctx.fillRect(px(s.start), y, Math.max(1, px(s.end) - px(s.start)), 5);
    }
    for (const lk of cv.perfs[slot].look) {
      ctx.fillStyle = HUD_COL[lk.target] || P.yellow;
      ctx.fillRect(px(lk.t0), y + 1, Math.max(1, px(lk.t1) - px(lk.t0)), 3);
    }
    for (const g of cv.perfs[slot].gestures) {
      ctx.fillStyle = g.name === 'nod' ? (slot === (shotSpeaker(cv, g.t0) || slot) ? P.orange : P.red) : P.fog;
      ctx.fillRect(px(g.t0), y, 1, 5);
    }
  });
  ctx.fillStyle = P.white;
  ctx.fillRect(px(t), top - 2, 1, H - top + 2);
}

function shotSpeaker(cv, t) {
  for (const s of cv.segs) if (t >= s.start - 0.2 && t <= s.end + s.gap) return s.speaker;
  return null;
}

// ---------------------------------------------------------------------------

const MODES = { sheet: drawSheet, lipsync: drawLipsync, strip: drawStrip, conversation: drawConversation };

/** Nearest-neighbour zoom of the region at (zx, zy) by `k` into the whole frame (inspection at 2-4x). */
function zoomFrame(k, zx, zy) {
  sheet.set(frame.px);
  const w = W / k, h = H / k;
  for (let y = 0; y < H; y++) {
    const sy = Math.min(H - 1, Math.floor(zy + y / k));
    for (let x = 0; x < W; x++) frame.px[y * W + x] = sheet[sy * W + Math.min(W - 1, Math.floor(zx + x / k))];
  }
  return w + h;
}

export function createFaceLab(canvas, { drawText = null } = {}) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const state = {
    mode: 'sheet', tier: 'close', presenter: 'paco', presenters: null, emotion: null, seat: 1,
    text: 'Good evening. Markets moved sharply today, as the bank promised more support.', sample: null,
    episode: 'world-now', cam: 'auto', k: 4.0, hud: true, tileT: 0.3, zoom: 1, zx: 0, zy: 0, glasses: null, zoomHeads: false,
  };
  const lab = {
    state,
    render(t = 0) {
      (MODES[state.mode] || drawSheet)(t, state);
      if (state.zoom > 1) zoomFrame(state.zoom, state.zx || 0, state.zy || 0);
      else if (state.zoomHeads && state.mode === 'conversation') zoomHeads();
      if (!ctx) return;
      frame.present(ctx);
      if (state.mode === 'strip' && drawText) for (const l of stripLabels) drawText(ctx, l.text, l.x, l.y, { color: P.fog, font: 'micro' });
      if (state.mode === 'conversation' && state.hud) drawHud(ctx, t, state);
    },
    set(opts = {}) {
      Object.assign(state, opts);
      if ('episode' in opts) conv.key = null;
      return { ...state };
    },
    conversation() {
      convSetup(state);
      return conv.data;
    },
    bench(n = 120, t0 = 1, dt = 1 / 60) {
      const fn = MODES[state.mode] || drawSheet;
      for (let i = 0; i < 10; i++) fn(t0 + i * dt, state);
      const a = performance.now();
      for (let i = 0; i < n; i++) fn(t0 + i * dt, state);
      return (performance.now() - a) / n;
    },
  };
  return lab;
}
