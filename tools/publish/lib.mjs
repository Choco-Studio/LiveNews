// What the publishing desk's tools share: running a command, the browser, the deterministic master recording.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { estimateTimeline } from '../../server/publish/timeline.js';
import { IDENT_AIR } from '../../public/js/pace.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Options from argv: opt('name', default), flag('name'), all('name'). */
export function argsOf(argv = process.argv.slice(2)) {
  const opt = (name, def = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
  };
  const flag = (name) => argv.includes(`--${name}`);
  const all = (name) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []));
  return { opt, flag, all };
}

/** Run a command in the checkout; resolves { out, err }, rejects with the end of stderr. */
export function run(cmd, argv, { env = {}, quiet = false, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => {
      o += d;
      if (!quiet) process.stdout.write(String(d).replace(/\r/g, '\n').split('\n').filter((l) => l.trim() && !/^\s*\d+%/.test(l)).map((l) => `    ${l}\n`).join(''));
    });
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve({ out: o, err: e }) : reject(new Error(`${cmd} ${argv[0]} exited ${code}: ${e.slice(-800)}`))));
  });
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

export const probeDuration = async (f) => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f], { quiet: true })).out.trim());

/** How long an episode airs, generously (the open, every voice, the pauses, the quiz's countdowns, the end). */
export function recordSeconds(ep) {
  const est = estimateTimeline(ep, { open: 11, gap: 0.9 }).duration;
  const frames = (ep.segments || []).filter((s) => s.part === 'frame').length;
  const weather = ep.weather ? (ep.segments || []).length * 3 : 0;
  // (the channel's ident airs before the open: pace.js CHANNEL.ident)
  return Math.ceil((est + IDENT_AIR + frames * 9 + weather) * 1.12 + 12);
}

/** The master: the episode in clip mode, lossless, at 1x, with its report (tools/record.mjs). */
export async function recordMaster({ base, epFile, fmt, file, report, seconds, airedAt, tmpDir, say = () => {} }) {
  const url = `${base}/?autostart=1&voice=tts&clip=1${fmt === 'vertical' ? '&format=vertical' : ''}`;
  say(`${fmt} master: recording ${seconds} s (${url})`);
  const t0 = Date.now();
  await run('node', ['tools/record.mjs', '--url', url, '--item', path.resolve(epFile), '--seconds', String(seconds), '--fps', '30', '--scale', '1', '--lossless', '--progressive', '--seed', '1', '--time', new Date(airedAt).toISOString(), '--report', report, '--out', file], { env: { TMPDIR: tmpDir } });
  say(`${fmt} master: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  return { file, report };
}
