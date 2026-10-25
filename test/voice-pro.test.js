// The professional voices (docs/roadmap/critique/voices-pro.md): which presenters a professional engine reads, the
// month's ceiling, the clip names (a Kokoro clip keeps its own), a Kokoro stand-in voiced again later, and the Python
// engine's own tests (tools/voice/test_pro.py: Inworld and ElevenLabs stand-ins, the word timings, the pauses).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as speech from '../public/js/voice/speechtext.js';
import { segmentRequest, clipId, RECIPE } from '../server/voice/plan.js';
import { VoiceService } from '../server/voice/service.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASTING = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'casting.json'), 'utf8'));
const PROCAST = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'procast.json'), 'utf8'));
const CHANNEL = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'channel.json'), 'utf8'));
const silent = { info() {}, warn() {}, error() {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voice-pro-'));

test('every character has a voice brief to be designed from, and none is a real person', () => {
  const cast = Object.keys(CASTING).filter((k) => !k.startsWith('_'));
  assert.deepEqual(Object.keys(PROCAST.voices).sort(), cast.sort());
  for (const [id, v] of Object.entries(PROCAST.voices)) {
    assert.ok(v.design.length > 80 && v.design.length <= 1024, `${id}: a description the engines take (7 to 1,024 characters)`);
    assert.match(v.design, /no breaths, no laughter/, `${id}: the owner's rules in every brief`);
    assert.doesNotMatch(v.design, /\b(sounds? like|in the style of|imitat|impersonat)/i, `${id}: never a real person's voice`);
    for (const e of ['inworld', 'elevenlabs']) assert.ok(e in v, `${id}: ${e}`);
  }
});

test('the request carries the professional voice; a Kokoro clip keeps the name it had', () => {
  const seg = { type: 'story', anchor: 'A', emotion: 'neutral', text: 'The bridge reopens on Monday.', cues: [] };
  const presenter = { id: 'paco', ...CHANNEL.presenters.paco };
  const plain = segmentRequest(seg, { presenterId: 'paco', presenter, casting: CASTING, speech });
  assert.equal(plain.pro, undefined);
  // the name of a Kokoro clip is what it was before the professional voices (nothing on the server is voiced again)
  const old = `v${crypto.createHash('sha256').update(JSON.stringify([RECIPE, 'fp', plain.text, plain.voice, plain.speed, plain.lang, plain.effect, plain.pauses || null, plain.chain || null, plain.phrases || null])).digest('hex').slice(0, 20)}`;
  assert.equal(clipId(plain, 'fp'), old);
  const pro = { engine: 'inworld', voiceId: 'v1', model: 'inworld-tts-2' };
  const withPro = segmentRequest(seg, { presenterId: 'paco', presenter, casting: CASTING, speech, pro });
  assert.deepEqual(withPro.pro, pro);
  assert.notEqual(clipId(withPro, 'fp'), old, 'a professional reading is a clip of its own');
  assert.notEqual(clipId({ ...withPro, pro: { ...pro, voiceId: 'v2' } }, 'fp'), clipId(withPro, 'fp'), 'another voice, another clip');
  assert.equal(withPro.voice, plain.voice, 'the Kokoro voice stays in the request: the fallback');
});

function service({ pro = 'inworld', cap = 1000, procast = null, reply = {} } = {}) {
  const dir = tmp();
  const procastFile = path.join(dir, 'procast.json');
  fs.writeFileSync(procastFile, JSON.stringify(procast || { voices: { paco: { speed: 1, inworld: { voiceId: 'iw-paco', model: 'inworld-tts-2' } }, lola: { inworld: { voiceId: null } } } }));
  const requests = [];
  const factory = () => {
    const w = {
      alive: false,
      info: { ready: true, voices: ['bm_george'] },
      async start() {
        w.alive = true;
        return w.info;
      },
      async request(body) {
        requests.push(body);
        fs.writeFileSync(body.out, Buffer.from('OggS fake clip'));
        const words = [...body.text.matchAll(/\S+/g)].map((m, i) => ({ t: 0.05 + i * 0.3, char: m.index, len: m[0].length }));
        const r = typeof reply === 'function' ? reply(body) : reply;
        return { ok: true, out: body.out, duration: 0.3 * words.length + 0.2, words, phrases: [], voice: body.voice, lang: body.lang, speed: body.speed, effect: null, engine: body.pro ? body.pro.engine : 'kokoro', chars: body.pro ? body.text.length : undefined, ...r };
      },
      close() {
        w.alive = false;
      },
      kill() {
        w.alive = false;
      },
    };
    return w;
  };
  const s = new VoiceService({ config: { engine: 'kokoro', dir, budgetSeconds: 5, firstBudgetSeconds: 0, cacheMb: 50, pro, proMonthlyChars: cap }, root: REPO, log: silent, createWorker: factory, loadSpeech: async () => speech, loadAds: async () => [], procastFile });
  return { s, dir, requests };
}
const ctx = (segments) => ({ program: { id: 'world-now', title: 'WORLD NOW' }, presenters: { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } }, episode: { segments } });
const SEGS = () => [
  { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening. The bridge reopens on Monday.', cues: [] },
  { type: 'chat', anchor: 'B', emotion: 'happy', text: 'Good news for the morning traffic.', cues: [] },
];

test('the service: the presenters with a professional voice get it, the others keep Kokoro, and the use is counted', async () => {
  const { s, dir, requests } = service();
  await s.voiceEpisode(ctx(SEGS()));
  const paco = requests.find((r) => r.text.startsWith('Good evening'));
  const lola = requests.find((r) => r.text.startsWith('Good news'));
  assert.deepEqual(paco.pro, { engine: 'inworld', voiceId: 'iw-paco', model: 'inworld-tts-2', speed: 1 });
  assert.equal(lola.pro, undefined, 'no voice there yet: Kokoro');
  const u = JSON.parse(fs.readFileSync(path.join(dir, 'pro-usage.json'), 'utf8'));
  assert.equal(u.chars, paco.text.length);
  assert.equal(u.clips, 1);
  assert.equal(s.status().pro.engine, 'inworld');
  // off: everyone on Kokoro
  const off = service({ pro: '' });
  await off.s.voiceEpisode(ctx(SEGS()));
  assert.ok(off.requests.every((r) => !r.pro));
  assert.equal(off.s.status().pro, null);
});

test('the month\'s ceiling: past it, Kokoro until the month turns', async () => {
  const { s, dir, requests } = service({ cap: 30 });
  fs.writeFileSync(path.join(dir, 'pro-usage.json'), JSON.stringify({ month: new Date().toISOString().slice(0, 7), chars: 30, clips: 3, fallbacks: 0 }));
  s.proUsage = JSON.parse(fs.readFileSync(path.join(dir, 'pro-usage.json'), 'utf8'));
  await s.voiceEpisode(ctx(SEGS()));
  assert.ok(requests.every((r) => !r.pro), 'spent: no professional request');
  // a new month starts from nothing
  s.proUsage = { month: '2000-01', chars: 999999, clips: 0, fallbacks: 0 };
  assert.equal(s.usage().chars, 0);
});

test('a clip Kokoro read when the professional engine could not is counted, kept a while, then voiced again', async () => {
  const { s, dir, requests } = service({ reply: (b) => (b.pro ? { engine: 'kokoro', fallback: 'HTTP 503: down', chars: undefined } : {}) });
  await s.voiceEpisode(ctx(SEGS()));
  const u = JSON.parse(fs.readFileSync(path.join(dir, 'pro-usage.json'), 'utf8'));
  assert.equal(u.fallbacks, 1);
  assert.equal(u.chars, 0, 'nothing billed');
  assert.match(u.lastFallback.why, /HTTP 503/);
  // straight away: the stand-in is kept (no hammering the vendor)
  const before = requests.length;
  await s.voiceEpisode(ctx(SEGS()));
  assert.equal(requests.length, before, 'kept for now');
  // half an hour later: voiced again
  const pacoReq = requests.find((r) => r.pro);
  const cid = clipId(pacoReq, s.engineFingerprint());
  const meta = s.cache.get(cid);
  assert.equal(meta.fallback, 'HTTP 503: down');
  s.cache.put(cid, { ...meta, createdAt: new Date(Date.now() - 31 * 60_000).toISOString() });
  await s.voiceEpisode(ctx(SEGS()));
  assert.equal(requests.filter((r) => r.pro).length, 2, 'voiced again');
});

const py = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' });
test('the engine itself (tools/voice/test_pro.py: Inworld and ElevenLabs stand-ins)', { skip: py.status !== 0 && 'no python3 with numpy', timeout: 120_000 }, () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', path.join(REPO, 'tools', 'voice'), '-p', 'test_pro.py'], { encoding: 'utf8', cwd: REPO, timeout: 110_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /OK/);
});

test('the design tool: three candidates a character from its brief, a page to choose from, the pick kept and written down', { timeout: 60_000 }, async () => {
  const dir = tmp();
  const procast = path.join(dir, 'procast.json');
  fs.copyFileSync(path.join(REPO, 'server/voice/procast.json'), procast);
  // the vendors' stand-in, in a process of its own (the tool runs with spawnSync, which holds this one)
  const { spawn } = await import('node:child_process');
  const log = path.join(dir, 'calls.jsonl');
  const child = spawn(process.execPath, ['-e', `
    const http = require('http'), fs = require('fs');
    const mp3 = Buffer.from('ID3fake-mp3-bytes').toString('base64');
    let n = 0;
    http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        const j = b ? JSON.parse(b) : {};
        fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ url: req.url, auth: req.headers.authorization || req.headers['xi-api-key'], body: j }) + '\\n');
        res.setHeader('content-type', 'application/json');
        if (req.url === '/voices/v1/voices:design') return res.end(JSON.stringify({ previewVoices: [1, 2, 3].map((k) => ({ voiceId: 'ws__design-' + k, previewText: j.previewText, previewAudio: mp3 })) }));
        if (req.url.startsWith('/voices/v1/voices/')) return res.end(JSON.stringify({ voiceId: 'ws__paco-kept' }));
        if (req.url.startsWith('/v1/text-to-voice/design')) return res.end(JSON.stringify({ previews: [1, 2].map(() => ({ generated_voice_id: 'gen-' + ++n, audio_base_64: mp3 })) }));
        if (req.url === '/v1/text-to-voice') return res.end(JSON.stringify({ voice_id: 'el-paco-kept' }));
        res.statusCode = 404;
        res.end('{}');
      });
    }).listen(0, '127.0.0.1', function () { console.log(this.address().port); });
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise((r) => child.stdout.once('data', (d) => r(String(d).trim())));
    const base = `http://127.0.0.1:${port}`;
    const run = (args, extra = {}) => spawnSync(process.execPath, [path.join(REPO, 'tools/voice/pro-design.mjs'), ...args, '--out', dir, '--procast', procast], { encoding: 'utf8', env: { ...process.env, INWORLD_API_BASE: base, ELEVENLABS_API_BASE: base, INWORLD_API_KEY: 'aWQ6cw==', ELEVENLABS_API_KEY: 'xi', ...extra } });
    const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    let r = run(['--engine', 'inworld', '--only', 'paco']);
    assert.equal(r.status, 0, r.stderr);
    const cands = JSON.parse(fs.readFileSync(path.join(dir, 'inworld', 'paco', 'candidates.json'), 'utf8'));
    assert.deepEqual(cands.candidates.map((c) => [c.n, c.id, c.file]), [[1, 'ws__design-1', '1.mp3'], [2, 'ws__design-2', '2.mp3'], [3, 'ws__design-3', '3.mp3']]);
    const d = calls()[0];
    assert.equal(d.auth, 'Basic aWQ6cw==');
    assert.equal(d.body.languageCode, 'en-GB', 'Paco is British');
    assert.match(d.body.designPrompt, /veteran British male news anchor/);
    assert.ok(d.body.previewText.length >= 100 && d.body.previewText.length <= 400, 'a line of his own programme, as the engine takes it');
    // the page to choose from
    r = run(['--engine', 'inworld', '--page']);
    assert.equal(r.status, 0, r.stderr);
    const page = fs.readFileSync(path.join(dir, 'inworld', 'index.html'), 'utf8');
    assert.match(page, /Voces candidatas/);
    assert.equal((page.match(/<audio /g) || []).length, 3);
    // the pick: kept in the library and written down
    r = run(['--engine', 'inworld', '--pick', 'paco=2']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(calls().some((c) => c.url === '/voices/v1/voices/ws__design-2:publish'));
    assert.equal(JSON.parse(fs.readFileSync(procast, 'utf8')).voices.paco.inworld.voiceId, 'ws__paco-kept');
    // ElevenLabs: previews until there are three, then created from the generated id
    r = run(['--engine', 'elevenlabs', '--only', 'nova']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'elevenlabs', 'nova', 'candidates.json'), 'utf8')).candidates.length, 3);
    assert.ok(calls().filter((c) => c.url.startsWith('/v1/text-to-voice/design')).every((c) => c.auth === 'xi' && c.body.text.length >= 100));
    r = run(['--engine', 'elevenlabs', '--pick', 'nova=3']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(procast, 'utf8')).voices.nova.elevenlabs.voiceId, 'el-paco-kept');
    // no key: refused, nothing called
    const before = calls().length;
    r = run(['--engine', 'elevenlabs', '--only', 'nova'], { ELEVENLABS_API_KEY: '' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ELEVENLABS_API_KEY is not set/);
    assert.equal(calls().length, before);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
