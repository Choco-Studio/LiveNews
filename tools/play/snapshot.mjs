// PLAY's niche measurement (docs/programmes/play.md §2-3), step one: one reading of every candidate games outlet and of
// the structured sources, saved raw under data/play-measure/ (gitignored: the outlets' text stays on this machine).
// Run it several times across a session; tools/play/measure.mjs reads every reading and unions the items by link.
//
//   NODE_USE_ENV_PROXY=1 node tools/play/snapshot.mjs [--feeds-only] [--out data/play-measure]
//
// Each reading is a folder data/play-measure/snapshots/<UTC stamp>/ holding <outlet id>.xml and status.json (HTTP code,
// bytes, items, time), and data/play-measure/data/<UTC stamp>/ holding the structured sources' JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UA = 'Mozilla/5.0 (compatible; LiveNewsBot/0.1; +https://github.com/choco-studio/livenews)';
const args = process.argv.slice(2);
const OUT = path.resolve(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'data/play-measure');
const feedsOnly = args.includes('--feeds-only');

/** A reading's folder name: the UTC moment to the minute ("2026-10-16T0912Z"). */
export const stampOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace(':', '') + 'Z';

async function get(url, { timeoutMs = 25000, accept = '*/*' } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    const body = await r.text();
    return { status: r.status, body, ms: Date.now() - t0, finalUrl: r.url, type: r.headers.get('content-type') || '', age: r.headers.get('age'), lastModified: r.headers.get('last-modified') };
  } catch (e) {
    return { status: 0, body: '', ms: Date.now() - t0, error: String(e.cause?.code || e.cause?.message || e.message).slice(0, 200) };
  }
}

// The structured sources the design checks (§3): each fetched without a key. Steam's store endpoints are rate-limited
// (about 200 calls in five minutes), so the details are read for the top of the charts only.
const DATA = [
  ['steam-concurrent', 'https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/'],
  ['steam-most-played', 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/'],
  ['steam-top-releases', 'https://api.steampowered.com/ISteamChartsService/GetTopReleasesPages/v1/'],
  ['steam-featured', 'https://store.steampowered.com/api/featuredcategories?cc=gb&l=english'],
  ['steam-cs2-now', 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=730'],
];
const DETAILS = 25;

async function main() {
  const now = Date.now();
  const stamp = stampOf(now);
  const outlets = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/play/outlets.json'), 'utf8'));
  const dir = path.join(OUT, 'snapshots', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const status = {};
  await Promise.all(outlets.map(async (o) => {
    const r = await get(o.url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' });
    const items = (r.body.match(/<item[\s>]|<entry[\s>]/g) || []).length;
    if (r.status === 200 && items) fs.writeFileSync(path.join(dir, `${o.id}.xml`), r.body);
    status[o.id] = { status: r.status, bytes: r.body.length, items, ms: r.ms, ...(r.error ? { error: r.error } : {}), ...(r.finalUrl && r.finalUrl !== o.url ? { finalUrl: r.finalUrl } : {}) };
  }));
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ at: now, stamp, status }, null, 1));
  const ok = Object.values(status).filter((s) => s.status === 200 && s.items).length;
  console.log(`[play] ${stamp}: ${ok} of ${outlets.length} outlets read into ${path.relative(ROOT, dir)}`);
  for (const [id, s] of Object.entries(status)) if (!(s.status === 200 && s.items)) console.log(`  unreachable or empty: ${id} (${s.status || s.error}, ${s.bytes} bytes)`);
  if (feedsOnly) return;

  const ddir = path.join(OUT, 'data', stamp);
  fs.mkdirSync(ddir, { recursive: true });
  const dstatus = {};
  for (const [id, url] of DATA) {
    const r = await get(url, { accept: 'application/json' });
    dstatus[id] = { status: r.status, bytes: r.body.length, ms: r.ms, age: r.age, lastModified: r.lastModified, ...(r.error ? { error: r.error } : {}) };
    if (r.status === 200) fs.writeFileSync(path.join(ddir, `${id}.json`), r.body);
  }
  // names, release dates, prices and the user-review summary of the top of the live chart
  try {
    const ranks = JSON.parse(fs.readFileSync(path.join(ddir, 'steam-concurrent.json'), 'utf8')).response.ranks.slice(0, DETAILS);
    const details = {};
    for (const { appid } of ranks) {
      const d = await get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=gb&l=english`, { accept: 'application/json' });
      const v = await get(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, { accept: 'application/json' });
      let data = null;
      let reviews = null;
      try {
        data = JSON.parse(d.body)?.[appid]?.data || null;
      } catch {}
      try {
        reviews = JSON.parse(v.body)?.query_summary || null;
      } catch {}
      details[appid] = data ? { name: data.name, type: data.type, required_age: data.required_age, is_free: data.is_free, release_date: data.release_date, price: data.price_overview || null, metacritic: data.metacritic || null, content_descriptors: data.content_descriptors || null, ratings: data.ratings || null, genres: data.genres || null, publishers: data.publishers || null, developers: data.developers || null, reviews } : { status: d.status, reviews };
    }
    fs.writeFileSync(path.join(ddir, 'steam-details.json'), JSON.stringify(details, null, 1));
    dstatus['steam-details'] = { status: 200, apps: Object.keys(details).length };
  } catch (e) {
    dstatus['steam-details'] = { status: 0, error: String(e.message).slice(0, 200) };
  }
  fs.writeFileSync(path.join(ddir, 'status.json'), JSON.stringify({ at: now, stamp, status: dstatus }, null, 1));
  console.log(`[play] structured sources: ${Object.entries(dstatus).map(([k, s]) => `${k} ${s.status}`).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
