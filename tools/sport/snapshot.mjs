// FULL TIME's gate (docs/roadmap/critique/full-time-writing.md): the live desk with every feed and article page cached in
// a folder under data/sport-snapshots/ (first run fetches, later runs read the copy; data/ is never committed: the
// outlets' text stays on this machine), and the clock set to the snapshot's moment, so the same stories come up each time.
import fs from 'node:fs';
import crypto from 'node:crypto';

const key = (u) => crypto.createHash('sha1').update(u).digest('hex').slice(0, 14);

/** Freeze the clock at `t0` (ms), running on from there. */
export function freezeClock(t0) {
  const real = Date.now.bind(Date);
  const started = real();
  Date.now = () => t0 + (real() - started);
}

/**
 * The whole process's clock frozen at `t0` (ms) and running on from there: Date.now() and `new Date()` alike (the
 * server stamps episodes and reads the hour both ways). Returns a function that restores the real Date.
 */
export function freezeAllClocks(t0) {
  const Real = Date;
  const started = Real.now();
  const now = () => t0 + (Real.now() - started);
  class FrozenDate extends Real {
    constructor(...a) {
      if (a.length) super(...a);
      else super(now());
    }
    static now() {
      return now();
    }
  }
  globalThis.Date = FrozenDate;
  return () => {
    globalThis.Date = Real;
  };
}

/** A NewsDesk reading the snapshot in `dir` (feeds as dir/<sha>.xml, pages as dir/pages/<sha>.html). */
export async function snapDesk(root, dir) {
  const quiet = { info() {}, warn() {}, error() {}, log() {} };
  const { NewsDesk } = await import(`${root}/server/news.js`);
  const desk = new NewsDesk({ log: quiet });
  fs.mkdirSync(`${dir}/pages`, { recursive: true });
  const read = desk.readFeed.bind(desk);
  desk.readFeed = async (url) => {
    const f = `${dir}/${key(url)}.xml`;
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    const xml = await read(url);
    fs.writeFileSync(f, xml);
    return xml;
  };
  const fetchText = desk.fetchText.bind(desk);
  desk.fetchText = async (url, opts) => {
    const f = `${dir}/pages/${key(url)}.html`;
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    const html = await fetchText(url, opts);
    fs.writeFileSync(f, html);
    return html;
  };
  await desk.refresh();
  // (a feed's undated item keeps when the desk first saw it, server/news.js `firstSeen`: read later, the snapshot's items were
  // first seen at its moment, never at the air time; Sky Sports' and ESPN's items carry no date, and a Sunday-morning edition
  // of the Saturday snapshot once called Saturday's results "Today's results", 17 Oct)
  const t0 = fs.existsSync(`${dir}/T0`) ? Date.parse(fs.readFileSync(`${dir}/T0`, 'utf8').trim()) : NaN;
  const now = Date.now();
  if (Number.isFinite(t0) && now > t0) for (const s of desk.stories?.values?.() || []) if (s.undated && s.firstSeen > t0) s.firstSeen = t0 - (now - s.firstSeen);
  return desk;
}
