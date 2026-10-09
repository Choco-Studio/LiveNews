#!/usr/bin/env node
// Critique renders for the presenters (docs/roadmap/QUALITY_LOOP.md): one contact
// sheet per presenter, every panel a deterministic lab frame upscaled with nearest
// neighbour, so a round can be judged at 1x, zoomed and in motion.
//
//   node tools/critique/render-cast.mjs --out docs/roadmap/critique/renders/r1 [--ids paco,lola] [--port 8080]
//
// Needs the channel server running (it serves /lab/*.html) and Playwright.
// Sheets: <out>/<id>.png  (rows: on set · close-ups and zoom · turnaround · talk · gesture)
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])
);
const port = Number(args.port ?? 8080);
const out = path.resolve(String(args.out ?? 'docs/roadmap/critique/renders/latest'));
const A = ['paco', 'lola', 'sam', 'penny'];
const B = ['max', 'ada', 'nova', 'unit8'];
const ids = args.ids ? String(args.ids).split(',') : [...A, ...B];
const SCALE = Number(args.scale ?? 2);
fs.mkdirSync(out, { recursive: true });

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Panels per lab: [label, settings, times]
function plan(id) {
  if (A.includes(id)) {
    return {
      lab: 'v2-cast-a',
      rows: [
        ['on set', [
          ['stage wide', { mode: 'stage', presenter: id, framing: 'wide' }, [1.2]],
          ['stage mcu', { mode: 'stage', presenter: id, framing: 'mcu' }, [1.2]],
          ['stage close', { mode: 'stage', presenter: id, framing: 'close' }, [1.2]],
          ['studio single', { mode: 'studio', presenter: id, k: 4 }, [1.6]],
        ]],
        ['close-ups', [
          ['closeup', { mode: 'closeup', presenter: id, scale: 3.4, bg: 'set', zoom: 1 }, [0.5]],
          ['zoom x3 neutral', { mode: 'closeup', presenter: id, scale: 3.4, zoom: 3 }, [0.5]],
          ['zoom x3 happy', { mode: 'closeup', presenter: id, scale: 3.4, zoom: 3, emotion: 'happy' }, [1.5]],
          ['zoom x3 serious', { mode: 'closeup', presenter: id, scale: 3.4, zoom: 3, emotion: 'serious' }, [1.5]],
        ]],
        ['turnaround', [['turn', { mode: 'turnaround', presenter: id, scale: 3.4, zoom: 1, emotion: null }, [0, 1, 2, 3, 4, 6]]]],
        ['talk (12 fps)', [['talk', { mode: 'talk', presenter: id, scale: 3.4, zoom: 2 }, [0.4, 0.48, 0.57, 0.65, 0.73, 0.82, 0.9, 0.98]]]],
        ['gesture raise_hand', [['g', { mode: 'gesture', presenter: id, scale: 2.15, gesture: 'raise_hand', zoom: 1 }, [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.2, 2.8]]]],
      ],
    };
  }
  return {
    lab: 'v2-cast-b',
    rows: [
      ['on set', [
        ['single', { mode: 'single', presenter: id, k: 4 }, [1.2]],
        ['two-shot', { mode: 'two', pair: id === 'max' || id === 'ada' ? 'tech' : 'cosmos' }, [1.2, 4.5]],
        ['lineup s1', { mode: 'lineup', ids: ['paco', id] }, [0, 3]],
      ]],
      ['close-ups', [
        ['zoom x3 head', { mode: 'idle', presenter: id, scale: 3.4, zoom: 3, focus: 'head' }, [0.5, 1.7]],
        ['zoom x3 happy', { mode: 'idle', presenter: id, scale: 3.4, zoom: 3, focus: 'head', emotion: 'happy' }, [1.5]],
        ['zoom x3 serious', { mode: 'idle', presenter: id, scale: 3.4, zoom: 3, focus: 'head', emotion: 'serious' }, [1.5]],
      ]],
      ['turnaround', [['turn', { mode: 'turnaround', presenter: id, scale: 3.4, zoom: 1, emotion: null }, [0, 0.67, 1.33, 2, 2.67, 3.33]]]],
      ['talk (12 fps)', [['talk', { mode: 'talk', presenter: id, scale: 3.4, zoom: 2, focus: 'head' }, [0.4, 0.48, 0.57, 0.65, 0.73, 0.82, 0.9, 0.98]]]],
      ['gesture', [['g', { mode: 'gesture', presenter: id, scale: 2.15, zoom: 1 }, [0.3, 0.7, 1.1, 1.5, 1.9, 2.4, 3, 3.6]]]],
    ],
  };
}

// --faces: one grid, a row per presenter: close-up at x3 (neutral, happy, talking), the on-air single at 1x
if (args.faces) {
  const cells = [];
  for (const id of ids) {
    const a = A.includes(id);
    const lab = a ? 'v2-cast-a' : 'v2-cast-b';
    const z = a ? { mode: 'closeup', presenter: id, scale: 3.4, zoom: 3 } : { mode: 'idle', presenter: id, scale: 3.4, zoom: 3, focus: 'head' };
    const talk = a ? { mode: 'talk', presenter: id, scale: 3.4, zoom: 3 } : { mode: 'talk', presenter: id, scale: 3.4, zoom: 3, focus: 'head' };
    const single = a ? { mode: 'studio', presenter: id, k: 4 } : { mode: 'single', presenter: id, k: 4 };
    cells.push({ id, lab, panels: [[z, 0.5], [{ ...z, emotion: 'happy' }, 1.5], [talk, 0.65], [single, 1.6]] });
  }
  const shots = [];
  for (const c of cells) {
    await page.goto(`http://127.0.0.1:${port}/lab/${c.lab}.html?still=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && typeof window.__lab.render === 'function');
    await page.waitForTimeout(600);
    const row = await page.evaluate((panels) => {
      const src = document.getElementById('screen');
      return panels.map(([set, t]) => {
        window.__lab.set({ zoom: 1, emotion: null, ...set });
        window.__lab.render(t);
        return src.toDataURL('image/png');
      });
    }, c.panels);
    shots.push({ id: c.id, row });
  }
  const png = await page.evaluate(async (shots) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const S = 2, W = 384 * S, H = 216 * S, PAD = 4;
    const sheet = document.createElement('canvas');
    sheet.width = 4 * (W + PAD) + PAD;
    sheet.height = shots.length * (H + PAD) + PAD;
    const g = sheet.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0e0e16';
    g.fillRect(0, 0, sheet.width, sheet.height);
    for (let r = 0; r < shots.length; r++) {
      for (let c = 0; c < 4; c++) g.drawImage(await load(shots[r].row[c]), PAD + c * (W + PAD), PAD + r * (H + PAD), W, H);
      g.fillStyle = '#ffffff';
      g.font = 'bold 22px monospace';
      g.fillText(shots[r].id.toUpperCase(), PAD + 8, PAD + r * (H + PAD) + 26);
    }
    return sheet.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(path.join(out, 'faces.png'), Buffer.from(png.split(',')[1], 'base64'));
  console.log(path.join(out, 'faces.png'));
  await browser.close();
  process.exit(errors.length ? 2 : 0);
}

for (const id of ids) {
  const p = plan(id);
  await page.goto(`http://127.0.0.1:${port}/lab/${p.lab}.html?still=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && typeof window.__lab.render === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(800); // lazy modules (studio set)
  const png = await page.evaluate(
    async ({ rows, SCALE, id }) => {
      const src = document.getElementById('screen');
      const W = src.width, H = src.height, PAD = 6, LAB = 14;
      const cols = Math.max(...rows.map(([, panels]) => panels.reduce((n, [, , times]) => n + times.length, 0)));
      const pw = Math.round(W * SCALE * (cols > 4 ? 4 / cols : 1)), ph = Math.round((pw * H) / W);
      const sheet = document.createElement('canvas');
      sheet.width = cols * (pw + PAD) + PAD;
      sheet.height = rows.length * (ph + LAB + PAD) + PAD + 22;
      const g = sheet.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#0e0e16';
      g.fillRect(0, 0, sheet.width, sheet.height);
      g.fillStyle = '#e8e8f0';
      g.font = 'bold 15px monospace';
      g.fillText(`${id.toUpperCase()} · critique sheet`, PAD, 16);
      let y = 22 + PAD;
      for (const [rowLabel, panels] of rows) {
        let x = PAD;
        for (const [label, settings, times] of panels) {
          window.__lab.set({ zoom: 1, emotion: null, ...settings });
          for (const t of times) {
            window.__lab.render(t);
            g.drawImage(src, x, y + LAB, pw, ph);
            g.fillStyle = '#9aa0c8';
            g.font = '11px monospace';
            g.fillText(`${rowLabel} · ${label} · t=${t}`, x, y + 10);
            x += pw + PAD;
          }
        }
        y += ph + LAB + PAD;
      }
      return sheet.toDataURL('image/png');
    },
    { rows: p.rows, SCALE, id }
  );
  fs.writeFileSync(path.join(out, `${id}.png`), Buffer.from(png.split(',')[1], 'base64'));
  console.log(`${id}: ${path.join(out, `${id}.png`)}`);
}
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + [...new Set(errors)].join('\n'));
  process.exitCode = 2;
}
