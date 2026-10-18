// The live supervisor (docs/publishing/pipeline.md §6): keeps the 24/7 stream (tools/stream.mjs) up, and keeps the
// live video's title and description saying what is on.
//
//   new LiveSupervisor({ streamArgs, channelUrl, statusFile, ... }).start() / .stop()
//
// What it does, and why:
//   - starts the streamer as its own child process and restarts it when it ends (a page crash ends a run on
//     purpose: a WebM stream cannot take a second header), with a growing pause between quick failures (2, 5, 15,
//     30, 60 s) so a broken page does not spin; a run that stayed healthy five minutes resets the pause
//   - watches its health: the streamer prints "N KB/s from the page" every 10 s; no such line for 45 s, or a rate
//     under 8 KB/s for 45 s (a frozen page sends almost nothing), or a test file that stops growing: the run is
//     stopped (its own process only: SIGTERM, then SIGKILL) and started again
//   - before every (re)start, asks the channel server whether it is up (/api/schedule); while it is down, waits
//   - more than 12 restarts in an hour: it pauses ten minutes and says so in the status file (something is wrong
//     that a restart will not fix)
//   - the title and description: when the programme on air changes (the channel's /api/schedule), at most every 20
//     minutes and 60 times a day (each update costs YouTube quota), the live video's snippet is updated through the
//     YouTube adapter; a dry run (the default) writes what it would send to the outbox and changes nothing
//   - a status file (state, pid, restarts, the last rate, the title on air) for the owner and for tests
// It never streams by itself: the target (--rtmp with the key's variable, or --out <file> to test) is in streamArgs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';

/** The streamer's picture and capture switches the supervisor passes through (tools/stream.mjs). */
export const liveStreamOptions = Object.freeze(['size', 'bitrate', 'crf', 'rc', 'capture', 'preset', 'fps', 'page-fps', 'audio-bitrate']);

export const LIVE_POLICY = Object.freeze({
  backoff: [2, 5, 15, 30, 60], // s between restarts after quick failures
  healthyAfter: 300, // s of health that resets the backoff
  stallSeconds: 45, // no rate line, or a low rate, this long: restart
  minKBps: 8,
  maxRestartsPerHour: 12,
  cooldown: 600, // s of pause after too many restarts
  checkEvery: 5, // s between health checks
  scheduleEvery: 60, // s between looks at what is on air
  titleEvery: 20 * 60, // s at least between two title updates
  titlesPerDay: 60,
  killGrace: 8, // s between SIGTERM and SIGKILL
});

const RATE = /(\d+(?:\.\d+)?)\s*KB\/s from the page/;

/**
 * The live title for the programme on air (≤ 100 characters). `recorded` (pre-rendered playout, docs/publishing/
 * playout.md §5): the programmes were made ahead and air from files, so the title never says LIVE. It says the news is
 * AI-produced: the title is what a viewer reads before the stream plays, the first exposure of whoever joins it
 * mid-programme, before the channel's next ident (compliance.md §2.10, §3.3).
 */
export function liveTitle(now, { channel = 'GLOBIT 24', recorded = false } = {}) {
  const prog = now?.title ? String(now.title).toUpperCase() : null;
  const base = recorded ? `${channel}: AI-produced world news, 24 hours a day` : `${channel} LIVE: AI-produced world news, 24 hours a day`;
  const t = prog ? (recorded ? `${channel} · Now: ${prog} · AI-produced news 24/7` : `${channel} LIVE · Now: ${prog} · AI-produced news 24/7`) : base;
  return t.length <= 100 ? t : base.slice(0, 100);
}

/** The live description: what is on, what comes next, how the channel is made, where the facts come from. */
export function liveDescription(schedule, { disclosure = [], links = [], recorded = false } = {}) {
  const now = schedule?.now?.kind === 'episode' ? schedule.now : null;
  const next = (schedule?.upcoming || []).map((p) => p.title).filter(Boolean).slice(0, 3);
  const lines = [];
  lines.push(now ? `On air now: ${now.title}${now.tagline ? ` (${String(now.tagline).toLowerCase()})` : ''}.` : 'On air: GLOBIT 24, world news around the clock.');
  if (next.length) lines.push(`Coming up: ${next.join(', ')}.`);
  lines.push('');
  lines.push(...(disclosure.length ? disclosure : ['AI-produced news: the presenters are AI characters with synthetic voices. Every story is written from reporting by credited news outlets, named on screen and in each programme.']));
  // pre-rendered playout: say how it airs (each programme is made and checked about an hour before it goes out)
  if (recorded) lines.push('Each programme is produced and checked ahead of time and aired from a recording, about an hour after it is made.');
  if (links.length) lines.push('', ...links);
  return lines.join('\n').slice(0, 4900);
}

export class LiveSupervisor {
  constructor({
    streamArgs = [],
    channelUrl = 'http://127.0.0.1:8080',
    statusFile = null,
    outFile = null, // a test run's file: its growth is part of health
    youtube = null, // a YouTubeAdapter (dry run unless live)
    live = false, // every live switch on (publisher.js liveBlockers): titles really update
    recorded = false, // pre-rendered playout: the titles never say LIVE (docs/publishing/playout.md §5)
    videoId = null,
    disclosure = [],
    policy = {},
    spawn = nodeSpawn,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    log = () => {},
    outbox = null,
    nodeBin = process.execPath,
    cwd = process.cwd(),
  } = {}) {
    Object.assign(this, { streamArgs, channelUrl: channelUrl.replace(/\/$/, ''), statusFile, outFile, youtube, live, recorded, videoId, disclosure, spawn, fetchImpl, now, setTimer, clearTimer, log, outbox, nodeBin, cwd });
    this.policy = { ...LIVE_POLICY, ...policy };
    this.child = null;
    this.state = 'idle';
    this.restarts = []; // times of restarts (for the hourly limit)
    this.failures = 0; // quick failures in a row (the backoff's index)
    this.lastRate = null;
    this.lastRateAt = null;
    this.lowSince = null;
    this.startedAt = null;
    this.lastSize = null;
    this.lastGrowAt = null;
    this.timers = new Set();
    this.onAir = null;
    this.title = null;
    this.titleAt = 0;
    this.titleDay = null;
    this.titleCount = 0;
    this.stopping = false;
    this.lastError = null;
    this.events = [];
  }

  // ------------------------------------------------------------------ timers (injectable for tests)

  after(seconds, fn) {
    const h = this.setTimer(() => {
      this.timers.delete(h);
      fn();
    }, seconds * 1000);
    this.timers.add(h);
    return h;
  }

  note(event, extra = {}) {
    const e = { at: this.now(), event, ...extra };
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
    this.log(`[live] ${event}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
    this.writeStatus();
    return e;
  }

  writeStatus() {
    if (!this.statusFile) return;
    const s = { state: this.state, pid: this.child?.pid || null, run: this.runs || 0, startedAt: this.startedAt, restartsLastHour: this.restarts.filter((t) => this.now() - t < 3600_000).length, failures: this.failures, lastKBps: this.lastRate, lastRateAt: this.lastRateAt, onAir: this.onAir, title: this.title, titleAt: this.titleAt || null, lastError: this.lastError, at: this.now(), events: this.events.slice(-20) };
    try {
      fs.mkdirSync(path.dirname(this.statusFile), { recursive: true });
      const tmp = `${this.statusFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
      fs.renameSync(tmp, this.statusFile);
    } catch {
      /* the status is a convenience */
    }
  }

  // ------------------------------------------------------------------ the channel

  async channelUp() {
    try {
      const r = await this.fetchImpl(`${this.channelUrl}/api/schedule`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ the stream

  async start() {
    this.stopping = false;
    this.note('supervisor started', { args: this.safeArgs() });
    await this.launch();
    this.after(this.policy.checkEvery, () => this.healthLoop());
    this.after(1, () => this.scheduleLoop());
  }

  /** The streamer's arguments as logged: never the key (the streamer reads it from its variable anyway). */
  safeArgs() {
    return this.streamArgs.map((a) => (/rtmps?:\/\/[^\s]*\/[A-Za-z0-9_-]{8,}/.test(a) ? a.replace(/\/[A-Za-z0-9_-]{8,}$/, '/<key>') : a));
  }

  async launch() {
    if (this.stopping) return;
    const hour = this.restarts.filter((t) => this.now() - t < 3600_000);
    if (hour.length >= this.policy.maxRestartsPerHour) {
      this.state = 'cooling';
      this.lastError = `${hour.length} restarts in an hour: pausing ${this.policy.cooldown} s`;
      this.note('too many restarts', { pause: this.policy.cooldown });
      this.restarts = [];
      this.after(this.policy.cooldown, () => this.launch());
      return;
    }
    const sched = await this.channelUp();
    if (!sched) {
      this.state = 'waiting';
      this.lastError = 'the channel server does not answer';
      const wait = this.policy.backoff[Math.min(this.failures, this.policy.backoff.length - 1)];
      this.failures++;
      this.note('channel down', { retryIn: wait });
      this.after(wait, () => this.launch());
      return;
    }
    this.onSchedule(sched);
    // a test file per run ("{n}" in its name: test-{n}.flv), so a restart never writes over the last run's file
    this.runs = (this.runs || 0) + 1;
    const args = this.streamArgs.map((a) => String(a).replace('{n}', String(this.runs)));
    this.currentOut = this.outFile ? String(this.outFile).replace('{n}', String(this.runs)) : null;
    const child = this.spawn(this.nodeBin, args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    this.child = child;
    this.state = 'running';
    this.startedAt = this.now();
    this.lastRateAt = this.now(); // the first rate line comes after ~13 s: the stall clock starts now
    this.lowSince = null;
    this.lastSize = null;
    this.lastGrowAt = this.now();
    this.note('stream started', { pid: child.pid, run: this.runs });
    let buf = '';
    const onData = (d) => {
      buf += String(d);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        this.onLine(line);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (d) => {
      const s = String(d).trim();
      if (s) this.lastError = s.slice(-300);
    });
    child.on('exit', (code, signal) => this.onExit(child, code, signal));
  }

  onLine(line) {
    const m = RATE.exec(line);
    if (!m) return;
    this.lastRate = Number(m[1]);
    this.lastRateAt = this.now();
    if (this.lastRate < this.policy.minKBps) this.lowSince ??= this.now();
    else this.lowSince = null;
    if (this.lastRate >= this.policy.minKBps && this.failures && this.now() - this.startedAt >= this.policy.healthyAfter * 1000) {
      this.failures = 0;
      this.note('healthy again: backoff reset');
    }
  }

  /** Why the run is unhealthy (null: healthy). */
  unhealthy() {
    if (!this.child) return null;
    const t = this.now();
    const stall = this.policy.stallSeconds * 1000;
    if (t - this.lastRateAt > stall) return `no data for ${Math.round((t - this.lastRateAt) / 1000)} s`;
    if (this.lowSince && t - this.lowSince > stall) return `under ${this.policy.minKBps} KB/s for ${Math.round((t - this.lowSince) / 1000)} s`;
    if (this.currentOut) {
      let size = null;
      try {
        size = fs.statSync(this.currentOut).size;
      } catch {
        size = null;
      }
      if (size !== null && size !== this.lastSize) {
        this.lastSize = size;
        this.lastGrowAt = t;
      }
      if (t - this.lastGrowAt > stall + 15_000) return `the file has not grown for ${Math.round((t - this.lastGrowAt) / 1000)} s`;
    }
    return null;
  }

  healthLoop() {
    if (this.stopping) return;
    const why = this.unhealthy();
    if (why) {
      this.lastError = why;
      this.note('unhealthy: restarting', { why });
      this.kill(this.child);
    }
    this.writeStatus();
    this.after(this.policy.checkEvery, () => this.healthLoop());
  }

  kill(child) {
    if (!child || child.exitCode !== null || child.killed && child.signalCode) return;
    try {
      child.kill('SIGTERM');
    } catch {
      /* gone */
    }
    this.after(this.policy.killGrace, () => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* gone */
        }
      }
    });
  }

  onExit(child, code, signal) {
    if (child !== this.child) return;
    this.child = null;
    const ran = (this.now() - this.startedAt) / 1000;
    this.note('stream ended', { code, signal, ran: Math.round(ran) });
    if (this.stopping) {
      this.state = 'stopped';
      this.writeStatus();
      return;
    }
    // a run that held a while is not a quick failure
    if (ran >= this.policy.healthyAfter) this.failures = 0;
    const wait = this.policy.backoff[Math.min(this.failures, this.policy.backoff.length - 1)];
    this.failures++;
    this.restarts.push(this.now());
    this.state = 'restarting';
    this.note('restart scheduled', { in: wait });
    this.after(wait, () => this.launch());
  }

  async stop() {
    this.stopping = true;
    for (const h of this.timers) this.clearTimer(h);
    this.timers.clear();
    const child = this.child;
    if (child) {
      await new Promise((resolve) => {
        child.once('exit', resolve);
        this.kill(child);
        // (the SIGKILL timer was cleared with the others: arm it once more)
        this.setTimer(() => {
          if (child.exitCode === null && child.signalCode === null) {
            try {
              child.kill('SIGKILL');
            } catch {
              /* gone */
            }
          }
          resolve();
        }, this.policy.killGrace * 1000);
      });
    }
    this.state = 'stopped';
    this.note('supervisor stopped');
  }

  // ------------------------------------------------------------------ the title and description

  async scheduleLoop() {
    if (this.stopping) return;
    const sched = await this.channelUp();
    if (sched) await this.onSchedule(sched);
    this.after(this.policy.scheduleEvery, () => this.scheduleLoop());
  }

  async onSchedule(sched) {
    const now = sched?.now?.kind === 'episode' ? { id: sched.now.id || null, title: sched.now.title || null } : null;
    const key = now?.id || now?.title || null;
    if (!key || key === (this.onAir?.id || this.onAir?.title)) return null;
    const t = this.now();
    const day = new Date(t).toISOString().slice(0, 10);
    if (day !== this.titleDay) {
      this.titleDay = day;
      this.titleCount = 0;
    }
    if (this.titleAt && t - this.titleAt < this.policy.titleEvery * 1000) return null; // (the next change will carry it)
    if (this.titleCount >= this.policy.titlesPerDay) return null;
    this.onAir = now;
    const meta = { title: liveTitle(now, { recorded: this.recorded }), description: liveDescription(sched, { disclosure: this.disclosure, recorded: this.recorded }) };
    this.title = meta.title;
    this.titleAt = t;
    this.titleCount++;
    let result;
    if (this.live && this.youtube && this.videoId) {
      try {
        await this.youtube.liveUpdate(this.videoId, meta);
        result = { ok: true, dryRun: false };
      } catch (err) {
        result = { ok: false, dryRun: false, error: String(err?.message || err) };
      }
    } else {
      const plan = this.youtube ? this.youtube.planLiveUpdate(this.videoId, meta) : [{ step: 'live-update', body: meta }];
      result = { ok: true, dryRun: true, requests: plan };
    }
    if (this.outbox) {
      try {
        fs.mkdirSync(path.dirname(this.outbox), { recursive: true });
        fs.appendFileSync(this.outbox, `${JSON.stringify({ at: t, platform: 'youtube', live: true, ...result, title: meta.title })}\n`);
      } catch {
        /* the outbox is a record */
      }
    }
    this.note(result.dryRun ? 'title (dry run)' : result.ok ? 'title updated' : 'title update failed', { title: meta.title, error: result.error });
    return { meta, result };
  }
}
