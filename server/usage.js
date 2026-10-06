import fs from 'node:fs';
import path from 'node:path';

/** Per-provider, per-day call and token counters, persisted to data/usage.json. */
export class UsageTracker {
  constructor(dataDir) {
    this.file = dataDir ? path.join(dataDir, 'usage.json') : null;
    this.data = { days: {}, lastError: {} };
    if (this.file && fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (data?.days && typeof data.days === 'object' && !Array.isArray(data.days)) {
          this.data = { days: data.days, lastError: data.lastError && typeof data.lastError === 'object' ? data.lastError : {} };
        }
      } catch {
        /* start fresh on a corrupt file */
      }
    }
  }

  record(provider, { ok, ms = 0, input = 0, output = 0, cached = 0, error }) {
    const day = new Date().toISOString().slice(0, 10);
    const d = (this.data.days[day] ??= {});
    const p = (d[provider] ??= { calls: 0, errors: 0, input: 0, output: 0, cached: 0, ms: 0 });
    p.calls++;
    if (!ok) {
      p.errors++;
      this.data.lastError[provider] = { at: new Date().toISOString(), error };
    }
    p.input += input;
    p.output += output;
    p.cached += cached;
    p.ms += ms;
    // keep ~60 days
    const days = Object.keys(this.data.days).sort();
    while (days.length > 60) delete this.data.days[days.shift()];
    this.save();
  }

  summary() {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const monthTotals = {};
    for (const [day, providers] of Object.entries(this.data.days)) {
      if (!day.startsWith(month)) continue;
      for (const [name, p] of Object.entries(providers)) {
        const m = (monthTotals[name] ??= { calls: 0, errors: 0, input: 0, output: 0, cached: 0 });
        for (const k of Object.keys(m)) m[k] += p[k] || 0;
      }
    }
    // The summary is public (/api/status): an error says what kind of failure it was, never a file path or a
    // program's internals (the full message stays in the server log and in data/usage.json).
    const lastError = Object.fromEntries(Object.entries(this.data.lastError).map(([k, v]) => [k, { ...v, error: publicError(v?.error) }]));
    return { today: this.data.days[today] || {}, month: monthTotals, lastError };
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {
      /* non-fatal */
    }
  }
}

/** An error message fit for a public status page: short, no paths, no program internals. */
export function publicError(message) {
  const m = String(message ?? '').split('\n')[0].trim();
  if (!m) return m;
  if (/(?:^|[\s'"(])(?:\/|~\/|[A-Za-z]:\\)[\w.\-\\/]+/.test(m) || /\b(?:Cannot read propert\w*|is not a function|is not defined|is not iterable|Unexpected token|stack|ENOENT|EACCES)\b/.test(m)) return 'internal error';
  return m.slice(0, 120);
}
