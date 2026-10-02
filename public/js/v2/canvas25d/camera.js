// Virtual studio camera for canvas25d (owner: CAMERA stream).
//
// A camera is a pedestal that trucks (x), pedestals (y / hy), dollies (z) and
// zooms; it never pans or rolls, so planes facing the lens stay 2D layers and
// a slow push-in re-rasterises every layer at its exact scale (pixel-clean,
// no bitmap scaling). See studio/geometry.js for the projection.
//   makeCamera(o)          a camera object { x, y, z, zoom, hy, soft }
//   placeActor(cam, X, Z)  screen position + scale of a seated presenter's neck base
//   singleCam(slot, k)     the approved single (MCU) on seat A or B, k = presenter scale
// Framing presets, moves and the runtime shot grammar (direction/shots.js)
// build on these.
import { SET, kAt, sxOf, syOf } from './studio/geometry.js';

export { kAt };

export function makeCamera(o = {}) {
  return { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0, ...o };
}

/** Screen position and scale of a seated presenter's neck base. */
export function placeActor(cam, X, Z = SET.presenterZ) {
  const k = kAt(cam, Z);
  // quantise the scale so the head (22 u) is a whole number of pixels: fewer re-samples while zooming
  const s = Math.max(0.5, Math.round(22 * k) / 22);
  return { x: sxOf(cam, k, X), y: syOf(cam, k, SET.neckY), s, k };
}

/** Single camera on a seat, composed so the screen's edge never sits next to the head. */
export function singleCam(slot, k = 3.0) {
  const cz = 460;
  const zoom = (k * (SET.presenterZ - cz)) / 1000;
  const kw = k * (SET.presenterZ - cz) / (SET.wallZ - cz);
  const side = slot === 'B' ? 1 : -1;
  // largest |cam.x| that keeps the bezel clear of the head (≥ 14 u of head + hair + margin)
  const clear = 10.5 * k;
  const cx = side * ((74 * k - 73 * kw - clear) / (k - kw));
  const neck = 26 + 23.6 * k; // head top 26 px below the frame top
  return makeCamera({ x: cx, y: -60, z: cz, zoom, hy: neck - (SET.neckY + 60) * k, soft: 1 });
}
