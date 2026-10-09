#!/usr/bin/env node
// Browser checks for the showcase page instrumentation (page-init.js), no
// server needed:  node tools/showcase/selftest-page.mjs
// Headless Chromium + Playwright's paused fake clock, like the recorder:
//  - the captured AudioContext follows the fake clock, says 'running';
//  - `param.value = v` applies from NOW (not from t = 0) in the render;
//  - a buffer source fires 'ended' on the fake clock (onended and listeners),
//    at start + length, or at stop() when that comes first; never twice;
//  - decodeAudioData holds the recorder (inflight) and its clip is logged;
//  - the fake speechSynthesis: voices, speak() -> request, deliver() ->
//    start / boundary / end on the fake clock, cancel() -> 'interrupted'.

import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let passed = 0;
try {
  const page = await browser.newPage();
  await page.route('http://showcase.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><canvas id="screen" width="8" height="8"></canvas>' }));
  const cfg = { sampleRate: 48000, maxSeconds: 6, speechLatencyMs: 45 };
  await page.addInitScript({ content: `window.__SC_CFG = ${JSON.stringify(cfg)};\n${fs.readFileSync(path.join(HERE, 'page-init.js'), 'utf8')}` });
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto('http://showcase.test/');
  const test = async (name, fn) => {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  };

  await test('captured AudioContext follows the fake clock', async () => {
    const r = await page.evaluate(() => {
      window.ctx = new AudioContext();
      return { captured: Boolean(window.ctx.__captured), state: window.ctx.state, t: window.ctx.currentTime };
    });
    assert.equal(r.captured, true);
    assert.equal(r.state, 'running');
    assert.equal(r.t, 0);
    await page.clock.runFor(500);
    const t = await page.evaluate(() => window.ctx.currentTime);
    assert.ok(Math.abs(t - 0.5) < 1e-6, `currentTime ${t}`);
  });

  await test('ended fires on the fake clock (onended, listener, stop() first)', async () => {
    await page.evaluate(() => {
      const ctx = window.ctx;
      window.ends = [];
      const buf = ctx.createBuffer(1, 48000, 48000); // 1 s
      const a = ctx.createBufferSource();
      a.buffer = buf;
      a.connect(ctx.destination);
      a.onended = () => window.ends.push(['a', performance.now()]);
      a.start(); // now = 0.5 s -> ends at 1.5 s
      const b = ctx.createBufferSource();
      b.buffer = buf;
      b.playbackRate.value = 2; // 0.5 s long
      b.connect(ctx.destination);
      b.addEventListener('ended', () => window.ends.push(['b', performance.now()]));
      b.start(ctx.currentTime + 0.25); // 0.75 -> 1.25 s
      const o = ctx.createOscillator();
      o.connect(ctx.destination);
      o.onended = () => window.ends.push(['o', performance.now()]);
      o.start();
      o.stop(ctx.currentTime + 0.1); // 0.6 s
      window.srcA = a;
    });
    await page.clock.runFor(1200); // to 1.7 s
    const ends = await page.evaluate(() => window.ends);
    const origin = await page.evaluate(() => window.ctx.__origin);
    const at = Object.fromEntries(ends.map(([k, t]) => [k, t - origin]));
    assert.deepEqual(ends.map((e) => e[0]), ['o', 'b', 'a']);
    assert.ok(Math.abs(at.o - 600) <= 1, `o ${at.o}`);
    assert.ok(Math.abs(at.b - 1250) <= 1, `b ${at.b}`);
    assert.ok(Math.abs(at.a - 1500) <= 1, `a ${at.a}`);
    assert.equal(await page.evaluate(() => typeof window.srcA.onended), 'function', 'the handler reads back');
  });

  await test('param.value applies from now; the render keeps it; no second ended', async () => {
    await page.evaluate(() => {
      const ctx = window.ctx; // now 1.7 s
      const k = ctx.createConstantSource();
      const g = ctx.createGain();
      k.connect(g).connect(ctx.destination);
      k.start(0);
      g.gain.value = 0.25; // from 1.7 s on
      window.gainNow = g.gain.value;
    });
    assert.equal(await page.evaluate(() => window.gainNow), 0.25);
    const r = await page.evaluate(async () => {
      const o = window.ctx.__origin;
      const out = await window.__sc.renderAudio(o + 1500, o + 1900); // 1.5..1.9 s of context time (the set is at 1.7 s)
      const L = window.__sc.audioOut[0];
      return { before: L[Math.round(0.1 * 48000)], after: L[Math.round(0.3 * 48000)], ends: window.ends.length, n: out.n }; // 1.6 s and 1.8 s
    });
    assert.ok(Math.abs(r.before - 1) < 1e-3, `before ${r.before}`);
    assert.ok(Math.abs(r.after - 0.25) < 1e-3, `after ${r.after}`);
    assert.equal(r.ends, 3, 'the offline render does not fire ended again');
  });

  await test('decodeAudioData is tracked and its clip logged', async () => {
    const page2 = await browser.newPage();
    await page2.route('http://showcase.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
    await page2.addInitScript({ content: `window.__SC_CFG = ${JSON.stringify(cfg)};\n${fs.readFileSync(path.join(HERE, 'page-init.js'), 'utf8')}` });
    await page2.clock.install({ time: 0 });
    await page2.clock.pauseAt(1000);
    await page2.goto('http://showcase.test/');
    const r = await page2.evaluate(async () => {
      const ctx = new AudioContext();
      // A 0.5 s silent 16-bit WAV.
      const n = 24000;
      const b = new ArrayBuffer(44 + n * 2);
      const v = new DataView(b);
      const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true);
      v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      const p = ctx.decodeAudioData(b);
      const during = window.__sc.inflight;
      const buf = await p;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      return { during, after: window.__sc.inflight, clip: window.__sc.takeLog().find((e) => e.ev === 'clip') };
    });
    assert.equal(r.during, 1);
    assert.equal(r.after, 0);
    assert.ok(r.clip && Math.abs(r.clip.duration - 0.5) < 1e-6, JSON.stringify(r.clip));
    await page2.close();
  });

  await test('fake speechSynthesis: voices, request, events on the fake clock, cancel', async () => {
    const v = await page.evaluate(() => speechSynthesis.getVoices().map((x) => `${x.lang} ${x.name}`));
    assert.ok(v.some((x) => /en-GB.*\(male\)/.test(x)) && v.some((x) => /en-US.*\(female\)/.test(x)));
    await page.evaluate(() => {
      window.__sc.mode = 'record';
      window.sev = [];
      const u = new SpeechSynthesisUtterance('Good evening, and welcome.');
      for (const k of ['start', 'boundary', 'end', 'error']) u[`on${k}`] = (e) => window.sev.push([k, performance.now(), e.charIndex ?? null, e.error ?? null]);
      speechSynthesis.speak(u);
    });
    const reqs = await page.evaluate(() => window.__sc.takeRequests());
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].text, 'Good evening, and welcome.');
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate((id) => window.__sc.deliver(id, { duration: 1.2, words: [{ t: 0, char: 0, len: 4 }, { t: 0.4, char: 5, len: 8 }, { t: 0.8, char: 18, len: 8 }] }), reqs[0].id);
    await page.clock.runFor(1400);
    const ev = await page.evaluate(() => window.sev);
    assert.deepEqual(ev.map((e) => e[0]), ['start', 'boundary', 'boundary', 'boundary', 'end']);
    assert.ok(Math.abs(ev[0][1] - (t0 + 45)) <= 1, 'start 45 ms after speak()');
    assert.ok(Math.abs(ev[2][1] - (t0 + 45 + 400)) <= 1 && ev[2][2] === 5, 'second word at its time and char');
    assert.ok(Math.abs(ev[4][1] - (t0 + 45 + 1200)) <= 1, 'end after the clip');
    // cancel() mid-utterance: truncates and reports 'interrupted'.
    await page.evaluate(() => {
      window.sev = [];
      const u = new SpeechSynthesisUtterance('A second line.');
      u.onerror = (e) => window.sev.push(['error', e.error]);
      u.onend = () => window.sev.push(['end']);
      speechSynthesis.speak(u);
    });
    const r2 = await page.evaluate(() => window.__sc.takeRequests());
    await page.evaluate((id) => window.__sc.deliver(id, { duration: 2, words: [] }), r2[0].id);
    await page.clock.runFor(300);
    await page.evaluate(() => speechSynthesis.cancel());
    await page.clock.runFor(2500);
    assert.deepEqual(await page.evaluate(() => window.sev), [['error', 'interrupted']]);
    const cut = await page.evaluate(() => window.__sc.takeLog().filter((e) => e.ev === 'speech').pop());
    assert.ok(cut.cut != null && cut.cut < cut.end, 'the timeline marks the cut');
  });

  await test('frame-exact rendering: rAF callbacks run at the frame time, before the grab', async () => {
    const r = await page.evaluate(() => {
      window.__sc.manualRaf();
      window.renders = [];
      // A page-style render loop that draws the state of a timer-driven change.
      window.stateAt = null;
      const c = document.querySelector('#screen').getContext('2d');
      const loop = (ts) => {
        window.renders.push(ts);
        c.fillStyle = window.stateAt != null && performance.now() >= window.stateAt ? '#ff0000' : '#000000';
        c.fillRect(0, 0, 8, 8);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      const id = requestAnimationFrame(() => window.renders.push('cancelled'));
      cancelAnimationFrame(id);
      window.stateAt = performance.now() + 50; // a cut 50 ms from now
      return performance.now();
    });
    // Nothing renders on the fake 16 ms ticks any more: only when the recorder pumps.
    await page.clock.runFor(48);
    assert.equal((await page.evaluate(() => window.renders.length)), 0, 'no render without a pump');
    const f1 = await page.evaluate(() => {
      const s = window.__sc.step();
      return { px: document.querySelector('#screen').getContext('2d').getImageData(0, 0, 1, 1).data[0], png: Boolean(s.png) };
    });
    assert.equal(f1.png, true, 'step() grabs the picture');
    assert.equal(f1.px, 0, 'frame at +48 ms: before the cut');
    await page.clock.runFor(2); // exactly the cut time
    const f2 = await page.evaluate(() => {
      window.__sc.step();
      return { px: document.querySelector('#screen').getContext('2d').getImageData(0, 0, 1, 1).data[0], renders: window.renders.slice() };
    });
    assert.equal(f2.px, 255, 'the frame grabbed at the cut time already shows it');
    assert.deepEqual(f2.renders, [r + 48, r + 50], 'one render per grab, at the grab time; the cancelled callback never ran');
  });
} finally {
  await browser.close();
}
console.log(`${passed} passed`);
