// The free-picture desk (docs/roadmap/FOTOS_LIBRES.md): for a story, the most truthful picture the channel may
// publish on YouTube, or none (the channel's own graphics then carry the story: the map, the figures, the quote).
//
// It looks for what the story is ABOUT (§2): the entities it names, resolved to one Wikidata item each, and their
// canonical free pictures (P18) and Commons categories (P373); then the story's place, as the old FILE search did.
// Every candidate passes the legal gate (licence.js, per profile) and the provenance check (provenance.js) before
// it is even ranked; nothing fails open.
//
//   new FreePictureDesk({ wikidata, commons, profile, log, now }).find(story, { brief, avoid }) -> picture | null
//   (avoid: a Set of Commons file names other stories of the programme already show)
//   picture: { url, width, height, focusY, credit, license, page, via: 'free:<how>', kind: 'file', record }
//   record (what a YouTube description and a claim need): { file, title, author, licence: {id, version, label},
//     licenceUrl, source, page, qid, entity, subject, flags, found }
//
// People: only a public figure's own portrait (their Wikidata P18, matched with the story's words), never a private
// person, never in a story that accuses them of something (fail closed: the map is never wrong).
import { Wikidata } from './wikidata.js';
import { Commons } from './commons.js';
import { allowedFor, PROFILES } from './licence.js';
import { provenance } from './provenance.js';
import { briefSubjects, headlineSubjects } from './subjects.js';
import { fileCredit, fileQuery, NOT_A_PHOTO, EVENT_WORDS, MIMES } from '../imagesearch.js';
import { isGrave } from '../facts.js';
import { lookupPlace } from '../gazetteer.js';

export const MIN_WIDTH = 640; // must survive the full-screen shot (192x108 pixelated from at least this)
const LANDSCAPE = [1.2, 2.4];
const PORTRAIT = [0.62, 2.4]; // a portrait is cropped to 16:9 around the face (focusY)
const PORTRAIT_FOCUS = 0.18;
// a public figure: someone a news story may show by their official portrait
const PUBLIC_ROLE = /\b(president|prime minister|premier|chancellor|minister|secretary|senator|congress(wo)?man|representative|member of (the )?parliament|\bmp\b|\bmep\b|governor|mayor|king|queen|monarch|emperor|prince|princess|pope|cardinal|archbishop|leader|politician|diplomat|ambassador|general|admiral|chief executive|ceo|founder|co-founder|businessman|businesswoman|entrepreneur|investor|chair(man|woman|person)?|judge|justice|astronaut|actor|actress|singer|musician|rapper|footballer|athlete|tennis player|basketball player|director|author|novelist|journalist|presenter|economist|central banker|activist)\b/i;
const ACCUSED = /\b(accus\w*|charg(ed|es)|arrest\w*|indict\w*|convict\w*|sentenc\w*|su(ed|es|ing)\b|lawsuit|investigat\w*|probe|scandal|alleg\w*|fraud|corruption|bribe\w*|harass\w*|abuse\w*|rape|murder\w*|trial)\b/;
const FESTIVE = /\b(festival|fiesta|carnival|party|parade|celebrat\w*|wedding|holiday|vacation|beach|beaches|resort|tourist|tourism|fireworks|christmas|concert|smil\w*)\b/i;
// a search result (not an entity's own P18) must be a VIEW of a place or a building; the bench (7 Oct) showed what
// else comes back from a category: union members under "Amazon", a man in a restaurant under "Google", the England
// football team under "England", children in a classroom under "School"
const VIEW = /\b(skyline|panorama|panoramic|view|views|vista|aerial|cityscape|landscape|seen from|overlook|building|buildings|headquarters|hq|exterior|facade|façade|campus|office|offices|tower|street|square|plaza|avenue|boulevard|harbour|harbor|port|bridge|station|river|waterfront|coast|bay|downtown|old town|centre|center|city|town|village|hall|palace|parliament|cathedral|church|museum|stadium|store|shop|plant|factory|airport|dam|canal|lake|mountain|valley|island|night)\b/i;
// people, war and damage: never from a search (the people are not public figures we chose; the damage is an event)
const PEOPLE = /\b(people|person|man|men|woman|women|boy|girl|child|children|kids|pupils|students|student|fans|crowd|crowds|team|players|player|squad|soldiers?|troops|police|officers?|protest\w*|demonstrat\w*|strik(e|ers|ing)|union|members|staff|workers|employees|volunteers|family|families|portrait|selfie|posing|poses|meeting|conference|press conference|briefing|smoking|smoker|reuni[oó]n|r[eé]union|treffen|encuentro|incontro|visita|visite|besuch|personas|gente|leute|persone|ministr[oa]s?|presidente?a?|vicepresident[ea]?|delegaci[oó]n|d[eé]l[eé]gation|ceremonia|c[eé]r[eé]monie|zeremonie|cerimonia|manifestaci[oó]n|manifestation|protesta|huelga|gr[eè]ve|streik|sciopero|interview|ceremony|visit|visits|delegation)\b/i;
const WAR = /\b(war|military|army|idf|soldier\w*|troops|tank|tanks|missile|rocket|airstrike|air strike|shell(ing|ed)?|bomb\w*|damage[ds]?|destroy\w*|destruction|ruins?|rubble|debris|wreck\w*|burn(ed|t|ing)|casualt\w*|wounded|refugees?|checkpoint|weapon\w*|gun|guns|rifle)\b/i;
// an aircraft, a ship or a drone is not a view of the place it was photographed over: "aerial" in a place's
// category once brought a US Air Force target drone over the Gulf of Mexico under a hurricane story (8 Oct)
const CRAFT = /\b(aircraft|airplane|aeroplane|airliner|jet|jets|fighter|bomber|helicopter|drone|drones|warship|destroyer|frigate|submarine|air force|airman|airmen|navy|naval|q?f-\d+[a-z]?|c-\d{2,3}|b-\d{1,2})\b/i;
// a screenshot or a page of text turns to noise at 192x108
const UNREADABLE = /\b(screenshot|screen shot|screen capture|user interface|interface|website|web page|homepage|document|text)\b/i;
const ORG_BUILDING = /\b(headquarters|hq|head office|offices?|building|campus|tower|store|shop|branch|plant|factory|facility|data cent(er|re)|studios?|exterior|facade|façade)\b/i;
// a grave story is never illustrated with a postcard (a sunset over Gaza City under "Gaza's devastation", 7 Oct)
const PRETTY = /\b(sunset|sunrise|dusk|dawn|golden hour|scenic|beautiful|postcard|rainbow|blossom|idyllic)\b/i;
const OLDEST_YEAR = 1990;
// a story about space, and the words that say a picture was made in space (or of it)
const SPACE = /\b(nasa|esa|space|telescope|webb|hubble|moon|lunar|mars|martian|planet\w*|asteroid|comet|galax\w*|star|stars|orbit\w*|astronaut\w*|rocket|spacecraft|satellite|artemis|iss|cosmic|universe|solar system|rover|curiosity|perseverance)\b/i; // an archive photograph is not the place (or the person) as it is now
// what to look for inside an entity's Commons category, by kind (CirrusSearch OR)
const CATEGORY_TEXT = {
  city: 'skyline OR panorama OR aerial OR view',
  country: 'landscape OR panorama OR skyline OR aerial',
  place: 'panorama OR landscape OR aerial OR view',
  structure: 'exterior OR view OR aerial OR facade',
  organisation: 'headquarters OR building OR office OR store',
};

const yearOf = (s) => Number(/\b(1[89]\d\d|20\d\d)\b/.exec(String(s ?? ''))?.[1]) || null;
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
// words that say nothing about what a picture shows ("the canal's locks OR ships IN transit")
const FILLER = new Set('the and for with from into onto over under near its their this that these those some any other about showing shows show image picture photo photograph view scene generic new old one two'.split(' '));
/** The first `n` content words of a phrase (a stock query from the brief's "show"). */
export const keywords = (s, n) => [...new Set(words(s).filter((w) => !FILLER.has(w)))].slice(0, n);
/** Singular-ish form, so a tag "ship" matches a query "ships". */
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, '');
export class FreePictureDesk {
  // stock: a Pixabay (or null), nasa: a NasaImages (or null) — the phase-2 sources (stock.js)
  constructor({ wikidata = new Wikidata(), commons = new Commons(), stock = null, nasa = null, profile = PROFILES.youtube, log = console, now = () => Date.now() } = {}) {
    this.stock = stock;
    this.nasa = nasa;
    this.wikidata = wikidata;
    this.commons = commons;
    this.profile = profile;
    this.log = log;
    this.now = now;
    this.warned = 0;
  }

  warn(msg) {
    if (this.warned++ < 5) this.log.warn?.(`[freepics] ${msg}`);
  }

  /** The subjects with their Wikidata items (a lookup that fails or finds no clear item is dropped). */
  async entities(story, brief) {
    const fromBrief = briefSubjects(brief);
    const subjects = fromBrief.length ? fromBrief : headlineSubjects(story);
    const context = `${story.title || ''} ${story.summary || ''}`;
    const out = [];
    for (const s of subjects) {
      // an event's own Wikidata picture is its aftermath (an attack, a protest, a disaster): never; the event's
      // place and the people it is about stay (the satellite of the day is phase 2)
      if (s.kind === 'event') continue;
      try {
        const kind = s.kind === 'other' ? null : s.kind;
        // a name with no kind (or the loose 'place': a region, a state) must be confirmed by the story or the hint
        // ("Georgia" the country or the US state)
        const loose = !kind || kind === 'place';
        const e = await this.wikidata.resolve(s.name, { kind: loose ? null : kind, context, hint: s.hint, requireContext: loose && !s.fromBrief });
        if (e) out.push({ subject: s, entity: e });
      } catch (err) {
        this.warn(`wikidata "${s.name}": ${err.message}`);
      }
    }
    return out;
  }

  /** Is this entity a person, and may the story show their portrait? */
  personPolicy(entity, story) {
    const person = entity.classes?.includes('Q5') || entity.kind === 'person';
    if (!person) return { person: false, portrait: false };
    const text = `${story.title || ''} ${story.summary || ''}`;
    const publicFigure = PUBLIC_ROLE.test(entity.description || '') && (entity.sitelinks || 0) >= 10;
    const accused = ACCUSED.test(text.toLowerCase());
    return { person: true, portrait: publicFigure && !accused, why: !publicFigure ? 'not a public figure' : accused ? 'accusation in the story' : null };
  }

  /** Every candidate file, with where it came from. */
  async candidates(story, brief) {
    const found = await this.entities(story, brief);
    const out = [];
    const p18 = [];
    for (const { subject, entity } of found) {
      const pol = this.personPolicy(entity, story);
      if (pol.person && !pol.portrait) continue;
      if (entity.image) p18.push({ name: entity.image, subject, entity, person: pol.person });
    }
    try {
      const files = await this.commons.files(p18.map((x) => x.name));
      const byName = new Map(files.map((f) => [f.name.replace(/^File:/, '').toLowerCase(), f]));
      for (const x of p18) {
        const f = byName.get(String(x.name).replace(/_/g, ' ').toLowerCase());
        if (f) out.push({ file: f, how: 'p18', subject: x.subject, entity: x.entity, person: x.person });
      }
    } catch (err) {
      this.warn(`commons files: ${err.message}`);
    }
    // inside the Commons category of the first non-person entity that has one (one search per story)
    // only a SPECIFIC thing (a place with coordinates, an organisation, a building): a generic concept's category
    // ("School", "Wheat") holds any school anywhere, which under a story about one school misleads
    // (a real building has coordinates; "School" tagged as a structure has none: round 3, 7 Oct)
    const specific = (entity, kind) => !!entity.coords || kind === 'organisation';
    const cat = found.find(({ entity, subject }) => {
      const kind = subject.kind || kindOf(entity);
      return entity.commonsCategory && !this.personPolicy(entity, story).person && CATEGORY_TEXT[kind] && specific(entity, kind);
    });
    if (cat) {
      try {
        const kind = cat.subject.kind || kindOf(cat.entity);
        const files = await this.commons.search(CATEGORY_TEXT[kind], { category: cat.entity.commonsCategory, limit: 12 });
        files.forEach((f, i) => out.push({ file: f, how: 'category', rank: i, subject: cat.subject, entity: cat.entity, person: false }));
      } catch (err) {
        this.warn(`commons category: ${err.message}`);
      }
    }
    // the story's place, as the FILE search always did (place + structure, never event words)
    const fq = fileQuery(story);
    // (only without a brief: with one, the brief's own places rule; the gazetteer reads a country off the summary
    // that may have nothing to do with the story: "USA" under a Reform UK story, "Israel" under a studio merger)
    if (fq && !briefSubjects(brief).length && !out.some((c) => c.how === 'category')) {
      try {
        const files = await this.commons.search(fq.q, { limit: 12 });
        files.forEach((f, i) => out.push({ file: f, how: 'place', rank: i, subject: { name: fq.place, kind: 'place', role: 'place' }, entity: null, person: false }));
      } catch (err) {
        this.warn(`commons place: ${err.message}`);
      }
    }
    // phase 2 (FOTOS_LIBRES §3.3): NASA's library for science and space, stock for what nothing above covers
    const tone = brief?.tone || (isGrave(`${story.title || ''} ${story.summary || ''}`) ? 'grave' : 'neutral');
    const things = briefSubjects(brief).filter((s) => s.kind !== 'person' && s.kind !== 'event');
    // (space stories only: a science section story about zoo lions once brought an artist's view of Titan)
    if (this.nasa?.enabled && SPACE.test(`${story.title} ${things.map((s) => s.name).join(' ')}`)) {
      const q = things.slice(0, 2).map((s) => s.name).join(' ') || keywords(story.title, 3).join(' ');
      try {
        const files = await this.nasa.search(q);
        files.forEach((f, i) => out.push({ file: f, how: 'nasa', rank: i, query: q, subject: things[0] || { name: q, kind: 'other', role: 'main' }, entity: null, person: false }));
      } catch (err) {
        this.warn(`nasa: ${err.message}`);
      }
    }
    // stock only from the brief's GENERIC query ("stock", never names: round 5 showed what "show" brings, the
    // Budapest parliament under Guernsey's budget), never under a grave story (a generic hospital under a shooting
    // says it happened there) and never for a story about one product (another laptop under "Surface laptop")
    const product = briefSubjects(brief).some((s) => s.role === 'main' && s.kind === 'product');
    if (this.stock?.enabled && tone !== 'grave' && brief?.stock && !product) {
      const q = brief.stock;
      try {
        const files = await this.stock.search(q);
        files.forEach((f, i) => out.push({ file: f, how: 'stock', rank: i, query: q, subject: { name: q, kind: 'other', role: 'main' }, entity: null, person: false }));
      } catch (err) {
        this.warn(`stock: ${err.message}`);
      }
    }
    return out;
  }

  /** Why a candidate may not air (null: it may). The gates never look at how good it is, only whether it is allowed. */
  reject(c, story, { tone = 'neutral', never = [] } = {}) {
    const grave = tone === 'grave';
    const f = c.file;
    if (!f?.url || !/^https:\/\//i.test(f.url)) return 'no https url';
    if (f.mime && !MIMES.test(f.mime)) return `mime ${f.mime}`;
    if (!allowedFor(f.licence?.id, this.profile)) return `licence ${f.licence?.label || f.licenceName || 'unknown'}`;
    const prov = provenance(f, { now: this.now() });
    if (!prov.ok) return `provenance: ${prov.reasons.join('; ')}`;
    if (prov.flags.includes('trademark')) return 'trademark';
    // a watermark is someone else's mark on our screen (FOTOS_LIBRES §3.4); Commons tags them
    if ((f.categories || []).some((cat) => /\bwatermark/i.test(cat))) return 'watermark';
    if (prov.flags.includes('personality rights') && !c.person) return 'identifiable people';
    if ((f.fullWidth || f.width) < MIN_WIDTH) return `small ${f.fullWidth || f.width}px`;
    const a = f.width / f.height;
    const [lo, hi] = c.person ? PORTRAIT : LANDSCAPE;
    if (!(a >= lo && a <= hi)) return `shape ${a.toFixed(2)}`;
    const text = `${f.title} ${f.description}`;
    const artwork = c.subject?.kind === 'artwork';
    // a map, a logo, a diagram is not a photograph (an abstract subject's own P18 often is one); only an artwork
    // story shows the work itself
    if (NOT_A_PHOTO.test(text) && !artwork) return 'not a photograph';
    if (UNREADABLE.test(text)) return 'unreadable when pixelated';
    if (EVENT_WORDS.test(text)) return 'shows an event';
    if (WAR.test(text)) return 'war or damage';
    const year = yearOf(f.date) || yearOf(f.title);
    if (year && year < OLDEST_YEAR && !artwork) return `archive picture (${year})`;
    if (/\barchives?\b/i.test(`${f.author} ${f.credit}`) && !artwork) return 'archive picture';
    if (c.how === 'stock' || c.how === 'nasa') {
      const tagged = `${text} ${f.tags || ''}`;
      if (PEOPLE.test(tagged)) return 'people in a searched picture';
      if (c.how === 'stock' && grave) return 'stock under a grave story';
      // the query's own words must be what the picture is tagged with: every word for stock (its tags are loose:
      // "pebble" brought stacked stones), two for NASA's described records
      const q = words(c.query).map(stem);
      if (c.how === 'stock') {
        // stock is tagged by phrases ("sea lion, feeding"): a query word counts only in a tag where nothing outside
        // the query modifies it ("lion" in "sea lion" is another animal; "track" in "track and field" is fine)
        const qs = new Set(q);
        const phrases = String(f.tags || '').split(',').map((t) => words(t).map(stem)).filter((p) => p.length);
        const counts = (w) => phrases.some((p) => p.includes(w) && (p[p.length - 1] !== w || p.slice(0, -1).every((x) => qs.has(x))));
        const hits = q.filter(counts).length;
        if (hits < q.length) return `off the query (${hits}/${q.length})`;
        // a "generic" picture tagged with a place is that place (a Warsaw ministry under a NASA story)
        const place = phrases.map((p) => p.join(' ')).find((t) => lookupPlace(t));
        if (place) return `stock of a named place (${place})`;
      } else {
        const have = new Set(words(tagged).map(stem));
        const hits = q.filter((w) => have.has(w)).length;
        if (hits < Math.min(2, q.length)) return `off the query (${hits}/${q.length})`;
      }
    } else if (c.how !== 'p18') {
      // a searched PNG is a screenshot or a graphic far more often than a photograph ("Chrome web store stats")
      if (!/^image\/jpeg$/i.test(f.mime || '')) return `searched ${f.mime || 'file'} is not a photograph`;
      if (PEOPLE.test(text)) return 'people in a searched picture';
      if (CRAFT.test(text)) return 'a craft, not a view';
      // the evidence that it is a view must not be the place's own name ("Gaza CITY" said nothing about a file
      // called 5M0A8322-01 that showed a sunset)
      const own = new RegExp(`\\b(${[c.entity?.label, c.subject?.name].filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^'})\\b`, 'gi');
      if (!VIEW.test(text.replace(own, ' '))) return 'not a view';
      // an organisation is shown by its buildings, never by whatever else its category holds (a chart, a product)
      if ((c.subject?.kind || kindOf(c.entity)) === 'organisation' && !ORG_BUILDING.test(text)) return "not the organisation's building";
    }
    if (grave && PRETTY.test(text)) return 'a pretty view under a grave story';
    if (tone !== 'light' && FESTIVE.test(text)) return `festive under a ${tone} story`;
    // a grave story in a country or a region: a pretty landscape of it says nothing and sets the wrong tone (a
    // lake under an execution story, 7 Oct); the map carries it. A city's view or the story's own subject may stay.
    if (grave && c.subject?.role === 'place' && !['city', 'structure'].includes(c.subject.kind || kindOf(c.entity))) return 'landscape under a grave story';
    // a space story: a generic concept's picture is taken on Earth (a desert yardang under "Curiosity's wind-carved
    // cliffs" passes for Mars, round 6); only pictures that say they show space
    if (SPACE.test(story.title || '') && c.how === 'p18' && ['phenomenon', 'species', 'other', 'product'].includes(c.subject?.kind) && !SPACE.test(`${text} ${c.entity?.description || ''}`)) return 'an earthly picture under a space story';
    for (const n of never) if (n && words(n).length && words(n).every((w) => words(text).includes(w))) return `brief says never: ${n}`;
    return null;
  }

  /** Higher is better: what the picture is of, how sure we are of its provenance, how it will look. */
  score(c) {
    const f = c.file;
    // what the picture is OF ranks it: the entity's own picture, then its category, NASA's record of the thing, the
    // place, and last a stock scene (true to the story's subject matter, but not of the story)
    const base = { category: [3, 0.2], nasa: [3, 0.2], place: [2, 0.15], stock: [1.5, 0.1] }[c.how] || [2, 0.15];
    let s = c.how === 'p18' ? (c.subject.role === 'main' ? 6 : 4) : base[0] - Math.min(base[0] - 0.5, (c.rank || 0) * base[1]);
    const prov = provenance(f, { now: this.now() });
    s += prov.trust * 0.7;
    const label = c.entity?.label || c.subject?.name || '';
    if (label && words(label).every((w) => words(`${f.title} ${f.description}`).includes(w))) s += 1;
    if ((f.fullWidth || f.width) >= 1280) s += 0.5;
    // a portrait from years ago is not how the person looks now (FOTOS_LIBRES §3.6)
    if (c.person) {
      const y = yearOf(f.date) || yearOf(f.title);
      const age = y ? new Date(this.now()).getFullYear() - y : null;
      if (age === null) s -= 1;
      else if (age > 6) s -= Math.min(4, (age - 6) * 0.5);
    }
    return s;
  }

  /** The picture for a story (see the top of the file), or null. */
  async find(story, { brief = null, avoid = null } = {}) {
    const tone = brief?.tone || (isGrave(`${story.title || ''} ${story.summary || ''}`) ? 'grave' : 'neutral');
    const never = Array.isArray(brief?.never) ? brief.never.map((n) => String(n).slice(0, 80)) : [];
    const all = await this.candidates(story, brief);
    const ok = [];
    const rejected = [];
    for (const c of all) {
      const why = this.reject(c, story, { tone, never });
      if (why) rejected.push({ file: c.file?.name, how: c.how, why });
      // a file another story of the same programme already shows: only when nothing else is left (one portrait
      // of the same man on four stories in a row reads as a mistake)
      else ok.push({ ...c, score: this.score(c) - (avoid?.has?.(c.file.name) ? 20 : 0) });
    }
    ok.sort((a, b) => b.score - a.score);
    const best = ok[0];
    this.lastRun = { story: story.id, candidates: all.length, rejected, ranked: ok.map((c) => ({ file: c.file.name, how: c.how, score: +c.score.toFixed(2) })) };
    if (!best) return null;
    return this.picture(best);
  }

  picture(c) {
    const f = c.file;
    const lic = f.licence;
    return {
      url: f.url,
      width: f.width,
      height: f.height,
      focusY: c.person ? PORTRAIT_FOCUS : null,
      credit: fileCredit(f.author || f.credit, lic.label),
      license: lic.label,
      page: f.page,
      title: f.title,
      via: `free:${c.how}`,
      kind: 'file',
      record: {
        file: f.name,
        title: f.title,
        author: f.author || null,
        licence: lic,
        licenceUrl: f.licenceUrl || null,
        source: f.source || 'Wikimedia Commons',
        page: f.page,
        qid: c.entity?.qid || null,
        entity: c.entity?.label || null,
        subject: c.subject?.name || null,
        flags: provenance(f, { now: this.now() }).flags,
        found: new Date(this.now()).toISOString(),
      },
    };
  }
}

/** The kind of a Wikidata entity the brief did not name, from its P31 classes and description. */
function kindOf(entity) {
  const d = String(entity?.description || '');
  if (entity?.classes?.includes('Q5')) return 'person';
  if (/\b(country|sovereign state)\b/i.test(d)) return 'country';
  if (/\b(city|town|capital|municipality|commune|metropolis)\b/i.test(d)) return 'city';
  if (/\b(company|corporation|organi[sz]ation|agency|bank|institution|university|party|court)\b/i.test(d)) return 'organisation';
  if (/\b(bridge|canal|building|tower|dam|station|airport|port|stadium|cathedral|museum|palace|monument|plant|observatory|telescope)\b/i.test(d)) return 'structure';
  if (/\b(region|province|state|island|county|district|peninsula|territory)\b/i.test(d)) return 'place';
  return null;
}
