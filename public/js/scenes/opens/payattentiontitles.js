// PAY ATTENTION's title sequence (pay-attention.md §6: "≈8 s, 112 BPM: a dark stage; the buzzer lamps of both desks
// light in turn on the beat; the question board flips to PAY ATTENTION; the plate"), on the programme's grid (cues.js).
//
// Two pictures of the same sequence, one per play:
//   - the studio's (payattentionstudio.js): shot in the quiz studio itself with the v2 renderer. It is loaded with a
//     dynamic import() only when the v2 studio is on (loadPayAttentionStudio: the renderer calls it when it starts, as it
//     starts the v2 stage), so the default page's module graph never reaches the v2 runtime, direction or studio, and
//     ?v2=0 never runs v2 code;
//   - the flat open (payattentionflat.js): the dark stage, the lamps striking on the beat, the board's flip and its close,
//     drawn front on without the studio, for ?v2=0, a failed load, or a play that starts before the studio has arrived.
// Each play keeps the picture it started with (never a switch mid-sequence). Then, from beat 10, both cut to the emblem
// (the two lamps on their plaque) and the package's plate wipes out of it.
import { P } from '../../palette.js';
import { u32 } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { QUIZ_OPEN, paintLamps, BUILD_DONE } from './payattention.js';
import { sequence, Layer } from './seq.js';
import { CUES, hitOf } from './cues.js';
import { paintFlat, flatLayer, lampAt, roomLight, flipAt } from './payattentionflat.js';

const ID = 'pay-attention';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The studio, loaded only when asked

let STUDIO = null, LOADING = null;
/**
 * Load the open's studio (the v2 set) once; resolves to its module, or null if it cannot load (the flat open then airs).
 * Call it when the v2 studio is on, early (the renderer does so as it starts), so no play begins without it.
 */
export function loadPayAttentionStudio() {
  LOADING ??= import('./payattentionstudio.js').then(
    (m) => {
      STUDIO = m;
      // the studio's wall light baked in an idle moment, ahead of the open's first lit frame
      if (typeof setTimeout === 'function') setTimeout(() => {
        try {
          m.warm();
        } catch {
          // the first lit frame bakes it instead
        }
      }, 0);
      return m;
    },
    (err) => {
      console.warn('[opens] PAY ATTENTION studio unavailable, the flat open airs', err);
      LOADING = null;
      return null;
    },
  );
  return LOADING;
}
/** The loaded studio module, or null. */
export const payAttentionStudio = () => STUDIO;

// each play keeps the picture it started with: a play starts at dt 0 or when dt jumps (a new airing, a lab's seek); on
// air dt steps a frame at a time, so a play never switches pictures mid-sequence
const PLAY = { studio: false, lastDt: Infinity };
function pictureFor(dt) {
  if (dt <= 0 || Math.abs(dt - PLAY.lastDt) > 0.25) PLAY.studio = !!STUDIO;
  PLAY.lastDt = dt;
  return PLAY.studio && STUDIO ? 'studio' : 'flat';
}

const L = new Layer('quiz-titles');
function before(ctx, dt) {
  const b = dt / BEAT;
  const pic = pictureFor(dt);
  if (b >= Q.emblem) {
    // the emblem on the open's field: the package's first frame (the two lamps lit, at centre stage)
    ctx.drawImage(QUIZ_OPEN.background(), 0, 0);
    QUIZ_OPEN.emblem(ctx, BUILD_DONE, CENTRE.x, CENTRE.y, ZOOM);
    return;
  }
  if (pic === 'studio') {
    try {
      const px = STUDIO.paintStage(b);
      L.begin(C.black).set(px);
      L.end(ctx);
      return;
    } catch (err) {
      // a studio frame that throws: the flat open for the rest of this play (never a black frame)
      console.warn('[opens] PAY ATTENTION studio frame failed, the flat open airs', err);
      PLAY.studio = false;
    }
  }
  paintFlat(b);
  flatLayer().end(ctx);
}

// from the reveal on the package plays its open, the lamps settled lit
const REVEAL = { ...QUIZ_OPEN, emblem: (ctx, dt, x, y, k) => QUIZ_OPEN.emblem(ctx, Math.max(dt, BUILD_DONE), x, y, k) };
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL });

/** PAY ATTENTION's title sequence at dt seconds (full frame). */
export function drawPayAttentionTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const PAYATTENTION_TITLES = { ...QUIZ_OPEN, warmJobs: () => [...QUIZ_OPEN.warmJobs()] };
export const PAYATTENTION_SEQ = SEQ;
/** For checks: the open's pixels at beat b before the emblem (the studio's once it has loaded, else the flat open's). */
export const payAttentionFrame = (b) => (STUDIO ? STUDIO.paintStage(b) : paintFlat(b));
/** For checks: the flat open's pixels at beat b (the picture without the studio). */
export const payAttentionFlatFrame = (b) => paintFlat(b);
/** The emblem painted at centre stage at the hand-over size into a fresh buffer (tests: no pop at the package). */
export function emblemPixels(x = CENTRE.x, y = CENTRE.y, k = ZOOM) {
  const T = { d: new Uint32Array(W * H), w: W, h: H, ox: 0, oy: 0 };
  paintLamps(T, x, y, k);
  return T.d;
}
export { lampAt, roomLight, flipAt };
