// PRESS START's supply model (docs/programmes/press-start.md §7, §9): from a measurement report (tools/play/measure.mjs),
// what each weekday segment could carry and how many editions a day the would-air events fill.
//
//   node tools/play/supply.mjs <report.json> [--days 2026-10-14,2026-10-15]
//
// Segments by the words of the report the event would be told from: PATCH NOTES (an update, a patch, a DLC, a delay, a
// port, a demo, a mode's end), ACHIEVEMENT UNLOCKED (a milestone: sales, players, downloads, a record, an anniversary),
// the mature titles (a picture policy: before 21:00 the GAME CARTRIDGE board stands in for a screenshot), the serious
// stories (hardship, law, a tribute). Editions: at the hours given, the would-air events first reported since the last
// edition (fresh) and in the 24 hours before.
import fs from 'node:fs';

export const UPDATE = /\b(?:update|patch(?:es|ed)?|hotfix|dlc|expansion|season \d|season pass|delay(?:ed|s)?|postpone\w*|port(?:ed|s)?\b|coming to|comes to|adds?\b|added|demo|early access|1\.0|out now|now available|available now|launches? (?:today|on)|removed? from|ends? support|end of service|shut(?:s|ting)? down|sunset\w*|upgrade|remaster\w*|director['’]s cut|re-?release\w*|version)\b/i;
export const MILESTONE = /\b(?:\d[\d,.]*\s*(?:million|m|k|thousand)\b|million|sales|sold|copies|players|downloads|record|fastest-selling|best-selling|anniversary|peak|concurrent|wishlist(?:ed|s)?|milestone|top spot|number one|no\. 1)\b/i;
export const MATURE = /\b(?:grand theft auto|gta|call of duty|modern warfare|black ops|mortal kombat|resident evil|silent hill|dead space|doom|hitman|wolfenstein|the last of us|gears of war|god of war|dying light|dead island|the callisto protocol|metal gear|mafia|outlast|manhunt|bloodborne|elden ring|diablo|m-rated|pegi 18|rated m|18\+|mature)\b/i;

export function supply(report, days, hours = [11, 14, 17, 20]) {
  const chosen = report.items.filter((s) => s.chosen);
  const perDay = {};
  for (const d of days) {
    const its = chosen.filter((s) => s.day === d);
    perDay[d] = {
      wouldAir: its.length,
      patchNotes: its.filter((s) => UPDATE.test(s.title) && s.treatment === 'news').length,
      achievement: its.filter((s) => MILESTONE.test(s.title) && s.treatment === 'news').length,
      mature: its.filter((s) => MATURE.test(s.title)).length,
      serious: its.filter((s) => s.treatment !== 'news').length,
      dated: report.items.filter((s) => s.day === d && s.date && !s.out).length,
      byHour: Array.from({ length: 24 }, (_, h) => its.filter((s) => s.hour === h).length),
    };
  }
  // editions on a day: fresh since the last edition (the first edition counts from the previous day's last) and in 24 h
  const editions = {};
  for (const d of days) {
    const prev = days[days.indexOf(d) - 1];
    const by = perDay[d].byHour;
    const prevBy = prev ? perDay[prev].byHour : null;
    editions[d] = hours.map((h, i) => {
      const from = i ? hours[i - 1] : hours.at(-1) - 24;
      let fresh = 0;
      for (let x = from; x < h; x++) fresh += x < 0 ? (prevBy ? prevBy[x + 24] : 0) : by[x];
      let day = 0;
      for (let x = h - 24; x < h; x++) day += x < 0 ? (prevBy ? prevBy[x + 24] : 0) : by[x];
      return { hour: h, fresh, last24: prevBy || h >= 24 ? day : null };
    });
  }
  return { perDay, editions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, ...rest] = process.argv.slice(2);
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const di = rest.indexOf('--days');
  const days = di >= 0 ? rest[di + 1].split(',') : ['2026-10-14', '2026-10-15'];
  const r = supply(report, days);
  console.log('| Day | Would air | PATCH NOTES lines | ACHIEVEMENT | Mature titles | Serious, legal, tribute | Dated releases (filed) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [d, v] of Object.entries(r.perDay)) console.log(`| ${d} | ${v.wouldAir} | ${v.patchNotes} | ${v.achievement} | ${v.mature} | ${v.serious} | ${v.dated} |`);
  for (const [d, eds] of Object.entries(r.editions)) console.log(`${d} editions: ${eds.map((e) => `${e.hour}:00 fresh ${e.fresh}${e.last24 === null ? '' : `, 24 h ${e.last24}`}`).join('; ')}`);
  for (const [d, v] of Object.entries(r.perDay)) console.log(`${d} by hour: ${v.byHour.map((n, h) => (n ? `${h}:${n}` : '')).filter(Boolean).join(' ')}`);
}
