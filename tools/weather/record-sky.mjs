#!/usr/bin/env node
// Records a real forecast's moving sky (server/weathersky.js) for the offline demo: the next 24 hours of cloud, rain,
// wind and pressure from Open-Meteo at every place of config/weather-grid.json, written to
// config/fixtures/weather-sky.json (aired as DEMO DATA, like the rest of the offline report).
//   NODE_USE_ENV_PROXY=1 node tools/weather/record-sky.mjs [--out file]
import fs from 'node:fs';
import { FieldDesk, DEMO_SKY } from '../../server/weatherfield.js';

const i = process.argv.indexOf('--out');
const out = i > 0 ? process.argv[i + 1] : DEMO_SKY;
const desk = new FieldDesk({ source: 'open-meteo', pauseMs: 15_000, retryMs: 65_000 });
const t0 = Date.now();
const alive = setInterval(() => {}, 1000); // the desk's waits never hold the process on their own
const base = await desk.fromNetwork().finally(() => clearInterval(alive));
if (!base.sky) throw new Error('no sky in the answer');
const { demo, ...sky } = base.sky;
fs.writeFileSync(out, JSON.stringify({ _note: `A real Open-Meteo forecast recorded ${new Date(t0).toISOString()} (tools/weather/record-sky.mjs), aired offline as demo data`, recorded: new Date(t0).toISOString(), ...sky }));
console.log(`${sky.places} places, ${sky.hours.length} frames, ${sky.systems.length} highs/lows -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
