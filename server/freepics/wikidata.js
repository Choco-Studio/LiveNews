// Entities for the free-picture desk (docs/roadmap/FOTOS_LIBRES.md §3.2): a name the story uses ("Pedro Sánchez",
// "Lisbon", "Boots") → the ONE Wikidata item it means, with what a picture search needs: its canonical picture
// (P18), its Commons category (P373), its coordinates (P625), its logo (P154), its kind (P31) and dates.
//
// It never guesses: a name with no clear winner (a painter and a prime minister both called "Pedro Sánchez", and
// the story gives no hint) resolves to nothing. The winner must be the best on the evidence (search rank, the
// story's own words in the item's description, the expected kind, how known the item is) by a margin.
//
//   new Wikidata({ fetchImpl, cache, now }).resolve(name, { kind, context }) -> entity | null
//   entity: { qid, label, description, kind, image, commonsCategory, coords: {lat, lon}, logo, born, died, sitelinks }
//   pickEntity(candidates, { kind, context, hint, name, requireContext }) -> { best, score, runnerUp } (pure)

const API = 'https://www.wikidata.org/w/api.php';
export const USER_AGENT = 'GLOBIT24-LiveNews/1.0 (free-picture desk; https://github.com/Choco-Studio/LiveNews)';

// P31 classes per kind the story brief names (the common ones; the description is the fallback)
const KIND_CLASSES = {
  person: ['Q5'],
  country: ['Q6256', 'Q3624078', 'Q7275'],
  city: ['Q515', 'Q1549591', 'Q1637706', 'Q5119', 'Q200250', 'Q3957', 'Q532', 'Q15284'],
  organisation: ['Q43229', 'Q4830453', 'Q891723', 'Q783794', 'Q6881511', 'Q327333', 'Q2659904', 'Q484652', 'Q507619', 'Q431289', 'Q1058914', 'Q7210356'],
};
// words a short description uses for each kind ("city in Portugal", "Spanish politician", "canal in Panama")
const KIND_WORDS = {
  person: /\b(politician|president|prime minister|minister|businessman|businesswoman|actor|actress|singer|player|footballer|journalist|scientist|economist|writer|chief executive|ceo|monarch|king|queen|pope|leader|judge|lawyer|activist|astronaut|athlete|born \d{4}|\(born)\b/i,
  country: /\b(country|sovereign state|state in|republic|kingdom)\b/i,
  city: /\b(city|town|capital|municipality|commune|village|metropolis|borough)\b/i,
  place: /\b(city|town|capital|region|province|state|island|county|district|municipality|area|peninsula)\b/i,
  organisation: /\b(company|corporation|business|organi[sz]ation|agency|bank|retailer|manufacturer|airline|broadcaster|newspaper|university|party|union|institution|foundation|regulator|ministry|department|chain|shop|store|stores|group|conglomerate|firm|brand|publisher|studio|club|team|league|federation|startup|start-up|network|operator|developer|maker)\b/i,
  structure: /\b(canal|bridge|building|tower|dam|station|airport|port|stadium|cathedral|church|museum|palace|monument|tunnel|railway|line|power station|plant|observatory|telescope|castle)\b/i,
  product: /\b(software|smartphone|model|vehicle|aircraft|car|video game|operating system|chatbot|device|product|series|brand)\b/i,
};
// never what a news name means, whatever the search says
const NOT_NEWS = /\b(scholarly article|scientific article|wikimedia (disambiguation|category|list|template)|family name|given name|surname|male given name|female given name|researcher|asteroid|genus|species of|protein|gene\b)/i;

// words that confirm nothing ("musician WHO plays the trumpet" under a story that also says "who")
const STOP = new Set(
  (
    'the a an of in on at to for and or is are was were be been being by with from as its it this that these those after before over into ' +
    'new says said say who whom whose which what when where why how has have had not no nor but all any can will would could should may ' +
    'might must also more most less than then there their they them she he his her him our we you your one two three about out up off ' +
    'does did do so such very just only other others some many much own same both each few known used part since until while during ' +
    'between among under above against within without per via its one first last year years day days time people'
  ).split(' '),
);
/** Does an item's label (or the alias the search matched) carry the searched name as whole words? */
export const namesMatch = (name, label) => {
  const n = words(name);
  const l = new Set(words(label));
  return n.length > 0 && n.every((w) => l.has(w));
};
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));

/**
 * Choose the item a name means. candidates: [{ qid, label, description, rank, classes: [Q…], sitelinks }].
 * Returns { best, score, runnerUp }; best is null when nothing is good enough or the top two are too close.
 */
export function pickEntity(candidates, { kind = null, context = '', hint = '', requireContext = false, name = '', year: thisYear = new Date().getFullYear() } = {}) {
  const ctx = new Set(words(context));
  const hintWords = new Set(words(hint));
  const scored = [];
  for (const c of candidates || []) {
    const desc = String(c.description || '');
    if (NOT_NEWS.test(desc)) continue;
    // the expected kind, by class or by description. For the kinds a wrong pick hurts most (a person, an
    // organisation, a country, a city), a candidate of another kind is out, not merely behind (calibration on
    // live Wikidata: "Mistral" → an assault ship, "Meloni" → a 15th-century painter)
    let kindOk = true;
    if (kind) {
      const byClass = (KIND_CLASSES[kind] || []).some((q) => c.classes?.includes(q));
      const byWords = KIND_WORDS[kind]?.test(desc);
      kindOk = byClass || byWords;
      if (!kindOk && ['person', 'organisation', 'country', 'city'].includes(kind)) continue;
      if (kind === 'person' && c.classes?.length && !c.classes.includes('Q5')) continue;
    }
    // a person who died years ago is not who a news story is about, unless the story is about the death or a
    // centenary (then the brief says so in its hint)
    if (kind === 'person' && c.died && c.died < thisYear - 1 && !/\b(died|death|dies|obituary|anniversary|centenary|born)\b/i.test(`${context} ${hint}`)) continue;
    let s = 0;
    // search rank: Wikidata already orders by match quality and popularity
    s += Math.max(0, 3 - c.rank) * 0.4;
    // the story's own words in the item's description ("Prime Minister of Spain" under a story on Spain); the
    // brief's hint ("Italian prime minister") counts double
    // the name's own words prove nothing ("Mistral" is in the assault ship's description too)
    const own = new Set(words(name));
    const dw = words(desc).filter((w) => !own.has(w));
    const hits = dw.filter((w) => ctx.has(w)).length + 2 * dw.filter((w) => hintWords.has(w)).length;
    // a name read off a headline with no brief behind it (no kind, no hint), or a face: the item must be confirmed
    // by the story's own words or the brief's hint, or it is a namesake we would be guessing at
    if ((requireContext || kind === 'person') && !hits) continue;
    s += Math.min(4, hits) * 1.5;
    if (kind) s += kindOk ? 2 : -1;
    // how known: a news name is usually the item with many Wikipedias, not the namesake with one
    s += Math.min(2, Math.log10(1 + (c.sitelinks || 0)));
    scored.push({ ...c, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top || top.score < 2.5) return { best: null, score: top?.score ?? 0, runnerUp: second || null };
  // a namesake close behind and nothing in the story to tell them apart: do not guess
  if (second && top.score - second.score < 1) return { best: null, score: top.score, runnerUp: second };
  return { best: top, score: top.score, runnerUp: second || null };
}

const claimValue = (claims, p) => claims?.[p]?.find((c) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value ?? null;
const claimIds = (claims, p) => (claims?.[p] || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const year = (v) => (v?.time ? Number(/^[+-]?(\d{1,4})/.exec(v.time.replace(/^\+/, ''))?.[1]) || null : null);

/** A wbgetentities item → the entity the desk keeps. */
export function entityOf(item, kind = null) {
  const claims = item?.claims || {};
  const coords = claimValue(claims, 'P625');
  return {
    qid: item.id,
    label: item.labels?.en?.value || null,
    description: item.descriptions?.en?.value || null,
    kind,
    classes: claimIds(claims, 'P31'),
    image: claimValue(claims, 'P18'),
    commonsCategory: claimValue(claims, 'P373'),
    coords: coords && Number.isFinite(coords.latitude) ? { lat: coords.latitude, lon: coords.longitude } : null,
    logo: claimValue(claims, 'P154'),
    born: year(claimValue(claims, 'P569')),
    died: year(claimValue(claims, 'P570')),
    sitelinks: Object.keys(item?.sitelinks || {}).length,
  };
}

export class Wikidata {
  constructor({ fetchImpl = fetch, cache = new Map(), now = () => Date.now(), ttlMs = 30 * 86400_000, timeoutMs = 12000, retries = 1, retryMs = 1500 } = {}) {
    this.retries = retries;
    this.retryMs = retryMs;
    this.fetch = fetchImpl;
    this.cache = cache; // key → { at, value } (a Map, or anything with get/set: the desk persists it)
    this.now = now;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
  }

  /** One API call; a timeout, a 429 or a 5xx is tried once more after a pause (a hiccup cost "Ukraine", "Canada"
   * and "China" their pictures in bench round 8). A 4xx is final. */
  async api(params) {
    const u = new URL(API);
    for (const [k, v] of Object.entries({ format: 'json', ...params })) u.searchParams.set(k, v);
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
      try {
        const res = await this.fetch(u.toString(), { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: ctl.signal });
        if (!res.ok) {
          const err = new Error(`Wikidata HTTP ${res.status}`);
          err.retry = res.status === 429 || res.status >= 500;
          throw err;
        }
        return await res.json();
      } catch (err) {
        const transient = err.retry || err.name === 'AbortError' || /aborted|fetch failed|ECONNRESET|ETIMEDOUT/i.test(err.message);
        if (!transient || attempt >= this.retries) throw err;
        await new Promise((r) => setTimeout(r, this.retryMs));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /** The item a story's name means, or null (see pickEntity). Cached by name + kind + the context's words. */
  async resolve(name, { kind = null, context = '', hint = '', requireContext = false } = {}) {
    const q = String(name ?? '').trim();
    if (!q) return null;
    const key = `${q.toLowerCase()}|${kind || ''}|${requireContext ? 'ctx' : ''}|${words(hint).join(' ')}|${words(context).sort().slice(0, 12).join(' ')}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const search = await this.api({ action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', type: 'item', limit: '7' });
    // the search matches prefixes ("Trump" → "trumpeter"): only items whose label or matched alias carries the name
    const found = (search?.search || [])
      .map((e, rank) => ({ qid: e.id, label: e.label, description: e.description || '', rank, alias: e.match?.type === 'alias' ? e.match.text : null }))
      .filter((e) => namesMatch(q, e.label) || namesMatch(q, e.alias));
    let value = null;
    if (found.length) {
      const got = await this.api({ action: 'wbgetentities', ids: found.map((f) => f.qid).join('|'), props: 'claims|labels|descriptions|sitelinks', languages: 'en' });
      const items = got?.entities || {};
      const candidates = found.map((f) => {
        const it = items[f.qid];
        return { ...f, description: it?.descriptions?.en?.value || f.description, classes: claimIds(it?.claims, 'P31'), sitelinks: Object.keys(it?.sitelinks || {}).length, died: year(claimValue(it?.claims, 'P570')) };
      });
      const { best } = pickEntity(candidates, { kind, context, hint, requireContext, name: q, year: new Date(this.now()).getFullYear() });
      if (best) value = entityOf(items[best.qid], kind);
    }
    this.cache.set(key, { at: this.now(), value });
    return value;
  }
}
