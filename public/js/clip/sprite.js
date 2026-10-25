// A presenter as a cut-out for the packaging (public/js/clip/cover.js): the channel's own character drawn by the same
// rig and renderer as on air, at a close single's size, alone on a transparent frame, so a thumbnail can stand the
// presenter in front of the story's picture. Nothing new is drawn: the look, the face and the gestures are the cast's
// (public/js/v2/canvas25d), the expression one of the channel's six (cues.js EMOTIONS).
//
//   presenterSprite(id, { emotion, gesture, scale, side, t, yaw, pitch, look }) -> { canvas, w, h, head } | null
//     canvas: the figure cropped to its pixels (transparent around it); head: the head's box in the canvas
import { frame, parts, actor } from '../v2/canvas25d/scene.js';
import { drawCharacter } from '../v2/canvas25d/character.js';
import { poseAt } from '../v2/canvas25d/rig.js';
import { W, H } from '../v2/canvas25d/pixbuf.js';

const EMOTIONS = new Set(['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking']);

/**
 * The presenter `id` (config/channel.json presenters) at rig scale `scale` (a close single is about 3.4), facing
 * screen-left (`side` 1) or screen-right (-1), the expression `emotion` held from the start, an optional gesture
 * caught `t` seconds in, the head turned by `yaw` (radians; negative turns the face to screen-left, toward a
 * thumbnail's words). Drawn on a cleared (transparent) frame: every pixel the renderer writes is the figure.
 */
export function presenterSprite(id, { emotion = 'neutral', gesture = null, scale = 3.4, side = 1, t = 2.6, yaw = 0, pitch = 0, look = null } = {}) {
  if (!id || typeof document === 'undefined') return null;
  const perf = { side, seed: 11, emotions: EMOTIONS.has(emotion) ? [{ t0: 0, name: emotion }] : [], gestures: gesture ? [{ name: gesture, t0: 0.2 }] : [] };
  let head = null;
  try {
    const a = actor(id, perf);
    frame.clear(0);
    parts.clear();
    const sk = poseAt(a, t);
    // (a head turned toward the words: a face's gaze carries the viewer's eye where it looks; cast-a lab's yaw offset)
    if (yaw) sk.head.yaw += yaw;
    // (and lifted toward something above it, the eyes on it: a clip's question over the players, shorts-v2.md B1)
    if (pitch) sk.head.pitch += pitch;
    if (look && sk.face) {
      sk.face.lookX = Math.max(-1, Math.min(1, look.x ?? sk.face.lookX ?? 0));
      sk.face.lookY = Math.max(-1, Math.min(1, look.y ?? sk.face.lookY ?? 0));
    }
    // the neck where a close single keeps it: the head in the upper part of the frame, the body to the bottom edge
    head = drawCharacter(parts, a.look, sk, { x: W >> 1, y: Math.round(30 + 26 * scale), s: scale, gb: 0, clip: false });
    parts.resolve(frame);
  } catch {
    return null;
  }
  const px = frame.px;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[y * W + x] >>> 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const img = new ImageData(new Uint8ClampedArray(frame.image.data), W, H);
  // (a pixel the renderer blended with the cleared frame is half transparent: the figure is opaque or absent)
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] ? 255 : 0;
  full.getContext('2d').putImageData(img, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(full, x0, y0, w, h, 0, 0, w, h);
  const hb = head && Number.isFinite(head.cx) ? { x: Math.round(head.cx - x0), y: Math.round(head.cy - y0) } : null;
  return { canvas, w, h, head: hb, cutBottom: y1 >= H - 1 };
}
