// PRESS START's niche measurement (docs/programmes/press-start.md §2-§4), step two: every reading tools/play/snapshot.mjs
// saved, unioned by link, measured.
//
//   node tools/play/measure.mjs [--dir data/play-measure] [--archive <the station's data/archive>] [--json out.json] [--events v5|v4]
//
// What it reports, per outlet and for the desk:
//   - the time each outlet's readings cover without a gap, and the complete London days inside it;
//   - items a day on the complete days, and the hours the items are filed;
//   - what each standard removes (tools/play/standards.mjs): every rule's matches and the first rule that keeps an item off;
//   - events (the channel's own same-story test, server/news.js NewsDesk.sameStory) and the overlap between outlets;
//   - reviews, release dates, pictures and credits; the channel's grave test on games items;
//   - the structured sources' readings (Steam) and how stale they were;
//   - TECH BYTES's games items: in its own feeds now, and in the station's archive when --archive is given.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, keywords, NewsDesk } from '../../server/news.js';
import { classify, channelGrave, gamesTopic, hasNewsVerb, reviewVerdict, KEEPS_OFF, RULES } from './standards.mjs';
import { releaseDate } from './dates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const TZ = 'Europe/London';

/** A moment's London calendar day ("2026-10-16") and hour. */
export function londonDay(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
/** The UTC moments a London day starts and ends. */
export function londonDayBounds(day) {
  const [y, m, d] = day.split('-').map(Number);
  // London is UTC (GMT) or UTC+1 (BST): midnight there is 23:00 UTC the day before in summer, 00:00 UTC in winter
  const midnight = (utc) => {
    const bst = utc - HOUR;
    const l = londonDay(bst);
    return l.hour === 0 && l.day === londonDay(utc).day ? bst : utc;
  };
  const start = midnight(Date.UTC(y, m - 1, d));
  return { start, end: midnight(Date.UTC(y, m - 1, d) + DAY) };
}

/** A link without its query and fragment: one item, whichever reading saw it. */
export const linkKey = (link) => String(link || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

/**
 * The time a reading covers without a gap: from its oldest item to the moment it was read. An item filed long before the
 * rest (an evergreen page pinned at the bottom: GameSpot's feed lists one from 120 days before its other 29) is not the
 * start; the start is the oldest item of the newest run with no gap over four days (a trade desk that rests from
 * Friday evening to Monday morning leaves a gap of about 64 hours, and its weekend is still read whole).
 */
export function readingCovers(published, at) {
  const ts = [...published].filter(Number.isFinite).sort((a, b) => b - a);
  if (!ts.length) return null;
  let start = ts[0];
  for (let i = 1; i < ts.length; i++) {
    if (ts[i - 1] - ts[i] > 4 * DAY) break;
    start = ts[i];
  }
  return [start, at];
}

/** Intervals merged where they touch or overlap. */
export function mergeIntervals(list) {
  const out = [];
  for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) {
    if (out.length && a <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], b);
    else out.push([a, b]);
  }
  return out;
}
const inside = (intervals, a, b) => intervals.some(([x, y]) => x <= a && b <= y);

function readSnapshots(dir) {
  const root = path.join(dir, 'snapshots');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'status.json'))).sort().map((d) => {
    const st = JSON.parse(fs.readFileSync(path.join(root, d, 'status.json'), 'utf8'));
    return { stamp: d, at: st.at, status: st.status, dir: path.join(root, d) };
  });
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/**
 * Events: each report joins the first event whose first report it is the same story as (the desk's sameStory, within
 * three days), as the channel's own picking does ("mates" of a picked story); else it starts one. Never by chains:
 * "Epic's launcher is faster than Steam" and "Epic delays its Disney game" share Epic and a word each with a third
 * report, and are two events (16 Oct: chaining made one event of 22 reports).
 */
// a word's stem for "what happened" ("closing" and "close" are one): its first four letters
const stem = (w) => w.slice(0, 4);
/**
 * Games headlines are full of names (a franchise title is four or five capitalised words: "Assassin's Creed Black Flag
 * Resynced"), and the desk's sameStory takes two shared names for one story; so two reports are one event only when they
 * also share a word of what happened, beyond the names ("Ubisoft closing Trials developer RedLynx" / "Ubisoft to close
 * Trials studio RedLynx": "clos"). "Cut Assassin's Creed Black Flag Resynced epilogue … datamine" and "Ubisoft are making
 * layoffs at Assassin's Creed Black Flag Resynced studio" share only names: two events (16 Oct).
 */
export function sameGamesEvent(desk, a, b) {
  if (!desk.sameStory(a, b)) return false;
  const ea = desk.eventFacts(a);
  const eb = desk.eventFacts(b);
  const what = (e) => new Set([...e.topic].filter((w) => !e.names.has(w) && !/^\d/.test(w) && w.length >= 4).map(stem));
  const wb = what(eb);
  const shared = [...what(ea)].filter((w) => wb.has(w));
  // a word every games story uses ("release", "trailer", "update") ties two reports only with another
  return shared.filter((w) => !GENERIC_GAMES.has(w)).length >= 1 || shared.length >= 2;
}
const GENERIC_GAMES = new Set(['rele', 'laun', 'trai', 'upda', 'game', 'play', 'anno', 'reve', 'deta', 'stud', 'deve', 'vers', 'edit', 'seri', 'comi', 'firs', 'show', 'look', 'mode', 'date', 'year', 'take', 'make', 'gets', 'adds', 'more', 'next', 'last', 'says', 'will', 'boss', 'team', 'than', 'with', 'from', 'that', 'this', 'into', 'after', 'over']);

// The games event test of the bible (press-start.md §4.12, events v7), which does not lean on the desk's sameStory alone:
// that test reads names from sentence case, and games headlines are often in title case ("Fire Emblem: Fortune's Weave
// Expansion Pass Announced, Wave 1 Launches Today" has no names for it, and "Fire Emblem" is a fire to it), so v4 missed
// ten pairs of one event in 98 would-air reports of 14-16 Oct. Two reports are one event when their headlines share a
// run of two or more words that names something (a word that is not filler, a platform, a month, a bare word like
// "trailer" or a word of what happened, and capitalised where the headline is in sentence case) and either that run
// says what happened ("GTA 6 launch trailer") or the rest of the headlines share a word of what happened, never a
// platform or a maker ("Control Resonant" … "million"). A franchise's name alone never joins two events ("Star Wars
// Galactic Racer launches on Amazon Luna" / "Star Wars Galactic Racer will soon welcome larger podracing parties").
// Measured with the clustering below on 14-16 Oct (events v5, frozen 17:51 UTC on 16 Oct): of 98 would-air reports, five
// pairs were still one event, and two stories were lost to a wrong join. Events v6 ("getting" names nothing) and v7 (a
// franchise's full name and its short one are one name) followed, with the repeat check (`repeats`, below) for the pairs
// the event test still splits (bible §4.12).
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const FILLER = new Set('the a an of to in on for and or with its it is are has have had will would new now today says said say game games more first after over before by as at from that this be been was were can could up out all just not no into than then there their his her they you your our we i my who what when how why which also while still very only so if but about'.split(' '));
const PLATFORMS = new Set('ps5 ps4 ps3 ps2 ps1 xbox series one switch nintendo playstation steam pc deck mobile ios android console consoles pro x s 2'.split(' '));
const ACTION = /^(?:launch\w*|trailers?|releas\w*|delay\w*|updat\w*|patch\w*|demos?|sales|sold|million|record\w*|layoffs?|clos\w*|cancel\w*|acquir\w*|announc\w*|reveal\w*|ports?|coming|remov\w*|pulls?|pulled|prices?|beta|dlc|expansion|seasons?|achievements?|ditch\w*|split\w*|shut\w*|sunset\w*)$/;
// words that name nothing on their own ("first look at", "new trailer", "real life")
const BARE = new Set(('look looks first last next big best real life official officially finally gameplay video videos trailer story mode version edition free week weekend day year month time times date dates window available playable live add adds get gets getting got '
  + 'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday '
  + 'players player fans fan studio developer developers dev devs publisher company boss ceo director team people world').split(' '));
// the makers whose name heads half their stories: a shared maker says nothing of what happened ("Activision Confirms Call
// of Duty Will Get a 'New Sub-Franchise'" is not "The 'Call of Duty tax' … Activision says")
const MAKERS = new Set('rockstar sony microsoft ubisoft activision blizzard sega capcom epic valve ea bandai namco square enix konami bethesda take two warner bros riot bungie remedy atlus cd projekt red nintendo xbox playstation steam'.split(' '));
// a franchise's full name and its short one are one name (events v7: "Grand Theft Auto 6 launch trailer suddenly
// drops…" and "GTA 6 Launch Trailer Available to Watch Right Now" made two events of one trailer on 15 Oct)
const ALIASES = [[/\bgrand theft auto\b/gi, 'GTA'], [/\bcall of duty\b/gi, 'COD']];
function headlineTokens(title) {
  const t0 = ALIASES.reduce((t, [re, short]) => t.replace(re, short), String(title || ''));
  return t0.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]s\b/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    .map((t) => ({ w: ROMAN[t.toLowerCase()] || t.toLowerCase(), cap: /^[A-Z0-9]/.test(t) }));
}
export function headlineWords(title) {
  return headlineTokens(title).map((t) => t.w);
}
// a headline in title case capitalises most of its longer words; in sentence case only names are capitalised
const titleCase = (T) => {
  const long = T.filter((t) => t.w.length >= 4 && !/^\d/.test(t.w));
  return long.length > 0 && long.filter((t) => t.cap).length * 10 >= long.length * 6;
};
// a word's root for "what happened": its common endings off ("closing", "closes", "close" are one; "stores" and "story"
// are not, as four-letter stems made them: "Toy Story" joined "Shogun 2 … from stores")
export const root = (w) => w.replace(/(?:ing|ed|es|s|e)$/, '');
/** The longest run of words two headlines share that names something, with both headlines' words; null when none. */
export function namingRun(a, b) {
  const TA = headlineTokens(a.title);
  const TB = headlineTokens(b.title);
  const A = TA.map((t) => t.w);
  const B = TB.map((t) => t.w);
  const [ta, tb] = [titleCase(TA), titleCase(TB)];
  let best = null;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      let k = 0;
      while (i + k < A.length && j + k < B.length && A[i + k] === B[j + k]) k++;
      if (k < 2) continue;
      const run = A.slice(i, i + k);
      // (a run names something only with a word that is neither filler, a platform, a word of what happened nor a bare
      // word: "launches today" joined "Fire Emblem … Wave 1 Launches Today" to "Gran Turismo 7's Spec IV launches
      // today"; and capitalised in a headline in sentence case: "breaks new ground" joined Caves of Qud's first early
      // access expansion to "Former Disco Elysium devs break new ground")
      const names = (x) => !FILLER.has(A[i + x]) && !PLATFORMS.has(A[i + x]) && !ACTION.test(A[i + x]) && !BARE.has(A[i + x]) && !/^\d+$/.test(A[i + x])
        && (ta || TA[i + x].cap) && (tb || TB[j + x].cap);
      if (!run.some((w, x) => names(x))) continue;
      if (!best || k > best.run.length) best = { run, i, j };
    }
  }
  return best && { ...best, A, B };
}
/** How strongly two headlines are one games event: the length of the run of words that ties them, or 0 when none does. */
export function gamesEventMatch(a, b) {
  const best = namingRun(a, b);
  if (!best) return 0;
  if (best.run.some((w) => ACTION.test(w))) return best.run.length;
  const rest = (W, at) => new Set(W.filter((w, x) => (x < at || x >= at + best.run.length) && !FILLER.has(w) && !PLATFORMS.has(w) && !BARE.has(w) && !MAKERS.has(w) && !/^\d+$/.test(w)).map(root));
  const ra = rest(best.A, best.i);
  const rb = rest(best.B, best.j);
  return [...ra].some((w) => rb.has(w)) ? best.run.length : 0;
}
// The repeat check (bible §4.12): the event test misses some pairs of one event ("Zero Parades, The Successor To Disco
// Elysium, Has Been Confirmed For Switch 2" / "ZERO PARADES: Director's Cut coming to Switch 2 on November 3"), so a
// story is not told when PRESS START told one in the last 24 hours whose headline shares a naming run with it **and**
// a kind of act (two releases, two updates, two sets of sales) or a platform. Another story of the same game, of
// another kind, is news ("GTA 6 Launch Trailer…" and "GTA 6 Barely Makes the Cut for The Game Awards").
export const sameGame = (a, b) => namingRun(a, b) !== null;
const ACT_KINDS = [
  ['release', /^(?:launch\w*|releas\w*|available|coming|arriv\w*|ports?|ported|out)$/],
  ['update', /^(?:updat\w*|patch\w*|fix\w*|hotfix\w*)$/],
  ['delay', /^(?:delay\w*|postpon\w*)$/],
  ['announce', /^(?:announc\w*|reveal\w*|confirm\w*|unveil\w*|introduc\w*)$/],
  ['end', /^(?:clos\w*|shut\w*|cancel\w*|ends?|ending|ended|sunset\w*|ditch\w*|remov\w*|pulls?|pulled|delist\w*|finish\w*)$/],
  ['sales', /^(?:sales|sold|sell\w*|million|copies|record\w*)$/],
  ['trailer', /^trailers?$/],
  ['demo', /^demos?$/],
  ['price', /^(?:prices?|pricing)$/],
  ['jobs', /^(?:layoffs?|jobs?|redundanc\w*)$/],
  ['dlc', /^(?:dlc|expansions?|seasons?)$/],
];
const PLATFORM_NAMES = new Set('ps5 ps4 switch xbox steam pc ios android iphone ipad playstation'.split(' '));
const actKinds = (W) => new Set(W.flatMap((w) => ACT_KINDS.filter(([, re]) => re.test(w)).map(([k]) => k)));
export function repeats(a, b) {
  const run = namingRun(a, b);
  if (!run) return false;
  const ka = actKinds(run.A);
  if ([...actKinds(run.B)].some((k) => ka.has(k))) return true;
  const pa = new Set(run.A.filter((w) => PLATFORM_NAMES.has(w)));
  return run.B.some((w) => pa.has(w));
}
export const sameGamesEventV5 = (a, b) => gamesEventMatch(a, b) > 0;
/** Whether two headlines share a word that names something particular (not a platform, a maker or a bare word), as the
 * desk's names test must too: "Heavy Metal Death Can now available for PS5, Xbox Series" and "Ancestors: The Humankind
 * Odyssey coming to PS5, Xbox Series" share only platforms. */
export function shareAName(a, b) {
  const TA = headlineTokens(a.title);
  const TB = headlineTokens(b.title);
  const [ta, tb] = [titleCase(TA), titleCase(TB)];
  const named = (T, tc) => new Set(T.filter((t) => (tc || t.cap) && !FILLER.has(t.w) && !PLATFORMS.has(t.w) && !BARE.has(t.w) && !MAKERS.has(t.w) && !ACTION.test(t.w) && !/^\d+$/.test(t.w)).map((t) => t.w));
  const nb = named(TB, tb);
  return [...named(TA, ta)].some((w) => nb.has(w));
}

export function clusterEvents(stories, desk, window = 3 * DAY, test = 'v5') {
  const seeds = [];
  const events = new Map();
  for (const s of [...stories].sort((a, b) => a.published - b.published)) {
    const near = seeds.filter((e) => Math.abs(s.published - e.published) < window);
    let seed = null;
    if (test === 'v5') {
      // the event it matches best by its reports within the window, by the run test or by the desk's names test for
      // sentence-case headlines that share no run ("Ubisoft closing Trials developer RedLynx" / "Ubisoft to close Trials
      // studio RedLynx"); it joins only when it matches at least a third of them. Matching the first report alone split
      // events whose first report was told differently; matching any one report chained ("Fortnite is coming to Linux"
      // joined "Big Walk not coming to Xbox", and the boycott took Fortnite off), and so did joining two events a report
      // matches (every Grand Theft Auto story of a week became one).
      const related = desk.related(s);
      const fits = [];
      for (const e of near) {
        const within = events.get(e).filter((r) => Math.abs(s.published - r.published) < window);
        let hits = 0;
        let sum = 0;
        for (const r of within) {
          const m = Math.max(gamesEventMatch(r, s), related.has(r) && shareAName(r, s) && sameGamesEvent(desk, r, s) ? 1.5 : 0);
          if (m > 0) [hits, sum] = [hits + 1, sum + m];
        }
        if (hits && hits * 3 >= within.length) fits.push({ e, score: hits / within.length + sum / 100 });
      }
      fits.sort((x, y) => y.score - x.score);
      if (fits.length) seed = fits[0].e;
    } else {
      const related = desk.related(s);
      seed = near.find((e) => related.has(e) && sameGamesEvent(desk, e, s)) || null;
    }
    if (seed) events.get(seed).push(s);
    else {
      seeds.push(s);
      events.set(s, [s]);
    }
  }
  return events;
}

export async function measure({ dir = path.join(ROOT, 'data/play-measure'), archive = null, eventTest = 'v5' } = {}) {
  const outlets = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/play/outlets.json'), 'utf8'));
  const byId = Object.fromEntries(outlets.map((o) => [o.id, o]));
  const snaps = readSnapshots(dir);
  if (!snaps.length) throw new Error(`no readings under ${dir}/snapshots (run tools/play/snapshot.mjs first)`);
  const items = new Map(); // outlet:linkKey -> item
  const covers = {}; // outlet -> intervals
  const reach = {}; // outlet -> { read, of, failures }
  for (const snap of snaps) {
    for (const o of outlets) {
      const st = snap.status[o.id];
      const r = (reach[o.id] ??= { read: 0, of: 0, failures: [] });
      r.of++;
      const file = path.join(snap.dir, `${o.id}.xml`);
      if (!st || st.status !== 200 || !st.items || !fs.existsSync(file)) {
        r.failures.push(`${snap.stamp}: ${st ? st.status || st.error : 'not read'}`);
        continue;
      }
      r.read++;
      // the feed and the older pages a deep reading saved (snapshot.mjs --deep): one reading, back to the oldest page
      const pageFiles = fs.readdirSync(snap.dir).filter((f) => new RegExp(`^${o.id}-p\\d+\\.xml$`).test(f));
      const parsed = [file, ...pageFiles.map((f) => path.join(snap.dir, f))].flatMap((f) => parseFeed(fs.readFileSync(f, 'utf8'), { name: o.name, category: 'games' }, { now: snap.at }));
      const cov = readingCovers(parsed.map((s) => s.published), snap.at);
      if (cov) (covers[o.id] ??= []).push(cov);
      for (const s of parsed) {
        const key = `${o.id}:${linkKey(s.link)}`;
        if (!items.has(key)) items.set(key, { ...s, outlet: o.id, kind: o.kind, firstSeen: snap.at });
      }
    }
  }
  for (const id of Object.keys(covers)) covers[id] = mergeIntervals(covers[id]);
  const first = snaps[0].at;
  const last = snaps.at(-1).at;

  // the complete London days of each outlet
  const allDays = new Set();
  for (const s of items.values()) allDays.add(londonDay(s.published).day);
  const days = [...allDays].sort();
  const complete = {};
  for (const o of outlets) {
    complete[o.id] = days.filter((d) => {
      const { start, end } = londonDayBounds(d);
      return end <= last && inside(covers[o.id] || [], start, end);
    });
  }

  // classify every item
  const list = [...items.values()];
  for (const s of list) {
    s.kw = keywords(s.title);
    s.cls = classify(s);
    s.day = londonDay(s.published).day;
    s.hour = londonDay(s.published).hour;
    s.date = releaseDate(s);
    s.grave = channelGrave(s);
  }
  const games = list.filter((s) => s.kind !== 'channel-tech');
  const tech = list.filter((s) => s.kind === 'channel-tech');

  // events: the channel's own same-story test over every games item (sources are outlets, so two outlets' reports of
  // one event join)
  const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
  for (const s of games) desk.stories.set(`${s.outlet}:${s.id}`, Object.assign(s, { source: s.outlet, deskId: `${s.outlet}:${s.id}` }));
  for (const s of games) desk.eventFacts(s);
  const events = clusterEvents(games, desk, 3 * DAY, eventTest);
  // an event is off whole when any report of it is a leak, harm to people, a conflict or gambling (EVENT_RULES); otherwise
  // it airs from any report that passes every rule
  // (carried by at least half of its reports: one report wrongly joined to an event never takes it off)
  for (const members of events.values()) {
    const counts = {};
    for (const m of members) for (const k of m.cls.event) counts[k] = (counts[k] || 0) + 1;
    // (a rumour needs more than half: one report and one announcement of the same thing is an announcement)
    const eventOut = Object.keys(counts).filter((k) => (k === 'rumour' ? counts[k] * 2 > members.length : counts[k] * 2 >= members.length));
    const ev = { members, outlets: new Set(members.map((m) => m.outlet)), eventOut, usable: !eventOut.length && members.some((m) => !m.cls.out), first: Math.min(...members.map((m) => m.published)) };
    for (const m of members) {
      m.event = ev;
      // a report that passes every rule but tells an event that is off whole is off too, by the event's rule
      m.usable = !m.cls.out && !eventOut.length;
      if (!m.cls.out && eventOut.length) m.cls = { ...m.cls, out: `event: ${eventOut[0]}` };
    }
  }

  // what would air: each usable event told from one report, the outlet's tier first (tools/play/outlets.json: 1 the
  // trade and platform news desks, 2 the general games and mainstream desks), then the report with no evaluative word,
  // then the first filed. Tier 3 (the desks that write in their own voice, or mostly guides) and tier 4 (the platforms'
  // blogs) are never told from (rules v4): they only confirm, counting as a second outlet for an event a tier 1 or 2 report
  // tells. An event one outlet carries airs only from a report whose headline states an act (a feature, a profile, an
  // interview or a preview is one outlet's, and states none). Outlets count only for reports that pass every rule.
  const tierOf = (s) => byId[s.outlet]?.tier ?? 3;
  for (const members of events.values()) {
    const ev = members[0].event;
    const cands = members.filter((m) => m.usable && tierOf(m) <= 2).sort((a, b) => tierOf(a) - tierOf(b) || Number(a.cls.kinds.includes('evaluative words')) - Number(b.cls.kinds.includes('evaluative words')) || a.published - b.published);
    if (!cands.length) continue;
    const carried = new Set(members.filter((m) => m.usable).map((m) => m.outlet)).size;
    // (an outlet marked "alone": false never tells an event it carries alone: Siliconera's single-outlet reports were
    // Japanese merchandise, cafés and collaborations as often as games news, in every archive page read: held-out sets
    // E, F and G, bible §3.1)
    if (carried >= 2 || (hasNewsVerb(cands[0].title) && byId[cands[0].outlet]?.alone !== false)) {
      cands[0].chosen = true;
      ev.chosen = cands[0];
    }
  }
  // the repeat check: a would-air report that repeats one told in the 24 hours before it is not told
  const told = [];
  for (const s of list.filter((x) => x.chosen).sort((a, b) => a.published - b.published)) {
    const earlier = told.find((t) => s.published - t.published < DAY && repeats(t, s));
    if (earlier) {
      s.chosen = false;
      s.repeatOf = earlier;
      s.event.chosen = null;
    } else told.push(s);
  }

  // per outlet
  const perOutlet = [];
  for (const o of outlets) {
    const mine = list.filter((s) => s.outlet === o.id);
    const cd = complete[o.id];
    const onDays = mine.filter((s) => cd.includes(s.day));
    const usable = onDays.filter((s) => !s.cls.out);
    const covered = (covers[o.id] || []).reduce((n, [a, b]) => n + (b - a), 0) / HOUR;
    const usableEvents = new Set(usable.map((s) => s.event)).size;
    const shared = new Set(usable.filter((s) => s.event && s.event.outlets.size > 1).map((s) => s.event)).size;
    perOutlet.push({
      id: o.id, name: o.name, kind: o.kind, reach: reach[o.id], coveredHours: Math.round(covered), completeDays: cd.length,
      itemsPerDay: cd.length ? Math.round((10 * onDays.length) / cd.length) / 10 : null,
      usablePerDay: cd.length ? Math.round((10 * usable.length) / cd.length) / 10 : null,
      usableShare: pct(usable.length, onDays.length),
      // a rate over the hours read, for an outlet with no complete day (a short feed read too seldom)
      ratePerDay: covered ? Math.round((10 * mine.filter((s) => (covers[o.id] || []).some(([a, b]) => s.published >= a && s.published <= b)).length * 24) / covered) / 10 : null,
      usableEvents, sharedEvents: shared, uniqueEvents: usableEvents - shared,
      pictures: pct(mine.filter((s) => s.image).length, mine.length),
      credited: pct(mine.filter((s) => s.imageCredits).length, mine.length),
    });
  }

  // each outlet's items on its complete days by the first rule that keeps them off (or how they are told), and the
  // outlets it shares events with
  const OUT_COLS = ['off-topic', 'guide', 'commerce', 'review', 'outlet voice', 'leak', 'rumour', 'explicit', 'harm to people', 'conflict or politics', 'gambling', 'feud or gossip', 'event'];
  const exclusions = outlets.filter((o) => complete[o.id].length).map((o) => {
    const its = list.filter((s) => s.outlet === o.id && complete[o.id].includes(s.day));
    const share = (f) => pct(its.filter(f).length, its.length);
    const row = { id: o.id, n: its.length };
    for (const c of OUT_COLS) row[c] = c === 'event' ? share((s) => String(s.cls.out || '').startsWith('event:')) : share((s) => s.cls.out === c);
    row.kept = share((s) => !s.cls.out);
    return row;
  });
  const overlap = {};
  for (const o of outlets) {
    const mine = new Set(games.filter((s) => s.outlet === o.id && s.usable).map((s) => s.event));
    const withOthers = {};
    for (const ev of mine) for (const other of ev.outlets) if (other !== o.id) withOthers[other] = (withOthers[other] || 0) + 1;
    overlap[o.id] = { events: mine.size, shared: [...mine].filter((ev) => ev.outlets.size > 1).length, top: Object.entries(withOthers).sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }

  // the desk: every games outlet on each day it is complete for every chosen outlet
  const rules = {};
  const firsts = {};
  const scope = games.filter((s) => complete[s.outlet].includes(s.day));
  for (const s of scope) {
    for (const k of s.cls.kinds) rules[k] = (rules[k] || 0) + 1;
    const f = s.cls.out || `kept: ${s.cls.treatment}`;
    firsts[f] = (firsts[f] || 0) + 1;
  }
  const perDay = days.map((d) => {
    const outs = outlets.filter((o) => o.kind !== 'channel-tech' && complete[o.id].includes(d)).map((o) => o.id);
    const its = games.filter((s) => s.day === d && outs.includes(s.outlet));
    const usable = its.filter((s) => !s.cls.out);
    return { day: d, outlets: outs.length, items: its.length, usable: usable.length, events: new Set(its.map((s) => s.event)).size, usableEvents: new Set(usable.map((s) => s.event)).size, aired: its.filter((s) => s.chosen).length };
  }).filter((x) => x.outlets);

  // hours (London) of usable items on complete days
  const hours = Array(24).fill(0);
  for (const s of scope) if (!s.cls.out) hours[s.hour]++;

  // reviews: verdicts by game, and games reviewed by two or more outlets within a week
  const reviews = scope.filter((s) => s.cls.out === 'review');
  const byGame = new Map();
  for (const s of games.filter((x) => x.cls.out === 'review')) {
    const v = reviewVerdict(s.title);
    const key = (v?.game || s.title.replace(/\breview\b.*$/i, '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push({ outlet: s.outlet, title: s.title, verdict: v?.verdict || null, published: s.published });
  }
  const multiReviewed = [...byGame.entries()].filter(([, l]) => new Set(l.map((x) => x.outlet)).size >= 2).map(([game, l]) => ({ game, outlets: [...new Set(l.map((x) => x.outlet))], withVerdict: l.filter((x) => x.verdict).length }));

  // release dates: unique game-and-date pairs stated by usable items
  const dated = new Map();
  for (const s of games) if (s.date && !s.cls.out) {
    const k = `${s.date.date}|${[...s.kw].slice(0, 3).join(' ')}`;
    if (!dated.has(k)) dated.set(k, { date: s.date.date, title: s.title, outlet: s.outlet, day: s.day });
  }
  const datedByDay = {};
  for (const d of dated.values()) datedByDay[d.day] = (datedByDay[d.day] || 0) + 1;

  // the channel's grave test on games items
  const grave = scope.filter((s) => s.grave.grave);
  const kinds = {};
  for (const s of scope) if (s.grave.kind) kinds[s.grave.kind] = (kinds[s.grave.kind] || 0) + 1;

  // TECH BYTES's feeds: their games items
  const techGames = tech.filter((s) => gamesTopic(s) && s.cls.out !== 'off-topic');
  let aired = null;
  if (archive && fs.existsSync(archive)) {
    aired = { files: [], techBytes: 0, games: 0, examples: [] };
    for (const f of fs.readdirSync(archive).filter((x) => x.endsWith('.jsonl')).sort()) {
      aired.files.push(f);
      for (const line of fs.readFileSync(path.join(archive, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.programId !== 'tech-bytes') continue;
        aired.techBytes++;
        const entry = { title: e.title, summary: e.summary, link: e.link, kind: 'channel-tech' };
        if (gamesTopic(entry)) {
          aired.games++;
          if (aired.examples.length < 40) aired.examples.push(`${f.slice(0, 10)} ${e.source}: ${e.title}`);
        }
      }
    }
  }

  // the structured sources
  const data = readData(dir);

  return {
    readings: snaps.map((s) => s.stamp), complete, first: new Date(first).toISOString(), last: new Date(last).toISOString(), spanHours: Math.round((last - first) / HOUR * 10) / 10,
    items: list.length, gamesItems: games.length, perOutlet, perDay, rules, firsts, scopeItems: scope.length,
    exclusions, overlap, hours, reviews: { perScope: reviews.length, games: byGame.size, multiReviewed },
    dates: { pairs: dated.size, byDay: datedByDay, examples: [...dated.values()].slice(0, 30) },
    grave: { flagged: grave.length, of: scope.length, examples: grave.slice(0, 40).map((s) => `${s.outlet}: ${s.title}`), kinds },
    techGames: { items: techGames.length, of: tech.length, examples: techGames.slice(0, 30).map((s) => `${s.outlet}: ${s.title}`) },
    aired, data,
    list: games, events: [...events.values()],
  };
}

function readData(dir) {
  const root = path.join(dir, 'data');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const d of fs.readdirSync(root).sort()) {
    const stf = path.join(root, d, 'status.json');
    if (!fs.existsSync(stf)) continue;
    const st = JSON.parse(fs.readFileSync(stf, 'utf8'));
    const read = (name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, d, `${name}.json`), 'utf8'));
      } catch {
        return null;
      }
    };
    const conc = read('steam-concurrent')?.response;
    const most = read('steam-most-played')?.response;
    const cs2 = read('steam-cs2-now')?.response;
    const details = read('steam-details') || {};
    out.push({
      stamp: d, at: st.at, status: Object.fromEntries(Object.entries(st.status).map(([k, v]) => [k, v.status])),
      concurrent: conc ? { lastUpdate: conc.last_update * 1000, staleMinutes: Math.round((st.at - conc.last_update * 1000) / 60000), top: conc.ranks.slice(0, 10).map((r) => ({ appid: r.appid, name: details[r.appid]?.name || null, now: r.concurrent_in_game, peak: r.peak_in_game })) } : null,
      mostPlayed: most ? { rollup: new Date(most.rollup_date * 1000).toISOString().slice(0, 10), ageHours: Math.round((st.at - most.rollup_date * 1000) / HOUR), top: most.ranks.slice(0, 10).map((r) => ({ appid: r.appid, rank: r.rank, lastWeek: r.last_week_rank, peak: r.peak_in_game })) } : null,
      cs2: cs2?.player_count ?? null,
      details: Object.keys(details).length,
      metacritic: Object.values(details).filter((x) => x?.metacritic).length,
      reviewsSummary: Object.values(details).filter((x) => x?.reviews?.total_reviews).length,
    });
  }
  return out;
}

function printReport(r) {
  const L = [];
  L.push(`# PRESS START niche measurement`);
  L.push(`Readings: ${r.readings.length} (${r.first} to ${r.last}, ${r.spanHours} h). Items: ${r.gamesItems} games-outlet items, ${r.items - r.gamesItems} from TECH BYTES's feeds.`);
  L.push('');
  L.push('| Outlet | Kind | Read | Hours covered | Complete days | Items/day | Usable/day | Usable % | Rate/day (hours read) | Usable events | Shared | Only here | Pictures % |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const o of r.perOutlet) L.push(`| ${o.name} (${o.id}) | ${o.kind} | ${o.reach.read}/${o.reach.of} | ${o.coveredHours} | ${o.completeDays} | ${o.itemsPerDay ?? '—'} | ${o.usablePerDay ?? '—'} | ${o.completeDays ? o.usableShare : '—'} | ${o.ratePerDay ?? '—'} | ${o.usableEvents} | ${o.sharedEvents} | ${o.uniqueEvents} | ${o.pictures} |`);
  L.push('');
  L.push('| London day | Complete outlets | Items | Usable items | Events | Usable events | Would air (one report an event) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const d of r.perDay) L.push(`| ${d.day} | ${d.outlets} | ${d.items} | ${d.usable} | ${d.events} | ${d.usableEvents} | ${d.aired} |`);
  L.push('');
  L.push(`Standards on ${r.scopeItems} items of complete days (any match / first rule that keeps it off):`);
  L.push('| Rule | Matches | % | First (keeps off or kept as) | % |');
  L.push('|---|---|---|---|---|');
  for (const [id] of RULES) {
    const f = KEEPS_OFF.has(id) ? r.firsts[id] || 0 : null;
    L.push(`| ${id} | ${r.rules[id] || 0} | ${pct(r.rules[id] || 0, r.scopeItems)} | ${f ?? '—'} | ${f === null ? '—' : pct(f, r.scopeItems)} |`);
  }
  for (const k of [...Object.keys(r.firsts).filter((x) => x.startsWith('event: ')).sort(), 'kept: news', 'kept: serious', 'kept: tribute', 'kept: legal']) L.push(`| ${k} | | | ${r.firsts[k] || 0} | ${pct(r.firsts[k] || 0, r.scopeItems)} |`);
  L.push('');
  L.push('Each outlet on its complete days, by the first rule that keeps an item off (% of its items):');
  L.push('| Outlet | Items | Off topic | Guide | Commerce | Review | Outlet voice | Leak | Rumour | Explicit | Harm | Conflict | Gambling | Feud | Event off | Kept |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of r.exclusions) L.push(`| ${x.id} | ${x.n} | ${x['off-topic']} | ${x.guide} | ${x.commerce} | ${x.review} | ${x['outlet voice']} | ${x.leak} | ${x.rumour} | ${x.explicit} | ${x['harm to people']} | ${x['conflict or politics']} | ${x.gambling} | ${x['feud or gossip']} | ${x.event} | ${x.kept} |`);
  L.push('');
  L.push("Overlap: each outlet's usable events, how many another outlet carried too, and the outlets that carried most of them:");
  for (const [id, v] of Object.entries(r.overlap)) if (v.events) L.push(`  ${id}: ${v.events} events, ${v.shared} shared; most with ${v.top.map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  L.push('');
  L.push(`Hours (London) of usable items: ${r.hours.map((n, h) => `${h}:${n}`).join(' ')}`);
  L.push(`Reviews on complete days: ${r.reviews.perScope}; games reviewed: ${r.reviews.games}; by two or more outlets: ${r.reviews.multiReviewed.length} (${r.reviews.multiReviewed.map((x) => `${x.game} [${x.outlets.join(', ')}]`).join('; ')})`);
  L.push(`Release dates (unique, usable items): ${r.dates.pairs}; by the day filed: ${JSON.stringify(r.dates.byDay)}`);
  L.push(`Channel grave test (isGrave) on games items of complete days: ${r.grave.flagged} of ${r.grave.of} (${pct(r.grave.flagged, r.grave.of)} %); quiz excluded kinds: ${JSON.stringify(r.grave.kinds)}`);
  L.push(`TECH BYTES's feeds: ${r.techGames.items} games items of ${r.techGames.of}`);
  if (r.aired) L.push(`Archive (${r.aired.files.join(', ')}): TECH BYTES airings ${r.aired.techBytes}, of them games ${r.aired.games}`);
  for (const d of r.data) L.push(`Steam ${d.stamp}: ${JSON.stringify(d.status)} concurrent stale ${d.concurrent?.staleMinutes} min; most-played rollup ${d.mostPlayed?.rollup} (${d.mostPlayed?.ageHours} h); CS2 now ${d.cs2}; details ${d.details} (metacritic ${d.metacritic}, review summaries ${d.reviewsSummary})`);
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const r = await measure({ dir: path.resolve(ROOT, opt('--dir') || 'data/play-measure'), archive: opt('--archive'), eventTest: opt('--events') || 'v5' });
  const text = printReport(r);
  console.log(text);
  const stamp = r.readings.at(-1);
  const out = path.resolve(ROOT, opt('--json') || `data/play-measure/report-${stamp}.json`);
  const { list, events, ...rest } = r;
  fs.writeFileSync(out, JSON.stringify({ ...rest, items: list.map((s) => ({ outlet: s.outlet, day: s.day, hour: s.hour, title: s.title, link: s.link, out: s.cls.out, kinds: s.cls.kinds, treatment: s.cls.treatment, outlets: s.event?.outlets.size || 1, chosen: !!s.chosen, repeatOf: s.repeatOf ? `${s.repeatOf.outlet}: ${s.repeatOf.title}` : null, date: s.date?.date || null, grave: s.grave.grave, quizKind: s.grave.kind })) }, null, 1));
  fs.writeFileSync(out.replace(/\.json$/, '.md'), text + '\n');
  console.log(`\n[play] report: ${path.relative(ROOT, out)} and .md`);
}
