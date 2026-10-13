// COMING UP (docs/programmes/full-time.md §4): dated events ahead, read from a story's sentences. "Wales host Albania on
// Tuesday", "Tyson Fury and Anthony Joshua will fight for the WBA title when they box on December 11", "The Ashes
// begins on 21 November". The event is written from the sentence ("WALES v ALBANIA", "THE ASHES"), never composed; a
// side that is a description ("Norway's champions, who host Bayern Munich on Tuesday") gives nothing. Dates come from the
// day the story was published and must still be ahead.
import { datesAhead } from '../boards.js';

const NAMEW = "\\p{Lu}[\\p{L}'’.-]*";
const TEAM = `(${NAMEW}(?:(?:\\s+(?:&|de|del|of|la|le|du)(?=\\s+\\p{Lu})|\\s+(?=\\p{Lu}))${NAMEW}){0,4})`;
const VERB = '(?:will\\s+)?(?:face|faces|host|hosts|meet|meets|play|plays|take\\s+on|takes\\s+on|visit|visits|travel\\s+to|travels\\s+to|fight|fights|box|boxes|welcome|welcomes)';
const NOT_SIDE = /^(?:The|A|An|Les|La|He|She|They|It|Who|Which|Premier|Champions|Nations|League|World|Cup|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|After|Before|When|While|But|And|Also|Elsewhere|Meanwhile)$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const side = (span) => {
  const t = String(span || '').replace(/[.]+$/, '').replace(/['’]s?$/u, '').trim();
  const words = t.split(/\s+/);
  if (!t || NOT_SIDE.test(words[0]) || words.length > 4 || t.length > 26) return null;
  return t;
};

const FORMS = [
  // "Tyson Fury and Anthony Joshua will fight … when they box on December 11", "A and B will meet on Saturday"
  { re: new RegExp(`${TEAM}\\s+and\\s+${TEAM}\\s+(?:will|are set to|are due to|are scheduled to)\\s+(?:fight|meet|play|face each other|clash|box|go head to head)\\b`, 'u'), sides: (m) => [m[1], m[2]] },
  // "Wales host Albania on Tuesday", "Coventry will face Arsenal next week"
  { re: new RegExp(`${TEAM}\\s+${VERB}\\s+(?:the\\s+)?${TEAM}`, 'u'), sides: (m) => [m[1], m[2]] },
  // "the Daniel Dubois vs Fabio Wardley rematch on Saturday" (Sky Sports 13 Oct)
  { re: new RegExp(`${TEAM}\\s+(?:vs?\\.?|versus)\\s+${TEAM}\\s+(?:rematch|fight|bout|clash|match|game|final|showdown)\\b`, 'u'), sides: (m) => [m[1], m[2]] },
];
// an event by its own name: "The Ashes begins on 21 November", "The Rugby League World Cup gets under way on Saturday"
const EVENT = new RegExp(`^((?:The\\s+)?${NAMEW}(?:\\s+(?:${NAMEW}|of|de))*)\\s+(?:starts?|begins?|gets?\\s+under\\s+way|kicks?\\s+off|tees?\\s+off|takes?\\s+place|will\\s+(?:start|begin|be\\s+held|take\\s+place|get\\s+under\\s+way|kick\\s+off))\\b`, 'u');
const PAST = /\b(?:faced|hosted|met|played|visited|fought|boxed|welcomed|beat|won|lost|drew)\b/i;

/** "in November" (a month leaf), when that month is still ahead of the airing day. */
function monthAhead(sentence, now) {
  const m = /\bin\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b(?!\s+\d)/.exec(sentence);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  const today = new Date(now);
  if (month <= today.getUTCMonth()) return null; // this month or past (or next year, which a "fixture" rarely means)
  return { when: m[1].toUpperCase(), date: null, index: m.index, end: m.index + m[0].length };
}

/** Every dated event ahead a story's sentences state: [{ event, when, date, sentence }], one per event. */
export function fixturesIn(sentences, { published = Date.now(), now = Date.now() } = {}) {
  const out = [];
  for (const raw of sentences || []) {
    const s = String(raw || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[“"?]/.test(s)) continue;
    const dates = datesAhead(s, { published, now });
    const month = dates.length ? null : monthAhead(s, now);
    const date = dates[0] || month;
    if (!date) continue;
    let event = null;
    for (const f of FORMS) {
      const m = f.re.exec(s);
      if (!m || m.index > date.index) continue;
      const [a, b] = f.sides(m).map(side);
      if (!a || !b || a === b) continue;
      if (PAST.test(s.slice(m.index, date.index))) continue;
      // a manager is no side ("Zinedine Zidane faces Italy again on Friday, this time as France manager")
      if (/\bas\s+(?:the\s+)?\p{Lu}[\p{L}'’-]*\s+(?:manager|coach|head coach|boss)\b|\b(?:manager|coach|boss)\s+$/iu.test(s) || /\b(?:manager|coach|boss)\s+$/i.test(s.slice(0, m.index))) continue;
      event = `${a} v ${b}`;
      break;
    }
    if (!event) {
      const e = EVENT.exec(s);
      if (e && e[0].length <= date.index && !/^(?:He|She|They|It)\b/.test(e[1])) event = e[1].replace(/\s+/g, ' ');
    }
    if (!event) continue;
    const upper = event.toUpperCase();
    if (out.some((o) => o.event === upper)) continue;
    out.push({ event: upper, when: date.when, date: date.date, sentence: s });
  }
  return out;
}
