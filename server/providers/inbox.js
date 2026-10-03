// "Inbox" provider: lets an external agent (Claude Code, another LLM, or a person
// at a keyboard) act as the channel's AI. The server drops the very same prompt
// it would send to Codex/OpenAI/DeepSeek into a folder, together with a small
// JSON description of the request, and then waits for the answer to appear
// next to it. Nothing here knows about episodes: the producer decides what to
// ask, the validators in writer.js decide whether the answer is good.
//
// Files for one request (stem = "<seq>-<stage>-<programId>", e.g. 000012-write-world-now):
//   <stem>.request.json   what is being asked: stage, programme, presenters, candidate stories
//   <stem>.prompt.md      the exact prompt (written last: the file an agent should watch for)
//   <stem>.response.txt   the answer (or <stem>.response.json), written by the agent
//   <stem>.done           optional marker: "the response file is complete, read it now"
//   <stem>.error.txt      optional: the agent cannot answer; the chain moves on at once
// A response is only read when the .done marker exists or when the response is
// already valid JSON, so a file that is still being written is never half-read.
// Finished requests move to done/, abandoned ones to expired/ (both pruned), so
// the top level of the folder is always exactly the list of open requests.

import fs from 'node:fs';
import path from 'node:path';
import { isBreaking } from '../news.js';

const DEFAULTS = { dir: 'data/ai-inbox', timeoutMs: 1_800_000 };
const SEQ_WIDTH = 6;
const STEM = /^(\d+)-[^.]*/;
const KEEP_STEMS = 50; // per archive folder: a 24/7 server must not fill the disk
const SUMMARY_MAX = 2000;

const README = `# AI inbox

The GLOBIT 24 server is asking for an AI. Each open request is a group of files
that share a stem (<seq>-<stage>-<programme>):

  <stem>.prompt.md      the exact prompt; follow it
  <stem>.request.json   stage, programme, presenters, candidate stories, deadline

Answer with the output the prompt asks for (a single JSON object):

  1. write <stem>.response.txt (or <stem>.response.json)
  2. then create an empty <stem>.done   (only needed when the answer is not plain JSON)

If you cannot answer, write the reason into <stem>.error.txt; the server then
falls through to the next provider immediately. Open requests are the
*.prompt.md files in this folder; answered ones move to done/, abandoned ones
(deadline passed) to expired/.
`;

/** Request ids end up in file names: keep them short, lower case and safe. */
const slug = (value, fallback) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safe = (fn, fallback = undefined) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Strips a BOM and a surrounding ``` fence, which agents like to add around JSON. */
function unwrap(text) {
  const t = String(text).replace(/^﻿/, '').trim();
  const fenced = t.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : t;
}

/** True when the text is a complete JSON object/array (a partial write can never be). */
function isCompleteJson(text) {
  try {
    const value = JSON.parse(unwrap(text));
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

function describeStories(stories) {
  return (Array.isArray(stories) ? stories : []).map((s) => {
    const image = typeof s.image === 'string' ? s.image : '';
    return {
      id: s.id,
      title: s.title,
      summary: String(s.summary ?? '').slice(0, SUMMARY_MAX),
      source: s.source,
      category: s.category,
      outlets: s.outlets || 1,
      hasImage: !!s.image,
      ...(/^https?:\/\//i.test(image) ? { imageUrl: image } : {}),
      ...(isBreaking(s.title) ? { breaking: true } : {}),
      ...(s.live ? { live: true } : {}),
    };
  });
}

function describePresenters(presenters) {
  return Object.entries(presenters || {}).map(([slot, p]) => ({
    slot,
    id: p?.id,
    name: p?.name,
    role: p?.role,
    personality: p?.personality,
  }));
}

/**
 * @param {{ dir?: string, timeoutMs?: number }} [cfg]
 * @param {{ pollMs?: number, keep?: number, log?: object }} [options] test hooks and tuning
 */
export function createInboxProvider(cfg = {}, { pollMs = 500, keep = KEEP_STEMS, log = console } = {}) {
  const dir = path.resolve(cfg.dir || DEFAULTS.dir);
  const timeoutMs = Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs > 0 ? cfg.timeoutMs : DEFAULTS.timeoutMs;
  const doneDir = path.join(dir, 'done');
  const expiredDir = path.join(dir, 'expired');
  const inFlight = new Set(); // stems this process is waiting on
  let wroteReadme = false;

  const file = (stem, ext) => path.join(dir, `${stem}.${ext}`);

  /** Largest sequence number used so far, in the open folder and both archives. */
  function lastSeq() {
    let max = 0;
    for (const d of [dir, doneDir, expiredDir]) {
      for (const name of safe(() => fs.readdirSync(d), [])) {
        const m = name.match(STEM);
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
    return max;
  }

  /** Moves every file of one request into an archive folder (best effort, never throws). */
  function archive(stem, bucket) {
    for (const name of safe(() => fs.readdirSync(dir), [])) {
      if (!name.startsWith(`${stem}.`)) continue;
      safe(() => {
        fs.mkdirSync(bucket, { recursive: true });
        fs.renameSync(path.join(dir, name), path.join(bucket, name));
      });
    }
    prune(bucket);
  }

  function prune(bucket) {
    const names = safe(() => fs.readdirSync(bucket), []);
    const stems = [...new Set(names.map((n) => n.match(STEM)?.[0]).filter(Boolean))].sort();
    const old = new Set(stems.slice(0, Math.max(0, stems.length - keep)));
    for (const name of names) {
      if (old.has(name.match(STEM)?.[0])) safe(() => fs.rmSync(path.join(bucket, name), { force: true }));
    }
  }

  /** Files left behind by an earlier run (or an answer that came too late) are nobody's request any more. */
  function sweepOrphans() {
    const orphans = new Set();
    for (const name of safe(() => fs.readdirSync(dir), [])) {
      const stem = name.match(STEM)?.[0];
      if (stem && !inFlight.has(stem)) orphans.add(stem);
    }
    for (const stem of orphans) archive(stem, expiredDir);
  }

  function writeAtomic(target, content) {
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.tmp`);
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  }

  function postRequest(request) {
    fs.mkdirSync(dir, { recursive: true });
    sweepOrphans();
    if (!wroteReadme) {
      wroteReadme = true;
      safe(() => {
        const readme = path.join(dir, 'README.md');
        if (!fs.existsSync(readme)) fs.writeFileSync(readme, README);
      });
    }
    // Synchronous from here to the last write: no other request can take the same sequence number.
    const seq = lastSeq() + 1;
    const stem = `${String(seq).padStart(SEQ_WIDTH, '0')}-${slug(request.stage, 'request')}-${slug(request.program?.id, 'programme')}`;
    const createdAt = new Date();
    const description = {
      version: 1,
      id: stem,
      seq,
      stage: request.stage ?? null,
      createdAt: createdAt.toISOString(),
      timeoutMs,
      expiresAt: new Date(createdAt.getTime() + timeoutMs).toISOString(),
      channel: request.channelName ?? null,
      program: {
        id: request.program?.id ?? null,
        title: request.program?.title ?? null,
        tagline: request.program?.tagline ?? null,
        stories: request.program?.stories ?? null,
        features: request.program?.features ?? [],
      },
      presenters: describePresenters(request.presenters),
      count: request.count ?? null,
      stories: describeStories(request.stories),
      ...(request.script ? { script: request.script } : {}),
      files: {
        prompt: `${stem}.prompt.md`,
        respond: [`${stem}.response.txt`, `${stem}.response.json`],
        doneMarker: `${stem}.done`,
        errorMarker: `${stem}.error.txt`,
      },
    };
    inFlight.add(stem);
    try {
      writeAtomic(file(stem, 'request.json'), `${JSON.stringify(description, null, 2)}\n`);
      writeAtomic(file(stem, 'prompt.md'), String(request.prompt ?? ''));
    } catch (err) {
      inFlight.delete(stem);
      throw err;
    }
    return stem;
  }

  /** One look at the folder: the response text, null while it is not ready, or an error. */
  function check(stem) {
    const failure = safe(() => fs.readFileSync(file(stem, 'error.txt'), 'utf8'));
    if (failure !== undefined) throw new Error(`inbox request declined: ${failure.trim().slice(0, 200) || 'no reason given'}`);
    const done = fs.existsSync(file(stem, 'done'));
    let empty = false;
    for (const ext of ['response.json', 'response.txt']) {
      const text = safe(() => fs.readFileSync(file(stem, ext), 'utf8'));
      if (text === undefined) continue;
      if (!text.trim()) {
        empty = true;
        continue;
      }
      if (done || isCompleteJson(text)) return text.replace(/^﻿/, '');
    }
    if (done && empty) throw new Error('inbox response is empty');
    return null;
  }

  async function awaitResponse(stem) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const text = check(stem);
      if (text !== null) return text;
      if (Date.now() >= deadline) throw new Error(`inbox: no answer for ${stem} after ${Math.round(timeoutMs / 1000)} s`);
      await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
  }

  return {
    name: 'inbox',
    /** The folder is created on demand: the provider is usable when it can be written to. */
    available() {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
    async generate(request) {
      const stem = postRequest(request);
      log.info?.(`[inbox] waiting for ${stem} (answer in ${dir})`);
      try {
        const text = await awaitResponse(stem);
        archive(stem, doneDir);
        return { text, usage: { input: 0, output: 0, cached: 0 } };
      } catch (err) {
        archive(stem, expiredDir);
        throw err;
      } finally {
        inFlight.delete(stem);
      }
    },
  };
}
