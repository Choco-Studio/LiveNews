#!/usr/bin/env node
// The published clips' numbers, read back from each network (docs/publishing/shorts-v2.md B2 and §4): for every clip
// the ledger says went out (data/publish/ledger.jsonl, by API or marked "Ya lo he publicado" by hand), what YouTube,
// Instagram and TikTok say of it, joined to what it was (its programme, its kind, its experiment arm), summed by kind
// and by arm with each experiment's verdict. Read only: it never changes a post.
//
//   node tools/publish/metrics.mjs              read, write data/publish/metrics/latest.json (and a dated copy), and
//                                               print the summary in Spanish for the owner
//   node tools/publish/metrics.mjs --offline    only what the ledger holds (no network): which clips, which ids
//   node tools/publish/metrics.mjs --json       the report as JSON on stdout
//
// What each network needs (the uploads' own credentials, from /etc/globit24.env; nothing new to pay):
//   YouTube    YOUTUBE_CLIENT_ID, _SECRET, _REFRESH_TOKEN. Views, likes and comments come with the uploads' scope; the
//              average viewed, its minutes and the shares need the scope yt-analytics.readonly in the refresh token
//              (the owner grants it once, with a new token). A clip published by hand without its address is found by
//              its title among the channel's uploads. The share that stayed to watch is in YouTube Studio alone.
//   Instagram  INSTAGRAM_ACCESS_TOKEN with instagram_business_manage_insights (INSTAGRAM_GRAPH_VERSION, v23.0).
//   TikTok     TIKTOK_CLIENT_KEY, _SECRET, _REFRESH_TOKEN with the scope video.list, and each post's address (an
//              inbox post's id is not its video's).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../server/publish/metrics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const env = process.env;
// the settings file, for a run by hand (systemd passes it already); what is set already wins
try {
  for (const line of fs.readFileSync(env.GLOBIT_ENV_FILE || '/etc/globit24.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
} catch {
  // no settings file: the environment as it is
}
const dir = path.resolve(opt('data', path.join(root, 'data', 'publish')));

function readLedger() {
  try {
    return fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
function readItems() {
  const items = new Map();
  let names = [];
  try {
    names = fs.readdirSync(path.join(dir, 'queue')).filter((f) => f.endsWith('.json'));
  } catch {
    return items;
  }
  for (const f of names) {
    try {
      const it = JSON.parse(fs.readFileSync(path.join(dir, 'queue', f), 'utf8'));
      if (it?.id) items.set(it.id, it);
    } catch {
      // a broken item is skipped
    }
  }
  return items;
}

const firstLine = (s) => String(s || '').split('\n')[0].replace(/\s+/g, ' ').trim().toLowerCase();
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function main() {
  const items = readItems();
  const rows = M.publishedRows({ ledger: readLedger(), items });
  const notes = [];
  for (const r of rows) {
    if (r.platform === 'youtube') r.videoId = M.youtubeIdOf(r.url) || (/^[A-Za-z0-9_-]{11}$/.test(r.remoteId || '') ? r.remoteId : null);
    if (r.platform === 'tiktok') r.videoId = M.tiktokIdOf(r.url);
    if (r.platform === 'instagram') r.code = M.instagramCodeOf(r.url);
  }
  if (!flag('offline')) {
    // YouTube
    const yt = rows.filter((r) => r.platform === 'youtube');
    if (yt.length) {
      const tok = await M.googleToken(env);
      if (!tok.ok) notes.push({ network: 'youtube', need: tok.need, error: tok.error });
      else {
        if (yt.some((r) => !r.videoId)) {
          const up = await M.youtubeUploads({ token: tok.token });
          if (up.ok) M.matchByTitle(yt, up.data);
          else notes.push({ network: 'youtube', need: up.need, error: up.error });
        }
        const ids = yt.map((r) => r.videoId).filter(Boolean);
        const v = await M.youtubeVideos(ids, { token: tok.token });
        if (v.ok) {
          for (const r of yt) if (v.data[r.videoId]) r.numbers = { ...v.data[r.videoId] };
        } else notes.push({ network: 'youtube', need: v.need, error: v.error });
        const first = Math.min(...yt.map((r) => r.at || Date.now()));
        const a = ids.length ? await M.youtubeAnalytics(ids, { token: tok.token, start: day(first), end: day(Date.now()) }) : { ok: true, data: {} };
        if (a.ok) {
          for (const r of yt) if (a.data[r.videoId]) r.numbers = { ...(r.numbers || {}), ...a.data[r.videoId] };
        } else notes.push({ network: 'youtube', need: a.need, error: a.error, what: 'average viewed, watch time, shares' });
      }
    }
    // Instagram
    const ig = rows.filter((r) => r.platform === 'instagram');
    if (ig.length) {
      const token = env.INSTAGRAM_ACCESS_TOKEN;
      const base = `https://graph.instagram.com/${env.INSTAGRAM_GRAPH_VERSION || 'v23.0'}`;
      if (!token) notes.push({ network: 'instagram', need: 'credentials: INSTAGRAM_ACCESS_TOKEN' });
      else {
        if (ig.some((r) => !/^\d+$/.test(r.remoteId || ''))) {
          const media = await M.instagramMedia({ token, base });
          if (media.ok) {
            for (const r of ig) {
              if (/^\d+$/.test(r.remoteId || '')) continue;
              const item = items.get(r.itemId) || {};
              const hit = media.data.find((m) => (r.code && m.code === r.code) || (firstLine(item.text) && firstLine(m.caption) === firstLine(item.text)));
              if (hit) r.remoteId = hit.id;
            }
          } else notes.push({ network: 'instagram', need: media.need, error: media.error });
        }
        for (const r of ig.filter((x) => /^\d+$/.test(x.remoteId || ''))) {
          const ins = await M.instagramInsights(r.remoteId, { token, base });
          if (ins.ok) r.numbers = ins.data;
          else {
            notes.push({ network: 'instagram', need: ins.need, error: ins.error });
            break;
          }
        }
      }
    }
    // TikTok
    const tt = rows.filter((r) => r.platform === 'tiktok');
    if (tt.length) {
      const ids = tt.map((r) => r.videoId).filter(Boolean);
      if (!ids.length) notes.push({ network: 'tiktok', need: 'each post\'s address ("Ya lo he publicado" with its link): an inbox post\'s id is not its video\'s' });
      else {
        const tok = await M.tiktokToken(env);
        if (!tok.ok) notes.push({ network: 'tiktok', need: tok.need, error: tok.error });
        else {
          const v = await M.tiktokVideos(ids, { token: tok.token });
          if (v.ok) {
            for (const r of tt) if (v.data[r.videoId]) r.numbers = v.data[r.videoId];
          } else notes.push({ network: 'tiktok', need: v.need, error: v.error });
        }
      }
    }
  }
  const summary = M.summarize(rows);
  const report = { at: new Date().toISOString(), offline: flag('offline'), notes, summary, rows };
  if (!flag('offline')) {
    const out = path.join(dir, 'metrics');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(report, null, 1));
    fs.writeFileSync(path.join(out, `metrics-${day(Date.now())}.json`), JSON.stringify(report, null, 1));
  }
  if (flag('json')) {
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    return;
  }
  console.log(spanish(report));
}

// what a network needs, in the owner's words
const NEEDS = [
  [/yt-analytics/, 'dar permiso para leer las estadísticas de YouTube: un YOUTUBE_REFRESH_TOKEN nuevo que incluya yt-analytics.readonly'],
  [/instagram_business_manage_insights/, 'el permiso de estadísticas de Instagram (instagram_business_manage_insights) en INSTAGRAM_ACCESS_TOKEN'],
  [/instagram_business_basic/, 'el permiso básico de Instagram (instagram_business_basic) en INSTAGRAM_ACCESS_TOKEN'],
  [/video\.list/, 'el permiso de TikTok para leer los vídeos (video.list) en TIKTOK_REFRESH_TOKEN'],
  [/address/, 'el enlace de cada publicación al pulsar «Ya lo he publicado»'],
  [/^credentials: (.*)$/, (m) => `las claves ${m[1]} en /etc/globit24.env`],
  [/YOUTUBE_REFRESH_TOKEN|TIKTOK_REFRESH_TOKEN/, (m) => `renovar ${m[0]}`],
  [/youtube\.readonly|scope youtube/, 'el permiso de YouTube del canal (youtube) en YOUTUBE_REFRESH_TOKEN'],
];
const inSpanish = (need) => {
  for (const [re, say] of NEEDS) {
    const m = re.exec(String(need || ''));
    if (m) return typeof say === 'function' ? say(m) : say;
  }
  return need;
};

/** The summary in the owner's words. */
export function spanish(report) {
  const s = report.summary;
  const net = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
  const L = [`Clips publicados en el registro: ${s.clips} (con cifras: ${s.read}, sin cifras todavía: ${s.unread}).`];
  const line = (k, v) => `  ${k}: ${v.n} clips · vistas (mediana) ${v.views ?? '—'} · visto de media ${v.viewedPct ?? '—'} % · ${v.likesPer1k ?? '—'} «me gusta» y ${v.sharesPer1k ?? '—'} envíos por cada 1.000 vistas`;
  if (Object.keys(s.byKind).length) {
    L.push('', 'Por tipo de clip:');
    for (const [k, v] of Object.entries(s.byKind)) L.push(line(k, v));
  }
  for (const [k, v] of Object.entries(s.verdicts)) {
    L.push('', `Prueba ${k}:`);
    for (const [arm, st] of Object.entries(v.arms)) L.push(line(arm, st));
    if (v.state === 'collecting') L.push(`  Faltan clips: ${Object.entries(v.need).map(([a, n]) => `${n} de «${a}»`).join(' y ')} (hacen falta ${M.MIN_PER_ARM} de cada una).`);
    else if (v.state === 'drop') L.push(`  Resultado: la versión nueva lo hace peor en ${v.worse.join(' y ')}: se quita.`);
    else L.push('  Resultado: nada empeora. Falta mirar en YouTube Studio el porcentaje que se quedó a verlo (debe mejorar 5 puntos).');
  }
  if (report.notes.length) {
    L.push('', 'Lo que falta para leer más:');
    const WHAT = { 'average viewed, watch time, shares': 'el % visto, el tiempo visto y los envíos' };
    for (const n of report.notes) L.push(`  ${net[n.network] || n.network}: ${n.need ? `hace falta ${inSpanish(n.need)}` : `error: ${n.error}`}${n.what ? ` (para ${WHAT[n.what] || n.what})` : ''}.`);
  }
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`metrics: ${err?.message || err}`);
    process.exit(1);
  });
}
