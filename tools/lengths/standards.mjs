// The truth and standards faults of a replay's editions, counted by airing (docs/roadmap/critique/fallback-lengths.md,
// round 6): the faults the hard panel found reading round 5, each found by rule over every edition a replay wrote
// (tools/lengths/replay.mjs --dump), so a fix is measured over hundreds of editions before the editions are read.
// Like lint.mjs, a rule here flags and never rewrites; a flag can be wrong (a reader decides).
//
//   view       a judgement in the presenter's voice nobody is said to hold ("Ironically, …", "in reality", "might not be
//              the case", "an impressive $27 million"), in a headline, a story, a correspondent's or an expert's line
//   banter     a presenter's sneer at a story ("I would like to see the figures from someone who is not selling it.")
//   bare       a person by a surname (or part of a name) the edition never said whole before (bare-headline: in a headline)
//   roleless   a person's whole name said for the first time with nothing to say who they are, the source saying it
//              (roleless-headline: in a headline, as outlets write them, "Russell Brand arrives for his trial")
//   bare-card  a quotation card whose speaker is one word the edition never says ("— Griffiths", "— Donna")
//   not-news   a story the news desk calls no news (advice, a column, an outlet's event) on air; lead-not-news: as the lead
//   same       two stories of one event in one edition (the desk's sameStory)
//   miss       a question its answer does not answer ("what comes next?" answered with what has been)
//   kicker     a playful or a stray topic on a grave story's strap, or a technology's topic from a stray word
//
//   node tools/lengths/standards.mjs <replay dir> [programme] [--show class] [--max 20]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { notNews, NewsDesk } = await import(path.join(here, '../../server/news.js'));
const { missesQuestion } = await import(path.join(here, '../../server/correspondents.js'));
const { sentencesOfText } = await import(path.join(here, 'measure.mjs'));
const { lookupPlace } = await import(path.join(here, '../../server/gazetteer.js'));

const plain = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const unquoted = (t) => String(t).replace(/“[^”]*”|"[^"]*"|‘[^’]*’/g, ' ');

// a judgement whoever is said to hold it: the outlet's own framing words
const STRONG_VIEW = /\b(?:ironically|in reality|might not be the case|no matter what|making up for lost time|as important as|nerds?|what could possibly go wrong|to be fair|make no mistake|the truth is|needless to say|for better or worse|arguably|it['’]s probably|is probably not|are probably not)\b/i;
// a judgement nobody is said to hold
const VIEW = /\b(?:(?:un)?surprisingly|unsurprising|awkward(?:ly)?|unconvincing|embarrassing|shameful|disgraceful|absurd|ridiculous|bizarre|outrageous|appalling|dreadful|brilliant|wonderful|fantastic|superb|laughabl[ey]|pathetic|dubious|reckless|foolish|unfortunately|fortunately|sadly|thankfully|hopefully|clearly|obviously|undoubtedly|frankly|admittedly|of course|it (?:looks|seems) (?:like|as if|as though)|stunning|striking|remarkabl[ey]|extraordinar(?:y|ily)|spectacular|incredibl[ey]|amazing(?:ly)?|astonishing(?:ly)?|staggering|groundbreaking|game-?changing|iconic|legendary|impressive(?:ly)?|breathtaking|jaw-dropping|mind-blowing|gorgeous|magnificent|dazzling|thrilling|fascinating|intriguing|a little unusual|probably)\b/i;
const HELD_BY = /\b(?:said|says|say|told|tells|warned|warns|added|adds|according to|argued|argues|believes?|believed|claims?|claimed|insisted|insists|urged|urges|called for|calls for|wrote|writes|recommend\w*|suggest\w*|stressed|noted|described|describes|called|calls|reports?|reported|described as)\b/i;
// the presenters' sneers (the round-5 reading)
const SNEER = /What could possibly go wrong|figures from someone who is not selling it|Also slightly worrying|Software with ambition|I will be checking its work|Somebody is going to have to write that rule/i;

// a grave story's strap: people killed or dead, a famine; never an animal's death nor an ancient one
const GRAVE = /\b(?:killed|kills|killing|dead|deaths?|died|dies|dying|famines?|starv\w*|massacres?|genocide|murder\w*|funerals?|mourn\w*|casualt\w*|wounded|fatal\w*|bodies|abused?|rape[ds]?)\b/i;
const OBIT = /\bobituary\b|\b(?:dies|died|has died) (?:aged|at) \d/i;
const APART = /\b(?:Neanderthals?|ancient|fossil|dinosaur|prehistoric|flying fox(?:es)?|whales?|bats|birds?|turtles?|elephants?|tigers?|sharks?|bees)\b/i;
const PEOPLE = /\b(?:people|man|men|woman|women|child|children|boys?|girls?|famil(?:y|ies)|residents|civilians|workers|miners|passengers|hiker|officials|journalists?|mourners|victims)\b/i;
const PLAYFUL = new Set(['GADGETS', 'SOFTWARE', 'AI', 'CHIPS', 'ROBOTICS', 'GAMING', 'CONNECTIVITY', 'CULTURE', 'WILDLIFE', 'GREEN CITIES', 'ASTRONOMY', 'SPACE', 'OCEANS', 'EDUCATION', 'MOTORING', 'TRADE', 'MARKETS', 'ENERGY', 'TRANSPORT', 'WATER', 'JOBS', 'ECONOMY', 'TECHNOLOGY', 'BUSINESS', 'SCIENCE', 'CLIMATE', 'HISTORY']);
const TECH_TOPIC = new Set(['GADGETS', 'SOFTWARE', 'AI', 'CHIPS', 'ROBOTICS', 'GAMING', 'CONNECTIVITY']);
const TECH_WORD = /\b(?:robo\w*|self-driving|autonomous|drones?|AI|artificial intelligence|chatbot|apps?|software|robots?|chips?|semiconductors?|processors?|phones?|smartphones?|gadgets?|headsets?|glasses|laptops?|tablets?|cameras?|TVs?|consoles?|gaming|video games?|internet|broadband|5G|iPhone|iPad|Android|iOS|Windows)\b/i;

// people: a whole name as the source gives it (two or three capitalised words), its surname, and whether the source says
// who they are (a role before it, or an apposition after it)
const NAME = String.raw`\p{Lu}\p{Ll}+(?:[-’']\p{Lu}?\p{Ll}+)?(?:\s+\p{Lu}\p{Ll}+(?:[-’']\p{Lu}?\p{Ll}+)?){1,2}`;
const NOT_GIVEN = /^(?:The|A|An|In|On|At|For|After|Before|And|But|Or|As|With|From|By|To|Of|It|This|That|He|She|They|We|Mr|Mrs|Ms|Dr|Prof|Sir|Dame|Lord|Lady|President|Prime|Minister|Chancellor|Secretary|Senator|Governor|Mayor|Judge|Justice|Chief|General|Pope|King|Queen|Prince|Princess|Archbishop|Bishop|Saint|St|North|South|East|West|New|Los|San|Las|Hong|United|Great|Royal|National|Federal|Supreme|High|Labour|Conservative|Conservatives|Democratic|Republican|Republicans|Democrat|Democrats|Green|Greens|Reform|Liberal|Tory|Tories|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|European|American|British|Chinese|Russian|Israeli|Iranian|Ukrainian|Australian|Canadian|Indian|Pakistani|Saudi|Turkish|French|German|Italian|Spanish|Japanese|Korean|Space|Air|Sea|Gulf|Middle|Silicon|Wall|Downing|White|Capitol|Champions|Premier|World|Nobel|Olympic|Grand|Formula|Breaking|Mount|Lake|River|Cape|Port|Fort)$/;
const EVERYDAY = /^(?:Donald Trump|Joe Biden|Keir Starmer|Vladimir Putin|Volodymyr Zelensky|Volodymyr Zelenskyy|Benjamin Netanyahu|Xi Jinping|Elon Musk|Emmanuel Macron|Narendra Modi|Kamala Harris|JD Vance|Andy Burnham|Pope Leo|Leo XIV)$/;
const ROLE = /\b(?:president|prime minister|chancellor|minister|secretary|senator|governor|mayor|judge|justice|professor|prof|dr|doctor|sir|dame|lord|lady|king|queen|prince|princess|pope|general|colonel|captain|chief|director|ceo|chair(?:man|woman|person)?|founder|co-founder|commissioner|ambassador|rep|representative|congress(?:man|woman)|mp|speaker|leader|archbishop|bishop|rabbi|imam|spokes(?:person|man|woman)|analyst|economist|scientist|researcher|author|lawyer|attorney|officer|manager|head|counsellor|counselor|adviser|advisor|editor|correspondent|reporter|journalist|engineer|coach|player|striker|captain|actor|actress|singer|artist|astronaut|expert|campaigner|activist|lecturer|fellow|curator|ecologist|biologist|physicist|chemist|astronomer|geologist|historian|archaeologist|surgeon|nurse|consultant|partner|owner|investor|executive|vice|deputy|aide|official|councillor|police|detective|inspector|superintendent|prosecutor|commander|candidate|lawmaker|pm|politician|mother|father|son|daughter|wife|husband|brother|sister|widow|student|pupil|teacher|resident|farmer|victim|survivor|witness|employee|worker|staff|member|volunteer|organiser|organizer|designer|developer|programmer|entrepreneur|billionaire|tycoon|star|winner|champion|presenter|host|broadcaster|comedian|writer|novelist|poet|director|producer|model|athlete|swimmer|runner|cyclist|boxer|footballer|cricketer|golfer|rugby|tennis|olympian|national|citizen|man|woman|boy|girl|teenager|aged|year-old)s?\b/i;
const SAYS = /\b(?:said|says|told|tells|added|adds|explained|warned|argued|put it|was speaking|wrote|writes)\b/;

// words that make a capitalised run an organisation, a place or a thing, never a person's name
const ORG = /^(?:Security|Party|News|Office|Corps|Revolutionary|Agency|Council|Ministry|Department|University|Institute|Society|Bank|Group|Company|Corporation|Fund|Union|Association|Commission|Court|Police|Service|Services|Authority|Board|Foundation|Trust|Centre|Center|Organisation|Organization|Games|Records|Studios|Labs|Airlines|Airways|Times|Post|Journal|Herald|Express|Mail|Guardian|Telegraph|Network|Media|Television|Radio|Press|Club|City|FC|Hospital|School|College|Museum|Gallery|Theatre|Station|Airport|Street|Road|Square|Park|Bridge|Island|Islands|Province|State|States|County|Region|Republic|Kingdom|Empire|Assembly|Parliament|Senate|Congress|House|Cabinet|Command|Forces|Army|Navy|Guard|Brigade|Movement|Front|Alliance|Coalition|Federation|League|Cup|Championship|Prize|Award|Awards|Festival|Summit|Conference|Forum|Week|Day|Act|Bill|Law|Treaty|Plan|Programme|Program|Project|Mission|Telescope|Observatory|Islamic|Catholic|Church|Cathedral|Valley|Mountains?|Desert|Ocean|Bay|Coast|Canal|Peninsula|Basin|Strait|Gate|Tower|Palace|Hall|Castle|Abbey|Stadium|Arena|Centre|Market|Exchange|Index|Capital|Partners|Holdings|Industries|Motors|Energy|Electric|Pharma|Health|Care|Rescue|Relief|Aid|Watch|Lab|Laboratory|Research|Science|Sciences|Studies|Review|Report|Index|Survey|Data|Systems|Technologies|Technology|Software|Robotics|Solutions|Ventures|Capital|Equity|Investments|Insurance|Mutual|Railways?|Rail|Transport|Water|Gas|Oil|Mining|Steel|Foods?|Brands|Stores|Shop|Shops|Mall|Clinic|Prison|Base|Camp|Zone|Strip|Bank)$/;
const GIVEN_WORD = /^\p{Lu}\p{Ll}+(?:[-’']\p{Lu}?\p{Ll}+)?$/u;

export function peopleOf(src) {
  const text = `${src.title || ''}. ${src.summary || ''} ${String(src.body || '').replace(/\n+/g, ' ')}`;
  const out = new Map();
  for (const m of text.matchAll(/(?<![\p{L}’'-])(?:\p{Lu}[\p{L}’'.-]*\s+)*\p{Lu}[\p{L}’'-]*(?![\p{L}’'-])/gu)) {
    const run = m[0].replace(/[’']s$/, '');
    const words = run.split(/\s+/);
    let j = -1;
    words.forEach((w, k) => {
      if (NOT_GIVEN.test(w) || ORG.test(w) || /[’']s$/.test(w) || /^\p{Lu}{2,}$/u.test(w) || !GIVEN_WORD.test(w) || ROLE.test(w)) j = k;
    });
    const name = words.slice(j + 1);
    if (name.length < 2 || name.length > 3) continue;
    const full = name.join(' ');
    const at = m.index + m[0].indexOf(full);
    const before = text.slice(Math.max(0, at - 60), at);
    const after = text.slice(at + full.length, at + full.length + 120).replace(/^[’']s/, '');
    const lead = j >= 0 ? words.slice(0, j + 1).join(' ') : '';
    const near = before.split(/[.;:,“”"]/).pop().split(/\s+/).slice(-5).join(' ');
    const roleBefore = (lead && ROLE.test(lead)) || ROLE.test(near);
    const apposition = /^,\s+(?:a|an|the|\p{Lu}[\p{L}’'.&-]*['’]s|[a-z]+(?:\s+[a-z]+){0,3}\s+(?:of|at|for|with|in))\s[^,.;]{2,90}(?:,|\.|$)/u.test(after) || (/^,\s+[^,.;]{2,60}(?:,|\.)/.test(after) && ROLE.test(after.slice(0, 70).split(/[,.;]/)[1] || ''));
    // a person: a speaker, an honorific, a role, an age
    const person = /(?:said|says|told|according to|by)\s+$/.test(before) || /^,?\s+(?:said|says|told|added|wrote|explained|warned|who|has said|had said)\b/.test(after) || /^,\s+\d{1,3},/.test(after) || /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+$/.test(before) || roleBefore || apposition;
    if (!person) continue;
    const surname = name.at(-1);
    if (lookupPlace(surname) || lookupPlace(full) || /(?:ians?|ese|ish|is)$/.test(surname) || /^(?:Rohingya|Houthis?|Kurds?|Uyghurs?|Sámi|Maori)$/.test(surname)) continue;
    const role = roleBefore || apposition;
    const was = out.get(surname);
    if (!was) out.set(surname, { full, first: name.slice(0, -1).join(' '), role });
    else if (role) was.role = true;
  }
  return out;
}

// a headline said as one: the intro's, a tease's ("Still to come: …"), counted apart from a story's lines
const headline = (s, t) => s.type === 'intro' || /^(?:Still to come|Later(?: in the programme)?|Coming up|Also coming up|Also ahead|Next)\b/.test(t);
/** The faults of one edition: [{ cls, seg, text }]. `src(id)` is the story's source { title, summary, body }. */
export function standardsOf(ep, src = () => null, { desk = null } = {}) {
  const out = [];
  const add = (cls, i, text) => out.push({ cls, seg: i, text: plain(text).slice(0, 220) });
  const segs = ep?.segments || [];
  // views, sneers
  segs.forEach((s, i) => {
    const restaged = s.type === 'cross' && s.kind === 'restage';
    if (restaged || s.part === 'ask' || s.part === 'thanks') return;
    for (const t of sentencesOfText(plain(s.text))) {
      const u = unquoted(t);
      if (s.type === 'chat' && SNEER.test(t)) add('banter', i, t);
      else if (STRONG_VIEW.test(u) || (VIEW.test(u) && !HELD_BY.test(u))) add('view', i, t);
    }
  });
  // people, in the order the edition says them
  const known = new Map();
  const ids = [...new Set(segs.map((s) => s.storyId).filter(Boolean))];
  for (const id of ids) for (const [k, v] of peopleOf(src(id) || {})) if (!known.has(k) || v.full.length > known.get(k).full.length) known.set(k, v);
  const said = new Set();
  // (the channel's own: its presenters, correspondents and experts, named in their hand-overs and thanks)
  const own = segs.filter((s) => s.type === 'intro' || s.part === 'ask' || s.part === 'thanks' || (s.type === 'story' && s.link)).map((s) => plain(s.text)).join(' ');
  for (const [k, v] of known) if (own.includes(v.full)) known.delete(k);
  segs.forEach((s, i) => {
    if (s.part === 'ask' || s.part === 'thanks') return;
    for (const t of sentencesOfText(plain(s.text))) {
      for (const [surname, p] of known) {
        if (EVERYDAY.test(p.full) || said.has(surname)) continue;
        const at = t.search(new RegExp(`(?<![\\p{L}-])${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}-])`, 'u'));
        if (at < 0) continue;
        // (a surname inside another name is not this person: "Hurricane Simon", "Auguste Renoir" for "Pierre-Auguste Renoir")
        const inName = /\p{Lu}[\p{L}’'.-]*\s+$/u.test(t.slice(0, at)) && !t.slice(0, at).endsWith(`${p.first} `) && at > 0 && !/[.!?]\s+\p{Lu}[\p{L}’'-]*\s+$/u.test(t.slice(0, at));
        if (inName || /^\s+\p{Lu}/u.test(t.slice(at + surname.length))) continue;
        said.add(surname);
        const whole = t.includes(p.full);
        if (!whole) {
          add(headline(s, t) ? 'bare-headline' : 'bare', i, t);
          continue;
        }
        const k = t.indexOf(p.full);
        const before = t.slice(Math.max(0, k - 70), k).split(/[.;:]/).pop();
        const after = t.slice(k + p.full.length);
        const role = ROLE.test(before.split(/\s+/).slice(-6).join(' ')) || /^[’']?s?,\s+(?:a|an|the|who|\p{Lu}[\p{L}’'.&-]*['’]s|[a-z]+)\s[^,.;]{2,90}(?:,|\.$)/u.test(after) || /^,\s+[^,.;]{2,60}\b(?:of|at|for)\b/.test(after);
        if (!role && p.role) add(headline(s, t) ? 'roleless-headline' : 'roleless', i, t);
      }
    }
  });
  // quotation cards by a name the viewer never heard
  const spokenAll = segs.map((s) => plain(s.text)).join(' ');
  segs.forEach((s, i) => {
    const by = String(s.quote?.by || '').trim();
    if (by && !/\s/.test(by) && !new RegExp(`(?<![\\p{L}’'-])${by.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(spokenAll)) add('bare-card', i, `— ${by}`);
  });
  // not news, one event twice, kickers
  const storyIds = [];
  segs.forEach((s, i) => {
    if (s.type !== 'story' || !s.storyId) return;
    const x = src(s.storyId);
    if (x && notNews({ title: x.title, summary: x.summary, category: s.category, link: '' })) add(storyIds.length === 0 ? 'lead-not-news' : 'not-news', i, x.title);
    if (!storyIds.includes(s.storyId)) storyIds.push(s.storyId);
    const title = x?.title || s.headline || '';
    const k = s.kicker;
    if (k && PLAYFUL.has(k) && (GRAVE.test(title) || OBIT.test(title)) && !(OBIT.test(title) && ['CULTURE', 'SCIENCE', 'HISTORY'].includes(k)) && !(APART.test(title) && !PEOPLE.test(title))) add('kicker', i, `${k}: ${title}`);
    else if (k && TECH_TOPIC.has(k) && s.category !== 'tech' && !TECH_WORD.test(title)) add('kicker', i, `${k}: ${title}`);
  });
  if (desk) {
    for (let a = 0; a < storyIds.length; a++) {
      for (let b = a + 1; b < storyIds.length; b++) {
        const A = src(storyIds[a]);
        const B = src(storyIds[b]);
        if (!A || !B) continue;
        const sa = { id: storyIds[a], title: A.title, summary: A.summary, category: A.category || 'world', source: A.source };
        const sb = { id: storyIds[b], title: B.title, summary: B.summary, category: B.category || 'world', source: B.source };
        if (desk.sameStory(sa, sb) || desk.sameStory(sb, sa)) add('same', 0, `«${A.title}» / «${B.title}»`);
      }
    }
  }
  // questions and answers
  segs.forEach((s, i) => {
    const next = segs[i + 1];
    if (!next) return;
    const q = plain(s.text);
    const a = plain(next.text);
    const pair = (s.type === 'cross' && s.part === 'ask' && next.part === 'answer') || (s.type === 'chat' && next.type === 'chat' && /\?\s*$/.test(q) && s.anchor !== next.anchor);
    if (pair && missesQuestion(q, a)) add('miss', i, `${q} / ${a}`);
  });
  return out;
}

async function cli() {
  const args = process.argv.slice(2);
  const opt = (k) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args.splice(i, 2)[1] : null;
  };
  const show = opt('show');
  const maxShow = Number(opt('max') || 20);
  const [dir, only] = args;
  const files = fs.readdirSync(dir).filter((f) => /^\d+-[a-z0-9-]+\.json$/.test(f) && (!only || f.endsWith(`-${only}.json`))).sort();
  const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} }, fetchImpl: async () => { throw new Error('offline'); }, lookup: async () => [] });
  const counts = {};
  const shown = [];
  for (const f of files) {
    const ep = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const srcs = new Map();
    const srcFile = path.join(dir, f.replace('.json', '.src.txt'));
    if (fs.existsSync(srcFile)) {
      for (const block of fs.readFileSync(srcFile, 'utf8').split(/^## /m).slice(1)) {
        const head = block.split('\n')[0].split(' · ');
        srcs.set(head[0].trim(), { source: head[1], category: head[2]?.trim(), title: (block.match(/^TITLE: (.*)$/m) || [])[1] || '', summary: (block.match(/^SUMMARY: (.*)$/m) || [])[1] || '', body: (block.match(/^BODY \([^)]*\):\n([\s\S]*)$/m) || [])[1] || '' });
      }
    }
    for (const x of standardsOf(ep, (id) => srcs.get(id), { desk })) {
      counts[x.cls] = (counts[x.cls] || 0) + 1;
      if (show && x.cls === show && shown.length < maxShow) shown.push(`${f} [${x.seg}] ${x.text}`);
    }
  }
  console.log(`${files.length} editions: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'no flags'}`);
  for (const s of shown) console.log(`  ${s}`);
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
