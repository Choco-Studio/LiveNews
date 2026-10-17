// The face reader, run and watched by the station itself (the coordinator's round 8: no operator has to start it). The
// picture desk queues the portraits it needs read (server/faces.js: a grave story's sober portrait, the portraits a
// public figure's rotation needs) and reads the verdicts back; tools/pictures/faces.mjs reads them in headless
// Chromium. Here it runs as a child process in its watch mode (it reads the queue again every minute), and when it
// exits, for whatever reason, it is started again after a pause that doubles each time it fails soon after starting
// (5 s, 10 s, 20 s ... at most 30 min) and is back to 5 s once it has run a while. FACE_READER=off: never started (a
// grave story's portrait then never airs, as before: unread is unknown).
//
//   new FaceReader({ dir, enabled }).start()   .stop()   .exitWithStation()
//   .status() -> { enabled, running, pid, restarts, backoffMs, last }
//
// The child never listens on the station's port: it serves its page on a free port of its own (faces.mjs refuses 8711).
import { spawn as spawnChild } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const READER = path.join(ROOT, 'tools', 'pictures', 'faces.mjs');
export const BACKOFF = Object.freeze({ minMs: 5_000, maxMs: 30 * 60_000, stableMs: 10 * 60_000 });

export class FaceReader {
  constructor({ dir, enabled = true, watchS = 60, script = READER, node = process.execPath, env = process.env, spawn = spawnChild, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = console, backoff = BACKOFF } = {}) {
    this.dir = dir;
    this.enabled = !!enabled && !!dir;
    this.watchS = watchS;
    this.script = script;
    this.node = node;
    this.env = env;
    this.spawn = spawn;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.log = log;
    this.backoff = backoff;
    this.child = null;
    this.timer = null;
    this.stopping = false;
    this.restarts = 0;
    this.delay = backoff.minMs;
    this.startedAt = 0;
    this.last = null; // { code, signal, ranMs, at }
  }

  /** Start the reader (once; a stopped reader starts again). */
  start() {
    if (!this.enabled || this.child || this.timer) return false;
    this.stopping = false;
    this.launch();
    return true;
  }

  launch() {
    this.timer = null;
    if (this.stopping) return;
    let child;
    try {
      child = this.spawn(this.node, [this.script, '--dir', this.dir, '--watch', String(this.watchS)], { cwd: ROOT, env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      this.log.warn?.(`[faces] could not start the face reader: ${err.message}`);
      return this.exited({ code: null, signal: null, error: err.message });
    }
    this.child = child;
    this.startedAt = this.now();
    const relay = (stream, level) => {
      let rest = '';
      stream?.on?.('data', (buf) => {
        const lines = (rest + String(buf)).split('\n');
        rest = lines.pop();
        for (const line of lines) if (line.trim()) this.log[level]?.(line.startsWith('[faces]') ? line : `[faces] ${line}`);
      });
    };
    relay(child.stdout, 'info');
    relay(child.stderr, 'warn');
    child.on('error', (err) => {
      // (a spawn that failed reports here and may never exit)
      if (this.child === child) {
        this.child = null;
        this.exited({ code: null, signal: null, error: err.message });
      }
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.exited({ code, signal });
    });
  }

  exited({ code, signal, error = null }) {
    const ranMs = this.startedAt ? this.now() - this.startedAt : 0;
    this.last = { code, signal, ranMs, at: this.now(), ...(error ? { error } : {}) };
    if (this.stopping) return;
    // a reader that ran a while is started again soon; one that keeps failing at once waits longer each time
    this.delay = ranMs >= this.backoff.stableMs ? this.backoff.minMs : this.restarts ? Math.min(this.backoff.maxMs, this.delay * 2) : this.backoff.minMs;
    this.restarts++;
    this.log.warn?.(`[faces] the face reader stopped (${error || (signal ? `signal ${signal}` : `exit ${code}`)} after ${Math.round(ranMs / 1000)} s): starting it again in ${Math.round(this.delay / 1000)} s`);
    this.timer = this.setTimer(() => this.launch(), this.delay);
    this.timer?.unref?.();
  }

  /** Stop the reader and do not start it again. */
  stop() {
    this.stopping = true;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        // (already gone)
      }
    }
  }

  /** The reader never outlives the station: stopped on exit and on SIGINT/SIGTERM, the signal then doing its default. */
  exitWithStation(proc = process) {
    const stop = () => this.stop();
    proc.once('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) {
      proc.once(sig, () => {
        stop();
        proc.kill(proc.pid, sig);
      });
    }
    return this;
  }

  status() {
    return { enabled: this.enabled, running: !!this.child, pid: this.child?.pid ?? null, restarts: this.restarts, backoffMs: this.delay, last: this.last };
  }
}
