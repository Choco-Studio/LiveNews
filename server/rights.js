// The picture rights desk: every picture the channel may put on air carries a rights record, and by default only a
// CLEARED picture airs (docs/pictures/RIGHTS.md). Owner, 17 Oct: "on air only REAL photos, never drawn ones" (22:40),
// "no sanction risk and no loss of quality", and "El pixelado de las fotos no lo quites": every picture is pixelated,
// always, so a picture is cleared only under terms that allow adaptation (pixelation is a modification), commercial
// use (the channel will be monetised) and editorial broadcast and online video.
//
//   LICENCES                      the terms the desk knows, by id (SPDX where one exists, else a named set of terms)
//   licenceOf(text, url)          a Commons licence name or code ("CC BY-SA 4.0", "cc-by-sa-4.0", "Public domain") -> id
//   rightsRecord({...})           the record: source, licence, author, original page, attribution, uses, checked, cleared
//   onAirCredit(record)           what the screen says while the picture is on: "FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED"
//   attributionText(record)       the full attribution (title, author, source, licence, the modification) for a description
//   outletRecord(story)           an outlet's or an agency's own photo: never cleared
//   airable(story, { mode })      may this story's picture air: its record is for the picture it carries and is cleared
//                                 (mode 'preview' also lets an outlet photo through, for a private preview only)
//
// This is not legal advice: the terms below were read on 17 Oct 2026 and summarised; docs/pictures/RIGHTS.md lists
// what a lawyer should still confirm (ShareAlike inside a video, personality rights, freedom of panorama...).

export const CHANNEL = 'GLOBIT 24';
// The words the screen and the description use for the channel's pixel treatment of a picture.
export const MODIFIED_WORD = 'pixelated';

const cc = (code, version) => `https://creativecommons.org/licenses/${code}/${version}/`;

/**
 * Each licence: its on-air short form, where its text is, and what it lets the channel do.
 *   attribution     the author (or the source) must be credited
 *   noticeLicence   the licence must be named (and linked where practicable)
 *   noticeChange    a modification must be indicated (CC 4.0: "indicate if You modified"; CC 2.0-3.0 ask a credit
 *                   identifying the use in an adaptation: the channel says "pixelated" for every CC licence)
 *   shareAlike      an adaptation must be offered under the same licence (BY-SA: see RIGHTS.md and the lawyer's list)
 *   commercial / derivative / editorial   allowed uses (the channel needs all three: monetised, pixelated, news)
 */
const BY = (version, { igo = false } = {}) => ({
  name: `Creative Commons Attribution ${version}${igo ? ' IGO' : ''}`,
  short: `CC BY ${version}${igo ? ' IGO' : ''}`,
  url: igo ? 'https://creativecommons.org/licenses/by/3.0/igo/' : cc('by', version),
  attribution: true, noticeLicence: true, noticeChange: true, shareAlike: false, commercial: true, derivative: true, editorial: true,
});
const BYSA = (version, { igo = false } = {}) => ({
  ...BY(version, { igo }),
  name: `Creative Commons Attribution-ShareAlike ${version}${igo ? ' IGO' : ''}`,
  short: `CC BY-SA ${version}${igo ? ' IGO' : ''}`,
  url: igo ? 'https://creativecommons.org/licenses/by-sa/3.0/igo/' : cc('by-sa', version),
  shareAlike: true,
});
const NOT = (name, why, extra = {}) => ({ name, short: name, url: null, attribution: true, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: false, derivative: false, editorial: false, why, ...extra });

export const LICENCES = {
  'CC0-1.0': { name: 'Creative Commons Zero 1.0 (public domain dedication)', short: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true },
  PD: { name: 'Public domain', short: 'PD', url: 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags/Public_domain', attribution: false, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true },
  // a work of the US federal government (NOAA, the White House, the armed forces...): no copyright in the US
  'PD-USGov': { name: 'Public domain (work of the US federal government)', short: 'PD', url: 'https://commons.wikimedia.org/wiki/Template:PD-USGov', attribution: false, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true },
  // NASA's media usage guidelines (read 17 Oct 2026, nasa.gov/nasa-brand-center/images-and-media): "generally not
  // subject to copyright in the United States", news outlets may use it without permission, "NASA should be
  // acknowledged as the source", never implying endorsement; third-party material is marked with its holder's name
  'NASA-MUG': { name: 'NASA media usage guidelines (public domain in the US)', short: 'NASA', url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', attribution: true, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true, endorsement: false },
  'CC-BY-1.0': BY('1.0'), 'CC-BY-2.0': BY('2.0'), 'CC-BY-2.5': BY('2.5'), 'CC-BY-3.0': BY('3.0'), 'CC-BY-4.0': BY('4.0'),
  'CC-BY-3.0-IGO': BY('3.0', { igo: true }),
  'CC-BY-SA-1.0': BYSA('1.0'), 'CC-BY-SA-2.0': BYSA('2.0'), 'CC-BY-SA-2.5': BYSA('2.5'), 'CC-BY-SA-3.0': BYSA('3.0'), 'CC-BY-SA-4.0': BYSA('4.0'),
  // ESA's open images (esa.int terms, read 17 Oct 2026: "Some images ... are licensed under CC BY-SA 3.0 IGO")
  'CC-BY-SA-3.0-IGO': BYSA('3.0', { igo: true }),
  // the UK's Open Government Licence (nationalarchives.gov.uk, read 17 Oct 2026): copy, adapt, exploit commercially;
  // acknowledge the source with the provider's statement or the standard one; it does not cover personal data
  'OGL-UK-1.0': { name: 'Open Government Licence v1.0', short: 'OGL v1', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/1/', attribution: true, noticeLicence: true, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true, statement: 'Contains public sector information licensed under the Open Government Licence v1.0.' },
  'OGL-UK-2.0': { name: 'Open Government Licence v2.0', short: 'OGL v2', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/', attribution: true, noticeLicence: true, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true, statement: 'Contains public sector information licensed under the Open Government Licence v2.0.' },
  'OGL-UK-3.0': { name: 'Open Government Licence v3.0', short: 'OGL v3', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: true, noticeLicence: true, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true, statement: 'Contains public sector information licensed under the Open Government Licence v3.0.' },
  // the Free Art License 1.3 (artlibre.org, read 17 Oct 2026): copy, distribute and modify, commercial use allowed;
  // "indicate that the work has been modified", name the authors, say where the licence and the originals are; a
  // modified work under the same or a compatible licence (CC BY-SA 4.0 is one); "Incorporating this work into a larger
  // work that is not subject to the Free Art License shall not challenge the rights granted by this license"
  'FAL-1.3': { name: 'Free Art License 1.3', short: 'FAL 1.3', url: 'https://artlibre.org/licence/lal/en/', attribution: true, noticeLicence: true, noticeChange: true, shareAlike: true, commercial: true, derivative: true, editorial: true },
  // a picture of the operator's own LOCAL feed (the offline demo's fixtures, or the operator's own photos): the
  // operator vouches for it; it is never looked for on the web
  OPERATOR: { name: "The operator's own picture (a local feed)", short: 'OWN', url: null, attribution: false, noticeLicence: false, noticeChange: false, shareAlike: false, commercial: true, derivative: true, editorial: true },
  // known and NOT cleared (the reason is what the record says)
  'CC-BY-NC': NOT('CC BY-NC', 'NonCommercial: the channel will be monetised', { derivative: true, editorial: true }),
  'CC-BY-NC-SA': NOT('CC BY-NC-SA', 'NonCommercial: the channel will be monetised', { derivative: true, editorial: true }),
  'CC-BY-ND': NOT('CC BY-ND', 'NoDerivatives: every picture is pixelated', { commercial: true, editorial: true }),
  'CC-BY-NC-ND': NOT('CC BY-NC-ND', 'NoDerivatives and NonCommercial', { editorial: true }),
  'GFDL': NOT('GFDL', 'GFDL only: the whole licence text must travel with the picture, impossible on air', { derivative: true, commercial: true, editorial: true }),
  // ESA's standard terms: editorial use in news programmes allowed free, but "shall not be used for a commercial
  // purpose" (entertainment, advertising...): a monetised channel needs a lawyer's reading first
  'ESA-STD': NOT('ESA terms', 'ESA standard terms: no commercial purpose (a monetised channel needs a lawyer first)', { editorial: true, derivative: true }),
  // UN Photo usage guidelines (media.un.org/photo/en/guidelines, read 17 Oct 2026): "UN photos cannot be altered ...
  // or used to create derivative works", prior written permission, US$70 a photo for film or video
  'UN-PHOTO': NOT('UN Photo', 'UN Photo: no alteration or derivative works, written permission and a fee per photo', { editorial: true }),
  OUTLET: NOT('All rights reserved', "the outlet's or an agency's photo: no licence to broadcast or pixelate it", { editorial: false }),
};

const LICENCE_IDS = new Set(Object.keys(LICENCES));

/**
 * The licence id of a Commons licence code or name ("cc-by-sa-4.0", "CC BY-SA 4.0", "CC BY 3.0 de", "CC0",
 * "Public domain", "OGL 3", "CC BY-SA 3.0 igo"), with its URL as a second opinion; null when not one the desk knows.
 */
export function licenceOf(text, url = '') {
  const s = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const u = String(url ?? '').toLowerCase();
  if (!s && !u) return null;
  if (/\bgfdl\b|gnu free documentation/.test(s) && !/\bcc[ -]/.test(s)) return 'GFDL';
  if (/^cc0\b|creative commons zero|publicdomain\/zero/.test(s) || /publicdomain\/zero/.test(u)) return 'CC0-1.0';
  // NC and ND before BY: "CC BY-NC-SA 2.0" must never read as BY-SA
  const ccm = /\bcc[ -]?(by(?:[ -](?:nc|nd|sa))*)(?:[ -]+(\d\.\d))?(?:[ -]+([a-z]{2,3}))?/.exec(s) || /licenses\/(by(?:-(?:nc|nd|sa))*)\/(\d\.\d)(?:\/([a-z]{2,3}))?/.exec(u);
  if (ccm) {
    const parts = ccm[1].replace(/ /g, '-').split('-');
    const nc = parts.includes('nc');
    const nd = parts.includes('nd');
    const sa = parts.includes('sa');
    if (nc && nd) return 'CC-BY-NC-ND';
    if (nd) return 'CC-BY-ND';
    if (nc) return sa ? 'CC-BY-NC-SA' : 'CC-BY-NC';
    const version = ccm[2] || (/\/(\d\.\d)\//.exec(u) || [])[1] || null;
    if (!version) return null; // a CC licence with no version cannot be quoted correctly
    const igo = ccm[3] === 'igo' || /\/igo\b/.test(u);
    const id = `CC-BY${sa ? '-SA' : ''}-${version}${igo ? '-IGO' : ''}`;
    // a ported licence ("CC BY-SA 3.0 de") has the same terms as its unported version for what the channel does
    return LICENCE_IDS.has(id) ? id : null;
  }
  if (/^fal\b|free art licen[cs]e|licence art libre|artlibre\.org/.test(s) || /artlibre\.org/.test(u)) return 'FAL-1.3';
  if (/\bogl\b|open government licen[cs]e/.test(s) || /open-government-licence/.test(u)) {
    const v = /(?:v(?:ersion)?\s*|\s)([123])(?:\.0)?\b/.exec(s) || /version\/([123])/.exec(u);
    return v ? `OGL-UK-${v[1]}.0` : null;
  }
  if (/^pd-usgov|\bus ?gov|united states government|work of the (?:us|united states) federal/.test(s)) return 'PD-USGov';
  if (/^(?:public domain|pd\b|pd-|no restrictions\b)/.test(s) || /publicdomain\/mark/.test(u)) return 'PD';
  return null;
}

const DOMAINLESS = (t) => !/https?:|www\.|\.(?:com|org|net|gov|int|edu)\b/i.test(t);
/** An author as it may be credited: markup, "(talk)", "Own work" and URLs gone; null when nothing is left. */
export function cleanAuthor(raw) {
  let t = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/\s*\((?:talk|contribs?|discussion|page does not exist)\)\s*/gi, ' ').replace(/^(?:photo(?:graph)?|image|author|credit)s?\s*(?:by)?\s*[:/-]\s*/i, '').trim();
  // "Prime Minister ' s Office" (markup around an apostrophe)
  t = t.replace(/\s*(['’])\s*s\b/g, '$1s');
  // a derivative work names both: "VW_Werk.jpg : Richard Bartz derivative work: Diliff" -> "Richard Bartz / Diliff"
  t = t.replace(/\bUser:\s*/gi, '');
  const derived = /^(?:\S+\.(?:jpe?g|png|tiff?|gif|webp|svg)\s*:\s*)?(.+?)\s*derivative work\s*:\s*(.+)$/i.exec(t);
  if (derived) t = `${derived[1]} / ${derived[2]}`;
  // "The original uploader was Blofeld of SPECTRE at English Wikipedia. (Original text...)" and "Coolcaesar at English
  // Wikipedia": the user, and where they uploaded it
  // "This image or media was taken or created by Matt H. Wade . To see his entire portfolio, click here ...": the name
  t = t.replace(/^this (?:image|photo(?:graph)?|picture|file)(?: or media)? (?:was|is) (?:taken|created|made|shot)(?: or created)? by\s+/i, '');
  t = t.split(/\s+\.\s+/)[0];
  t = t.replace(/^the original uploader was\s+/i, '').replace(/\s+at\s+([\p{L} ]{2,20}?)\s+wikipedia\b.*$/iu, ' ($1 Wikipedia)').trim();
  if (/^(?:own work|unknown(?: author)?|anonymous|see (?:below|source)|not provided|author)$/i.test(t)) return null;
  t = t.split(/\s*[;|]\s*|\s+-\s+/)[0].trim();
  if (!t || !DOMAINLESS(t) || !/\p{L}/u.test(t)) return null;
  return t.length > 80 ? t.slice(0, 80).replace(/\s+\S*$/, '') : t;
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * The rights record of a picture.
 *   source   'wikimedia-commons' | 'nasa' | 'outlet'      via  how it was found ('wikidata:P18', 'commons:search', ...)
 *   licence  a LICENCES id (null: unknown, never cleared)  author, title, page (the original's page), url (served)
 *   restrictions  non-copyright warnings the source gives ('personality', 'trademarked', 'insignia'...)
 *   ai       true when the source marks the picture as made by a generator (never a real photo: never cleared)
 *   label    'FILE' unless the picture is of the event itself
 *   year     the year a FILE picture of an earlier event was taken (its tag then says "FILE 2023")
 */
export function rightsRecord({ source, via = null, licence = null, author = null, title = null, page = null, url = null, restrictions = [], ai = false, label = 'FILE', year = null, subject = null, checkedAt = Date.now(), outlet = null, localOk = false } = {}) {
  const terms = licence ? LICENCES[licence] : null;
  const who = cleanAuthor(author);
  const uses = terms
    ? { editorial: !!terms.editorial, commercial: !!terms.commercial, derivative: !!terms.derivative, pixelation: !!terms.derivative }
    : { editorial: false, commercial: false, derivative: false, pixelation: false };
  let why = null;
  if (!terms) why = 'licence unknown';
  else if (terms.why) why = terms.why;
  else if (!uses.derivative) why = 'no adaptation allowed: every picture is pixelated';
  else if (!uses.commercial) why = 'no commercial use: the channel will be monetised';
  else if (!uses.editorial) why = 'no editorial use';
  else if (ai) why = 'made by an image generator: only real photographs air';
  else if (terms.attribution && !who && !(source === 'nasa')) why = 'no author or source to credit';
  else if (terms.attribution && source !== 'nasa' && source !== 'outlet' && !authorOnScreen(who)) why = "the author's name cannot be written in the on-screen credit";
  else if (!url || !(/^https:\/\//i.test(url) || (localOk && /^file:/i.test(url)))) why = 'no picture URL';
  const record = {
    v: 1,
    source,
    ...(via ? { via } : {}),
    ...(subject ? { subject } : {}),
    licence: terms ? { id: licence, name: terms.name, url: terms.url } : { id: licence || null, name: licence || 'unknown', url: null },
    author: who,
    title: title ? String(title).slice(0, 200) : null,
    page: page || null,
    url: url || null,
    uses,
    restrictions: [...new Set(restrictions)].filter(Boolean),
    label: label === 'EVENT' ? 'EVENT' : 'FILE',
    // (a FILE picture of an earlier event says the year it was taken: "FILE 2023")
    ...(label !== 'EVENT' && Number.isInteger(year) && year >= 1900 && year <= 2100 ? { year } : {}),
    checkedAt: iso(checkedAt),
    cleared: !why,
    ...(why ? { why } : {}),
    ...(outlet ? { outlet } : {}),
  };
  record.credit = onAirCredit(record);
  record.attribution = attributionText(record);
  return record;
}

// The channel's on-screen type (public/js/font.js) draws A-Z, digits, a few marks over vowels and N and C, and this
// punctuation: a name in another alphabet is written in Latin letters on screen (Cyrillic and Greek, simplified ISO 9 /
// ELOT), and its own spelling stays in the full attribution. A name in a script the type cannot write (Chinese, Arabic,
// Hebrew...) cannot be credited on screen: a picture that must name its author is then not cleared.
const FONT_MARKED = new Set([...'ÁÉÍÓÚÀÈÒÑÜÏÇ']);
const FONT_PLAIN = /^[A-Z0-9 .,;:!?'"\-_/&()[\]+@#%*]$/;
const LATIN_EXTRA = { Æ: 'AE', Ø: 'O', Œ: 'OE', Ł: 'L', Đ: 'D', Ð: 'D', Þ: 'TH', ß: 'SS', ẞ: 'SS', İ: 'I', Ħ: 'H', Ŋ: 'NG', Ŧ: 'T', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-' };
const CYRILLIC = { А: 'A', Б: 'B', В: 'V', Г: 'G', Ґ: 'G', Д: 'D', Ђ: 'DJ', Ѓ: 'GJ', Е: 'E', Ё: 'YO', Є: 'YE', Ж: 'ZH', З: 'Z', Ѕ: 'DZ', И: 'I', І: 'I', Ї: 'YI', Й: 'Y', Ј: 'J', К: 'K', Ќ: 'KJ', Л: 'L', Љ: 'LJ', М: 'M', Н: 'N', Њ: 'NJ', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'C', У: 'U', Ў: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Џ: 'DZ', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA' };
const GREEK = { Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O' };
const mapped = (c) => LATIN_EXTRA[c] ?? CYRILLIC[c] ?? GREEK[c];
/** Text as the on-screen type can write it: { text (capitals), ok (false when a letter could not be written) }. */
export function screenText(raw) {
  let out = '';
  let ok = true;
  for (const ch of String(raw ?? '').replace(/[©®™]/g, '').toUpperCase()) {
    if (FONT_PLAIN.test(ch) || FONT_MARKED.has(ch)) {
      out += ch;
      continue;
    }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (base.length === 1 && FONT_PLAIN.test(base)) out += base;
    else if (mapped(base.length === 1 ? base : ch) !== undefined) out += mapped(base.length === 1 ? base : ch);
    else if (/\s/.test(ch)) out += ' ';
    else if (/[\p{L}\p{N}]/u.test(ch)) ok = false; // a letter the type cannot write
  }
  return { text: out.replace(/\s+/g, ' ').trim(), ok };
}

// the name a credit uses: the first of a list, without parenthesised notes
const firstName = (author) => String(author || '').replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s*,\s*|\s+and\s+/i)[0].trim();

/** Whether the author a licence asks to be named can be written on screen (screenText). */
export function authorOnScreen(author) {
  return !!author && screenText(firstName(author)).ok;
}

/**
 * The credit's author part for the screen: the first name in a list, without parenthesised notes, without a Flickr
 * account's town ("Pierre Blaché from Paris, France"), in the screen's letters; '' when there is none to write.
 */
function screenAuthor(record) {
  if (record.source === 'nasa') {
    // "NASA/Joel Kowsky" stays; a NASA picture always names NASA (its guidelines ask the source acknowledged)
    const a = record.author && /\bnasa\b/i.test(record.author) ? record.author : record.author ? `NASA/${record.author}` : 'NASA';
    return screenText(a).text;
  }
  const a = firstName(record.author)
    .replace(/^official\s+/i, '')
    .replace(/\s*\/\s*photo(?:graph(?:y|ed)?)?\s+by\s+/i, '/')
    .replace(/\s+photo(?:graph)?\s+by\s+/i, '/')
    .replace(/^photo(?:graph)?\s+by\s+/i, '')
    .replace(/^(.{2,}?)\s+from\s+\p{Lu}[\p{L} .'-]*$/u, '$1')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[\s.]+$/, '');
  const shown = screenText(a);
  if (a && shown.ok && shown.text) return shown.text;
  if (a) return ''; // (a name the type cannot write: only a picture that need not name its author gets here)
  return record.licence.id === 'PD' || record.licence.id === 'PD-USGov' || record.licence.id === 'CC0-1.0' ? '' : record.source === 'flickr' ? 'FLICKR' : 'WIKIMEDIA COMMONS';
}

// What one line of micro type under the clock holds beside the FILE tag (graphics/remote.js drawFileCredit):
// 384 px less the tag and the margins: 60 micro characters are about 235 px, the plate starting a little left of centre.
// A longer credit runs on two lines (the author, then the licence and PIXELATED), each within this width.
export const CREDIT_MAX_CHARS = 60;

/**
 * The on-air credit: "FILE · <AUTHOR> · <LICENCE> · PIXELATED". The licence and the word for the modification are
 * never dropped. A credit longer than CREDIT_MAX_CHARS runs on two lines (the author; the licence and PIXELATED), and
 * an author longer than a line is shortened at a word (never cut mid-word with dots). A NASA picture says
 * "FILE · NASA/<PHOTOGRAPHER>"; a public-domain picture names its author when known, else "PD".
 */
export function onAirCredit(record) {
  if (!record) return null;
  // an outlet's photo (a private preview only): its credit as the outlet gives it, never dressed as a licence
  if (record.source === 'outlet') return record.author || record.outlet || null;
  const terms = LICENCES[record.licence?.id] || null;
  const tag = record.label === 'EVENT' ? null : record.year ? `FILE ${record.year}` : 'FILE';
  const lic = !terms ? '' : record.source === 'nasa' ? '' : terms.short;
  const change = terms?.noticeChange ? MODIFIED_WORD.toUpperCase() : '';
  let who = screenAuthor(record);
  const join = (w) => [tag, w, lic, change].filter(Boolean).join(' · ');
  if (join(who).length <= CREDIT_MAX_CHARS) return join(who);
  // two lines (graphics/remote.js creditLines): the author on the first, beside the FILE tag; the licence and PIXELATED
  // on the second. An author longer than a line is shortened at a word, never ending on "of", "the", "from"...
  const line = CREDIT_MAX_CHARS - (tag ? tag.length + 3 : 0);
  const loose = /[\s,;/&-]+$|\s+(?:of|the|from|at|by|for|and|de|do|da|du|des|del|la|le|van|von)$/i;
  const trim = (w) => {
    let t = w;
    while (loose.test(t)) t = t.replace(loose, '');
    return t;
  };
  while (who.length > line && /\s/.test(who)) who = trim(who.slice(0, who.lastIndexOf(' ')));
  if (who.length > line) who = trim(who.slice(0, line));
  return join(who);
}

/**
 * The full attribution for a programme's description or its credits page: title, author, source page, licence and
 * its link, and the modification; ShareAlike adds the licence the pixelated picture is offered under; OGL adds the
 * provider's statement.
 */
export function attributionText(record) {
  if (!record) return '';
  const terms = LICENCES[record.licence?.id] || null;
  const title = record.title ? `"${String(record.title).replace(/^File:/, '').replace(/\.[a-z0-9]{3,4}$/i, '')}"` : 'Picture';
  const by = record.author ? ` by ${record.author}` : record.source === 'nasa' ? ' by NASA' : '';
  const page = record.page ? `, ${record.page}` : '';
  const lic = terms ? `, ${terms.short}${terms.url ? ` (${terms.url})` : ''}` : '';
  const parts = [`${title}${by}${page}${lic}.`];
  if (terms?.statement) parts.push(terms.statement);
  if (terms?.derivative) parts.push(`${MODIFIED_WORD[0].toUpperCase()}${MODIFIED_WORD.slice(1)} (modified) by ${CHANNEL}.`);
  if (terms?.shareAlike) parts.push(`The ${MODIFIED_WORD} picture is offered under ${terms.short}${terms.url ? ` (${terms.url})` : ''}.`);
  if (record.source === 'nasa') parts.push('Courtesy of NASA; no endorsement by NASA is implied.');
  if (!record.cleared) parts.push(`NOT CLEARED: ${record.why || 'no licence'}.`);
  return parts.join(' ');
}

/** An outlet's or an agency's own photo (the feed's media, the article page's og:image): kept for a private preview only. */
export function outletRecord(story, { checkedAt = Date.now() } = {}) {
  const url = story?.image || null;
  return rightsRecord({ source: 'outlet', via: `outlet:${story?.imageVia || 'feed'}`, licence: 'OUTLET', author: story?.imageCredit || story?.source || null, url, page: story?.link || null, checkedAt, outlet: story?.source || null });
}

/** A picture of the operator's own local feed (file: URL inside its folder): the operator's to air. */
export function operatorRecord(story, { checkedAt = Date.now() } = {}) {
  return rightsRecord({ source: 'operator', via: 'local-feed', licence: 'OPERATOR', author: story?.source || null, url: story?.image || null, checkedAt, outlet: story?.source || null, localOk: true });
}

/** The picture-rights modes: 'cleared' (the default: only cleared pictures air) or 'preview' (a private preview). */
export const MODES = ['cleared', 'preview'];
export const pictureMode = (v) => (String(v || '').trim().toLowerCase() === 'preview' ? 'preview' : 'cleared');

/** The rights record that goes with the picture a story carries now (null when its record is for another picture). */
export function currentRights(story) {
  const r = story?.imageRights;
  return story?.image && r && r.url === story.image ? r : null;
}

/** May this story's picture air? Cleared always; in 'preview' an uncleared outlet photo too (never in anything published). */
export function airable(story, { mode = 'cleared' } = {}) {
  if (!story?.image) return false;
  if (currentRights(story)?.cleared) return true;
  return mode === 'preview';
}

/**
 * A compact record judged again under today's terms (LICENCES and the rules above, which a lawyer's reading can
 * tighten): what a clip waiting in the publishing queue is checked against before it goes out (server/publish/
 * recheck.js). Never more than it was: a record that was not cleared stays not cleared (the compact form does not
 * carry every reason it had, an image generator's mark among them). -> a compact record
 */
export function rejudge(compact, { now = Date.now() } = {}) {
  if (!compact || typeof compact !== 'object') return compact;
  if (!compact.cleared) return compact;
  const again = compactRights(rightsRecord({
    source: compact.source,
    licence: compact.licence,
    author: compact.author,
    page: compact.page,
    url: compact.url,
    restrictions: compact.restrictions || [],
    label: compact.label,
    year: compact.year ?? null,
    checkedAt: (typeof compact.checkedAt === 'number' ? compact.checkedAt : Date.parse(compact.checkedAt)) || now,
    localOk: compact.source === 'operator',
  }));
  if (again.cleared) return compact;
  return { ...compact, cleared: false, why: `${again.why || 'not cleared'} (judged again ${new Date(now).toISOString().slice(0, 10)})` };
}

/** The compact form an episode, the archive and the client carry (what a description or an audit needs). */
export function compactRights(record) {
  if (!record) return null;
  return {
    source: record.source,
    licence: record.licence?.id || null,
    author: record.author || null,
    page: record.page || null,
    url: record.url || null,
    credit: record.credit,
    attribution: record.attribution,
    label: record.label,
    ...(record.year ? { year: record.year } : {}),
    cleared: !!record.cleared,
    checkedAt: record.checkedAt,
    ...(record.restrictions?.length ? { restrictions: record.restrictions } : {}),
    ...(record.why ? { why: record.why } : {}),
  };
}
