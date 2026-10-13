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
  return desk;
}
