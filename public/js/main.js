import { AudioEngine } from './audio.js';
import { Renderer, W, H } from './studio.js';
import { Director } from './director.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;

const audio = new AudioEngine({ lang: 'en' });
const renderer = new Renderer(canvas, audio);

const channel = await fetch('/api/channel')
  .then((r) => r.json())
  .catch(() => ({ name: 'GLOBIT 24', slogan: '', presenters: {}, programs: {}, rotation: [] }));
document.title = `${channel.name} · Live`;
const player = new Director({ audio, channel });
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
function loop() {
  renderer.render(performance.now() / 1000, scene);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- live events from the control room --------------------------------------
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('ticker', (e) => (scene.ticker = JSON.parse(e.data)));
  es.addEventListener('breaking', (e) => player.breaking(JSON.parse(e.data)));
  es.onerror = () => {
    es.close();
    setTimeout(connectEvents, 5000);
  };
}
connectEvents();

// --- start (browsers only allow audio after a user gesture) ----------------
let started = false;
async function start() {
  if (started) return;
  started = true;
  await audio.unlock();
  audio.setMode(params.get('voice') || 'tts');
  if (params.has('volume')) audio.volume = Math.max(0, Math.min(1, Number(params.get('volume'))));
  document.body.classList.add('on-air');
  player.run();
}
if (params.get('autostart') === '1') start();
else {
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
  if (!started) return;
  switch (e.key.toLowerCase()) {
    case 'v': {
      const next = MODES[(MODES.indexOf(audio.mode) + 1) % MODES.length];
      audio.setMode(next);
      notify(`Voice: ${audio.mode}`);
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
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
      break;
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
      <p class="keys">V voice (${audio.mode}) · S subtitles · N skip · F fullscreen · ↑↓ volume · D close</p>`;
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
