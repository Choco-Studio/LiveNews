// One Kokoro voice worker process (tools/voice/kokoro_worker.py), spoken to in
// JSON lines: the first stdout line says whether the model loaded, then every
// request line gets exactly one reply line with the same id. The process stays
// up between episodes (the model takes seconds to load); a crash or a stuck
// request rejects what was waiting and leaves the worker dead, and the voice
// service decides whether to start a new one.
import { spawn as nodeSpawn } from 'node:child_process';

export class KokoroWorker {
  /**
   * @param {object} o
   * @param {string} o.python    interpreter (default python3)
   * @param {string} o.script    absolute path of kokoro_worker.py
   * @param {object} [o.env]     extra environment (KOKORO_DIR, KOKORO_THREADS...)
   * @param {number} [o.readyTimeoutMs] model load budget
   * @param {Function} [o.spawn] child_process.spawn (tests inject a fake)
   */
  constructor({ python = 'python3', script, env = {}, readyTimeoutMs = 180_000, spawn = nodeSpawn, log = console } = {}) {
    this.python = python;
    this.script = script;
    this.env = env;
    this.readyTimeoutMs = readyTimeoutMs;
    this.spawnFn = spawn;
    this.log = log;
    this.child = null;
    this.info = null; // the ready line
    this.pending = new Map(); // id -> { resolve, reject, timer }
    this.seq = 0;
    this.buffer = '';
    this.stderrTail = [];
    this.alive = false;
    this.starting = null;
  }

  /** Spawn and wait for the ready line. Resolves with it; rejects if the model cannot load. */
  start() {
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.kill();
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error(`model did not load within ${Math.round(this.readyTimeoutMs / 1000)} s`)), this.readyTimeoutMs);
      let child;
      try {
        child = this.spawnFn(this.python, [this.script], {
          env: { ...process.env, PYTHONUNBUFFERED: '1', ...this.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        fail(err);
        return;
      }
      this.child = child;
      child.on('error', (err) => {
        fail(err);
        this.onExit(err);
      });
      child.on('exit', (code, signal) => {
        fail(new Error(`worker exited (${signal || `code ${code}`})${this.stderrTail.length ? `: ${this.stderrTail.at(-1)}` : ''}`));
        this.onExit(new Error(`voice worker exited (${signal || `code ${code}`})`));
      });
      child.stdin?.on?.('error', () => {}); // a dead pipe is reported by 'exit'
      child.stderr?.setEncoding?.('utf8');
      child.stderr?.on('data', (chunk) => {
        for (const line of String(chunk).split('\n')) {
          if (!line.trim()) continue;
          this.stderrTail.push(line.slice(0, 300));
          if (this.stderrTail.length > 20) this.stderrTail.shift();
        }
      });
      child.stdout.setEncoding?.('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let nl;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl).trim();
          this.buffer = this.buffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue; // the protocol keeps stdout clean; ignore anything else
          }
          if (!settled && 'ready' in msg) {
            if (msg.ready) {
              settled = true;
              clearTimeout(timer);
              this.info = msg;
              this.alive = true;
              resolve(msg);
            } else fail(new Error(msg.error || 'model failed to load'));
            continue;
          }
          this.onReply(msg);
        }
      });
    });
    return this.starting;
  }

  onReply(msg) {
    const job = this.pending.get(msg.id);
    if (!job) return; // a reply after its timeout: nobody is waiting any more
    this.pending.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.ok) job.resolve(msg);
    else job.reject(new Error(msg.error || 'synthesis failed'));
  }

  onExit(err) {
    this.alive = false;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(err);
    }
    this.pending.clear();
  }

  /** Send one request; resolves with the reply (ok:true), rejects on error, exit or timeout. */
  request(body, { timeoutMs = 300_000 } = {}) {
    if (!this.alive || !this.child) return Promise.reject(new Error('voice worker not running'));
    const id = `r${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`synthesis took longer than ${Math.round(timeoutMs / 1000)} s`));
        // A stuck worker would delay every later clip: start over.
        this.kill();
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  kill() {
    const child = this.child;
    this.alive = false;
    if (!child) return;
    try {
      child.stdin?.end?.();
    } catch { /* already closed */ }
    try {
      child.kill('SIGTERM');
    } catch { /* already gone */ }
    const hard = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch { /* gone */ }
    }, 3000);
    hard.unref?.();
  }

  /** Ask the worker to finish and exit (the current clip completes first). */
  close() {
    if (!this.child) return;
    try {
      if (this.alive) this.child.stdin.write('{"cmd":"quit"}\n');
      this.child.stdin.end();
    } catch { /* ignore */ }
    this.alive = false;
    const child = this.child;
    const hard = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch { /* gone */ }
    }, 5000);
    hard.unref?.();
  }
}
