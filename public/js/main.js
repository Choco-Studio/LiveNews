import { AudioEngine } from './audio.js';
import { Renderer, W, H } from './studio.js';
import { Director } from './director.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;

const audio = new AudioEngine({ lang: 'en' });
// The v2 presenters and studio are the channel's default (owner, 3 Oct); ?v2=0 (or false/off/no) airs the old
// renderer. ?perf=1 logs the v2 shot's p50/p95 every 10 s.
const v2 = params.has('v2') ? !/^(0|false|off|no)$/i.test(params.get('v2').trim()) : true;
const renderer = new Renderer(canvas, audio, { v2, perf: params.get('perf') === '1' });

const channel = await fetch('/api/channel')
  .then((r) => r.json())
  .catch(() => ({ name: 'GLOBIT 24', slogan: '', presenters: {}, programs: {}, rotation: [] }));
document.title = `${channel.name} · Live`;
const player = new Director({ audio, channel, v2 });
const scene = player.scene;
scene.subtitles = params.get('subs') !== '0';

// --- integer scaling so pixels stay square and sharp -----------------------
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
window.addEventListener('resize', fit);
fit();

// --- render loop ------------------------------------------------------------
// One bad frame must never freeze the picture: keep looping and log each
// distinct error once (a broken scene would otherwise flood the console).
// Renderer.render() already isolates the shot (graphics/guard.js); anything
// that still throws (the stinger, a renderer bug) is recovered the same way: the
// canvases are reset (a throw between save() and restore() would leave its clip
// on every later frame), the last clean picture is repainted and the graphics
// go back on top, so the bug, clock and ticker stay on air.
const seenErrors = new Set();
function loop() {
  requestAnimationFrame(loop);
  const t = performance.now() / 1000;
  try {
    renderer.render(t, scene);
  } catch (err) {
    try {
      renderer.guard.recover(renderer, t);
      renderer.graphics.draw(renderer.ctx, t, scene); // never throws
    } catch {
      /* the reset frame stays */
    }
    const key = `${err?.name}: ${err?.message}`;
    if (!seenErrors.has(key) && seenErrors.size < 50) {
      seenErrors.add(key);
      console.error('[render]', err);
    }
  }
}
requestAnimationFrame(loop);

// --- live events from the control room --------------------------------------
function connectEvents() {
  const es = new EventSource('/api/events');
  const on = (name, fn) =>
    es.addEventListener(name, (e) => {
      try {
        fn(JSON.parse(e.data));
      } catch (err) {
        console.warn(`[events] bad ${name} event`, err);
      }
    });
  on('ticker', (data) => (scene.ticker = data));
  on('breaking', (data) => player.breaking(data));
  on('schedule', (data) => (scene.schedule = data)); // "NEXT" item in the ticker
  es.onerror = () => {
    es.close();
    setTimeout(connectEvents, 5000);
  };
}
connectEvents();

// --- start (browsers only allow audio after a user gesture) ----------------
// The director must start whatever audio does: unlocking (and loading voices)
// is raced against a short timeout, and a failing audio call never strands
// the channel on the start card with every key dead.
const autostart = params.get('autostart') === '1';
let started = false;
async function start() {
  if (started) return;
  started = true;
  try {
    await Promise.race([audio.unlock(), new Promise((r) => setTimeout(r, 1500))]);
  } catch (err) {
    console.warn('[audio] unlock failed', err);
  }
  try {
    audio.setMode(params.get('voice') || 'tts');
    if (params.has('volume')) audio.volume = Math.max(0, Math.min(1, Number(params.get('volume'))));
  } catch (err) {
    console.warn('[audio] setup failed', err);
  }
  document.body.classList.add('on-air');
  player.run();
}
if (autostart) {
  // No click is needed, so the start card must not ask for one. Autoplay may
  // still be blocked: AudioEngine.unlock() then arms itself on the first
  // click / key / touch (capture phase) and retries until audio runs.
  if (scene.shot === 'start') scene.card = { ...(scene.card || {}), prompt: 'TUNING IN' };
  start();
} else {
  canvas.addEventListener('click', start);
  window.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}

// --- keyboard controls ----------------------------------------------------
const MODES = ['tts', 'blips', 'mute'];
const toast = document.getElementById('toast');
let toastTimer;
function notify(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

window.addEventListener('keydown', (e) => {
  if (!started || e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
  switch (e.key.toLowerCase()) {
    case 'v': {
      // Each mode once, in order; the label says when 'tts' has no system voice (captions only).
      const modes = audio.modes ?? MODES;
      const next = modes[(modes.indexOf(audio.mode) + 1) % modes.length];
      audio.setMode(next);
      notify(`Voice: ${audio.modeLabel ?? audio.mode}`);
      break;
    }
    case 's':
      scene.subtitles = !scene.subtitles;
      notify(`Subtitles: ${scene.subtitles ? 'on' : 'off'}`);
      break;
    case 'n':
      player.skip();
      notify('Skip');
      break;
    case 'f': {
      const req = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
      Promise.resolve(req).catch(() => notify('Fullscreen not available'));
      break;
    }
    case 'd':
      toggleDebug();
      break;
    case 'arrowup':
      audio.volume = Math.min(1, audio.volume + 0.1);
      notify(`Volume ${Math.round(audio.volume * 100)}%`);
      break;
    case 'arrowdown':
      audio.volume = Math.max(0, audio.volume - 0.1);
      notify(`Volume ${Math.round(audio.volume * 100)}%`);
      break;
    default:
  }
});

// --- control panel (D) -------------------------------------------------------
const panel = document.getElementById('debug');
let debugTimer = null;
async function refreshDebug() {
  try {
    const st = await fetch('/api/status').then((r) => r.json());
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
    const rows = Object.entries(st.usage.month)
      .map(([name, u]) => `<tr><td>${name}</td><td>${u.calls}</td><td>${u.errors}</td><td>${fmt(u.input)}</td><td>${fmt(u.output)}</td></tr>`)
      .join('');
    const providers = st.providers
      .map((p) => {
        const pause = p.cooldownUntil && p.cooldownUntil > Date.now() ? ` (paused ${Math.ceil((p.cooldownUntil - Date.now()) / 60000)} min)` : '';
        return `<li>${p.configured ? '●' : '○'} ${p.name}${pause}</li>`;
      })
      .join('');
    const feeds = Object.entries(st.feeds)
      .map(([n, f]) => `<li class="${f.ok ? 'ok' : 'bad'}">${escapeHtml(n)}: ${f.ok ? `${f.items} items` : escapeHtml(f.error)}</li>`)
      .join('');
    const sched = st.schedule || {};
    const upcoming = (sched.upcoming || []).map((p) => `<li>${p.ready ? '●' : '○'} ${escapeHtml(p.title)}</li>`).join('');
    panel.innerHTML = `
      <h2>Master control</h2>
      <p>On air: <b>${sched.now ? escapeHtml(sched.now.kind === 'break' ? 'Commercial break' : sched.now.title) : '—'}</b>${st.producing ? ` · producing <b>${escapeHtml(st.producing)}</b>…` : ''}</p>
      <p>Ready: <b>${st.queue.length}</b> · Aired: <b>${st.aired}</b> · Stories: <b>${st.stories}</b> (${st.uncovered} unused)</p>
      ${st.lastError ? `<p class="bad">Last error: ${escapeHtml(st.lastError)}</p>` : ''}
      <h3>Schedule</h3><ul>${upcoming}</ul>
      <h3>AI providers</h3><ul>${providers}</ul>
      <h3>Usage this month</h3>
      <table><tr><th>AI</th><th>Calls</th><th>Errors</th><th>Tokens in</th><th>Tokens out</th></tr>${rows || '<tr><td colspan="5">no data</td></tr>'}</table>
      <h3>Feeds</h3><ul>${feeds}</ul>
      <p class="keys">V voice (${audio.modeLabel ?? audio.mode}) · S subtitles · N skip · F fullscreen · ↑↓ volume · D close</p>`;
  } catch {
    panel.innerHTML = '<p class="bad">Master control unreachable</p>';
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function toggleDebug(force) {
  const show = force ?? panel.hidden;
  panel.hidden = !show;
  clearInterval(debugTimer);
  if (show) {
    refreshDebug();
    debugTimer = setInterval(refreshDebug, 5000);
  }
}
if (params.get('debug') === '1') toggleDebug(true);
