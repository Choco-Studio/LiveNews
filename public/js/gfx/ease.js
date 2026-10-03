// Timing and easing helpers shared by the full-screen graphics. Everything is
// a pure function of a progress value so scenes stay deterministic: draw(t)
// always produces the same frame for the same t.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progress (0..1) of a timeline segment that starts at `start` and lasts `dur`. */
export const seg = (x, start, dur) => (dur <= 0 ? (x >= start ? 1 : 0) : clamp((x - start) / dur, 0, 1));

export const easeIn = (x) => clamp(x, 0, 1) ** 3;
export const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const easeInOut = (x) => {
  const v = clamp(x, 0, 1);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
/** Stronger deceleration for graphics that land and must look settled. */
export const easeOutQuint = (x) => 1 - (1 - clamp(x, 0, 1)) ** 5;
export const easeInOutQuint = (x) => {
  const v = clamp(x, 0, 1);
  return v < 0.5 ? 16 * v ** 5 : 1 - (-2 * v + 2) ** 5 / 2;
};
/** Sine in/out: the gentlest curve, for slow drifts and camera-like moves. */
export const easeInOutSine = (x) => -(Math.cos(Math.PI * clamp(x, 0, 1)) - 1) / 2;
export const smoothstep = (a, b, x) => {
  const v = clamp((x - a) / (b - a), 0, 1);
  return v * v * (3 - 2 * v);
};
/** Ease-out with a small overshoot (s ~ 1.2 is subtle, 1.7 is the classic). */
export function easeOutBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}
/**
 * A dropped object: falls with gravity (ease-in), then one or two small
 * decaying hops. Returns the height above the ground as a 0..1 fraction of
 * the drop height, so `y = ground - h * dropHeight`.
 */
export function dropBounce(x, hop = 0.18) {
  const v = clamp(x, 0, 1);
  if (v >= 1) return 0;
  const fall = 0.55;
  if (v < fall) {
    const k = v / fall;
    return 1 - k * k;
  }
  if (v < 0.85) return hop * Math.sin(((v - fall) / 0.3) * Math.PI);
  return hop * 0.3 * Math.sin(((v - 0.85) / 0.15) * Math.PI);
}
/** Repeating accent: 0..1 while a periodic event runs, else -1. */
export function every(x, start, period, dur) {
  if (x < start) return -1;
  const ph = (x - start) % period;
  return ph < dur ? ph / dur : -1;
}
/** Integer pixel position (never let sub-pixel values reach fillRect). */
export const px = Math.round;
