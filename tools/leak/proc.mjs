// A process and everything under it, from /proc (Linux): memory (RSS, swap) and CPU seconds of each, and the browser's
// processes grouped by kind (Chromium's --type: renderer, gpu-process, utility, zygote; none: the browser itself).
import fs from 'node:fs';

const TICK = 100; // clock ticks a second (getconf CLK_TCK: 100 on Linux)

/** [{ pid, ppid, name, cmd, rss (kB), swap (kB), cpu (s) }] for `root` and every descendant. */
export function procTree(root = process.pid) {
  const all = new Map();
  let dirs = [];
  try {
    dirs = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch {
    return [];
  }
  for (const d of dirs) {
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const f = st.slice(st.lastIndexOf(')') + 2).split(' ');
      all.set(Number(d), { pid: Number(d), ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) });
    } catch {
      /* gone */
    }
  }
  const kids = new Map();
  for (const p of all.values()) (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(p.pid);
  const out = [];
  const walk = (pid) => {
    const p = all.get(pid);
    if (!p) return;
    let rss = 0;
    let swap = 0;
    let name = '';
    let cmd = '';
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0);
      swap = Number(/VmSwap:\s+(\d+)/.exec(status)?.[1] || 0);
      name = /Name:\s+(\S+)/.exec(status)?.[1] || '';
      cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    } catch {
      /* gone */
    }
    out.push({ pid, ppid: p.ppid, name, cmd, rss, swap, cpu: p.ticks / TICK });
    for (const k of kids.get(pid) || []) walk(k);
  };
  walk(root);
  return out;
}

/** What a process is, for the measures: the browser's kinds, ffmpeg, the voices, node. */
export function kindOf(p) {
  const c = p.cmd || '';
  if (/chrom|headless_shell/i.test(p.name) || /chrom|headless_shell/i.test(c.split(' ')[0] || '')) {
    const t = /--type=([\w-]+)/.exec(c)?.[1];
    if (!t) return 'browser';
    if (t === 'renderer') return 'renderer';
    if (t === 'gpu-process') return 'gpu';
    if (t === 'zygote') return 'zygote';
    return t === 'utility' ? 'utility' : t;
  }
  if (/ffmpeg/.test(p.name)) return 'ffmpeg';
  if (/python/.test(p.name)) return 'voices';
  if (/node/.test(p.name)) return 'node';
  return 'other';
}

/** { kind: { rss, swap, cpu, n } } summed over the tree (kB, kB, CPU seconds). */
export function summariseTree(tree) {
  const out = {};
  for (const p of tree) {
    const k = kindOf(p);
    const o = (out[k] ||= { rss: 0, swap: 0, cpu: 0, n: 0 });
    o.rss += p.rss;
    o.swap += p.swap;
    o.cpu += p.cpu;
    o.n++;
  }
  return out;
}
