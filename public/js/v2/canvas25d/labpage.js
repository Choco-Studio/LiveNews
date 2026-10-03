// UI of the canvas25d foundation lab page (public/lab/cast.html and its old
// address public/lab/foundation-canvas25d.html). Owner: INTEGRATION stream.
// Exposes window.__lab (lab.js createLab) for tools/shoot.mjs:
//   --step "window.__lab.set({ demo: 'camera' }); window.__lab.render(T)"
// ?still=1 disables interactive playback (captures drive the clock).
import { createLab, DEMO_NAMES, GESTURE_NAMES, PRESENTER_IDS } from './lab.js';

const canvas = document.getElementById('screen');
const lab = createLab(canvas);
window.__lab = lab;

const $ = (id) => document.getElementById(id);
for (const n of DEMO_NAMES || ['static']) $('demo').add(new Option(n, n));
for (const n of PRESENTER_IDS) $('presenter').add(new Option(n, n));
for (const n of ['sequence', ...(GESTURE_NAMES || [])]) $('gesture').add(new Option(n, n));
$('demo').value = lab.state.demo;
$('presenter').value = lab.state.presenter;
$('demo').onchange = () => {
  lab.set({ demo: $('demo').value });
  t0 = performance.now();
};
$('presenter').onchange = () => lab.set({ presenter: $('presenter').value });
$('gesture').onchange = () => {
  lab.set({ gesture: $('gesture').value });
  t0 = performance.now();
};

const still = new URLSearchParams(location.search).has('still');
let playing = !still;
let t0 = performance.now();
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'pause' : 'play';
  t0 = performance.now() - Number($('t').value) * 1000;
};
$('t').oninput = () => {
  playing = false;
  $('play').textContent = 'play';
  lab.render(Number($('t').value));
};
function loop() {
  if (playing) {
    const t = (performance.now() - t0) / 1000;
    $('t').value = t % 20;
    lab.render(t);
  }
  requestAnimationFrame(loop);
}
lab.render(0);
if (!still) loop();
