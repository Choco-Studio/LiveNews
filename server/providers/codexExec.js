import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs `codex exec` non-interactively so generation draws on the ChatGPT plan
 * the CLI is logged into (`codex login`). It runs in an empty temp directory
 * with a read-only sandbox, so the agent has nothing to touch.
 */
export function createCodexProvider(cfg) {
  let queue = Promise.resolve();
  return {
    name: 'codex',
    available: () => true, // checked at runtime: spawning fails if the CLI is missing
    // Calls are serialized: they share one ChatGPT login (auth.json) that Codex refreshes in place.
    generate(request) {
      const run = queue.then(() => this.generateNow(request));
      queue = run.catch(() => {});
      return run;
    },
    async generateNow({ prompt }) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-codex-'));
      const outFile = path.join(dir, 'last-message.txt');
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--ephemeral', // do not pile up session files on a 24/7 server
        '--sandbox',
        'read-only',
        '-m',
        cfg.model,
        '-o',
        outFile,
        ...cfg.extraArgs,
        '-',
      ];
      const fullPrompt =
        'Do not run commands or read files: everything you need is in this message. ' +
        'Your final answer must be only the requested JSON.\n\n' +
        prompt;
      try {
        const { stdout, stderr, code } = await run(cfg.bin, args, fullPrompt, dir, cfg.timeoutMs);
        const usage = { input: 0, output: 0, cached: 0 };
        let lastMessage = '';
        let errorMsg = '';
        let failed = false;
        for (const line of stdout.split('\n')) {
          if (!line.trim().startsWith('{')) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'turn.completed' && ev.usage) {
            usage.input += ev.usage.input_tokens || 0;
            usage.cached += ev.usage.cached_input_tokens || 0;
            usage.output += ev.usage.output_tokens || 0;
          } else if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') {
            lastMessage = ev.item.text || lastMessage;
          } else if (ev.type === 'turn.failed') {
            failed = true;
            errorMsg = ev.error?.message || 'turn failed';
          } else if (ev.type === 'error') {
            errorMsg = ev.message || errorMsg; // may be a non-fatal "Reconnecting..." notice
          }
        }
        if (fs.existsSync(outFile)) lastMessage = fs.readFileSync(outFile, 'utf8') || lastMessage;
        if (failed || !lastMessage || (code !== 0 && !fs.existsSync(outFile))) {
          const detail = errorMsg || stderr.trim().split('\n').slice(-3).join(' ') || `exit code ${code}`;
          throw new Error(`codex exec returned no answer: ${detail}`);
        }
        return { text: lastMessage, usage };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

function run(bin, args, input, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`codex exec timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error(`"${bin}" not found (install the Codex CLI)`) : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.stdin.on('error', () => {}); // the CLI may exit before reading all input (EPIPE)
    child.stdin.end(input);
  });
}
