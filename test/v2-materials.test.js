// The v2 material table (pixbuf.js MAT) holds every colour ramp the characters use. A 24/7 run that has aired every
// face (8 presenters, 3 correspondents, 8 experts) registers ~350 of them before the sets add theirs: with 8-bit
// per-pixel ids the later faces wrapped round and took the early ones' colours (a red face, a grey one). The ids are
// 16-bit now; this renders the whole cast in one process and checks the last face still wears its own colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAT, MAX_MATS, PartBuffer, C } from '../public/js/v2/canvas25d/pixbuf.js';
import { createCastALab } from '../public/js/v2/canvas25d/labs/cast-a.js';
import { frame } from '../public/js/v2/canvas25d/scene.js';
import { LOOKS, CORRESPONDENT_LOOKS, EXPERT_LOOKS } from '../public/js/v2/canvas25d/cast/index.js';
import { u32 } from '../public/js/v2/canvas25d/pixbuf.js';

const ALL = [...Object.keys(LOOKS), ...Object.keys(CORRESPONDENT_LOOKS), ...Object.keys(EXPERT_LOOKS)];
const groups = (ids) => Array.from({ length: Math.ceil(ids.length / 4) }, (_, i) => ids.slice(i * 4, i * 4 + 4));

test('every face of the channel fits the material table, with fixed keys and room to spare', () => {
  const lab = createCastALab(null);
  for (const g of groups(ALL)) {
    lab.set({ mode: 'lineup', scale: 3.4, cast: g });
    lab.render(1);
  }
  const first = MAT.count;
  assert.ok(first > 256, `the cast alone registers more than 8 bits of materials (${first})`);
  for (const g of groups(ALL)) {
    lab.set({ mode: 'lineup', scale: 3.4, cast: g });
    lab.render(1);
  }
  assert.equal(MAT.count, first, 'drawing the cast again registers nothing new (keys are fixed, never per frame)');
  assert.ok(MAT.count < MAX_MATS / 4, `room for the sets, props and new faces (${MAT.count} of ${MAX_MATS})`);
  assert.ok(!MAT.full);
});

test('a face drawn after the whole cast keeps its own skin (no wrap-round of material ids)', () => {
  const buf = new PartBuffer(4, 1);
  buf.mat[0] = 351;
  assert.equal(buf.mat[0], 351, 'per-pixel material ids are wider than 8 bits');
  const lab = createCastALab(null);
  for (const g of groups(ALL)) {
    lab.set({ mode: 'lineup', scale: 3.4, cast: g });
    lab.render(1);
  }
  // the last expert alone in the first column: her face is lit in her own ramp (tan), never another's
  const last = ALL.at(-1);
  lab.set({ mode: 'lineup', scale: 3.4, cast: [last] });
  lab.render(1);
  const skin = EXPERT_LOOKS[last].skin.map(u32);
  let skinPx = 0;
  for (let y = 40; y < 120; y++) for (let x = 30; x < 66; x++) if (skin.includes(frame.px[y * frame.w + x])) skinPx++;
  assert.ok(skinPx > 300, `${last}'s face is in her own skin ramp (${skinPx} px)`);
  assert.notEqual(frame.px[0], undefined);
  assert.ok(C.ink);
});
