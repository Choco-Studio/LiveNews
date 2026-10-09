// Licences of pictures and clips the channel did not make (docs/roadmap/FOTOS_LIBRES.md §3.4): one strict reading
// for every desk that airs them (imagesearch.js, footage.js, the free-picture desk), so a licence string is never
// judged by two different regular expressions.
//
// The rule is an allow list: a licence is usable only when it is recognised AND its terms allow what the channel
// does with it (show it in a commercial video, cropped and pixelated: an adaptation). Anything else, including a
// licence we cannot read, stays off air.
//
//   readLicence(shortName, url?)   -> { id, version, label }    id: see LICENCES (unknown: 'unknown')
//   allowedFor(id, profile)        -> bool                        profile: PROFILES.youtube | PROFILES.emision
//   shortLabel(id, version)        -> 'CC BY-SA 4.0' | 'PD' | 'CC0' | 'PEXELS' ...   (what airs in the credit)
//   attribution({ title, author, source, licence, modified }) -> 'Title' by Author (Source), CC BY 4.0, modified: …

// id → what the licence allows. commercial: may be used in a monetised video; adapt: may be cropped/pixelated;
// attribution: the author must be credited; shareAlike: the adapted picture carries the same licence.
export const LICENCES = {
  cc0: { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'CC0' },
  pd: { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'PD' },
  // US federal government works (NASA, NOAA, USGS, White House, DVIDS…): public domain in the US
  'pd-usgov': { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'PD' },
  // Flickr Commons "no known copyright restrictions": an institution's statement, not a licence
  'no-known-copyright': { commercial: true, adapt: true, attribution: true, shareAlike: false, label: 'NO KNOWN COPYRIGHT', weak: true },
  'cc-by': { commercial: true, adapt: true, attribution: true, shareAlike: false, label: 'CC BY' },
  'cc-by-sa': { commercial: true, adapt: true, attribution: true, shareAlike: true, label: 'CC BY-SA' },
  // the free stock libraries' own licences: commercial use and changes allowed, credit not required (we give it)
  pexels: { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'PEXELS' },
  pixabay: { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'PIXABAY' },
  unsplash: { commercial: true, adapt: true, attribution: false, shareAlike: false, label: 'UNSPLASH' },
  // Copernicus Sentinel data: free, commercial use allowed, with a fixed attribution
  copernicus: { commercial: true, adapt: true, attribution: true, shareAlike: false, label: 'COPERNICUS' },
  // never on air
  'cc-by-nc': { commercial: false, adapt: true, attribution: true, shareAlike: false, label: 'CC BY-NC' },
  'cc-by-nc-sa': { commercial: false, adapt: true, attribution: true, shareAlike: true, label: 'CC BY-NC-SA' },
  'cc-by-nd': { commercial: true, adapt: false, attribution: true, shareAlike: false, label: 'CC BY-ND' },
  'cc-by-nc-nd': { commercial: false, adapt: false, attribution: true, shareAlike: false, label: 'CC BY-NC-ND' },
  // the GFDL asks for its whole text to travel with the work: not practical in a video
  gfdl: { commercial: true, adapt: true, attribution: true, shareAlike: true, label: 'GFDL', impractical: true },
  fal: { commercial: true, adapt: true, attribution: true, shareAlike: true, label: 'FAL', impractical: true },
  outlet: { commercial: false, adapt: false, attribution: true, shareAlike: false, label: 'OUTLET' },
  unknown: { commercial: false, adapt: false, attribution: true, shareAlike: false, label: '' },
};

// What a programme may air. youtube: what can be published and monetised. emision: the private live stream, which
// may also show the outlets' own pictures when the operator chooses so (PICTURES=outlet).
export const PROFILES = {
  youtube: { name: 'youtube', bySa: true, weak: false, outlet: false },
  youtubeStrict: { name: 'youtube-strict', bySa: false, weak: false, outlet: false },
  emision: { name: 'emision', bySa: true, weak: true, outlet: true },
};

const stripHtml = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A licence as published (Commons' LicenseShortName, a Flickr licence name, a licence URL) → { id, version, label }.
 * The NC / ND clauses are looked for anywhere in the text, so "CC BY-NC-SA 4.0", "Attribution-NonCommercial 2.0",
 * "creativecommons.org/licenses/by-nd/2.0" all fail closed; an empty or unreadable licence is 'unknown'.
 */
export function readLicence(name, url = '') {
  const raw = `${stripHtml(name)} ${String(url || '')}`.toLowerCase();
  const version = (/(\d\.\d)/.exec(raw) || [])[1] || null;
  const out = (id) => ({ id, version: id.startsWith('cc-') ? version : null, label: shortLabel(id, id.startsWith('cc-') ? version : null) });
  if (!raw.trim()) return out('unknown');
  if (/\bcc0\b|cc-zero|creative commons zero|publicdomain\/zero/.test(raw)) return out('cc0');
  if (/\bpexels\b/.test(raw)) return out('pexels');
  if (/\bpixabay\b/.test(raw)) return out('pixabay');
  if (/\bunsplash\b/.test(raw)) return out('unsplash');
  if (/copernicus/.test(raw)) return out('copernicus');
  if (/\bgfdl\b|gnu free documentation/.test(raw)) return out('gfdl');
  if (/\bfal\b|free art licen[cs]e|licence art libre/.test(raw)) return out('fal');
  if (/no known copyright/.test(raw)) return out('no-known-copyright');
  if (/\bpd-usgov|us government|united states government work|work of the (united states|us|u\.s\.) federal government/.test(raw)) return out('pd-usgov');
  if (/public domain|\bpd\b|\bpd-|publicdomain\/mark|\bpdm\b/.test(raw)) return out('pd');
  const cc = /\bcc\b|creative ?commons|attribution|creativecommons\.org\/licenses/.test(raw);
  if (cc) {
    const nc = /\bnc\b|-nc\b|nc-|non-?commercial|\/by-nc/.test(raw);
    const nd = /\bnd\b|-nd\b|nd-|no-?deriv|noderiv|\/by-nd|\/by-nc-nd/.test(raw);
    const sa = /\bsa\b|-sa\b|sharealike|share-alike|share alike|\/by-sa|\/by-nc-sa/.test(raw);
    const by = /\bby\b|by-|attribution|\/by\b|\/by-|\/by\//.test(raw);
    if (!by) return out('unknown');
    if (nc && nd) return out('cc-by-nc-nd');
    if (nc && sa) return out('cc-by-nc-sa');
    if (nc) return out('cc-by-nc');
    if (nd) return out('cc-by-nd');
    if (sa) return out('cc-by-sa');
    return out('cc-by');
  }
  return out('unknown');
}

/** May a picture under licence `id` air under `profile`? (Fails closed for anything not in the allow list.) */
export function allowedFor(id, profile = PROFILES.youtube) {
  const l = LICENCES[id];
  if (!l) return false;
  if (id === 'outlet') return !!profile.outlet;
  if (id === 'unknown' || l.impractical) return false;
  if (!l.commercial || !l.adapt) return false;
  if (l.shareAlike && !profile.bySa) return false;
  if (l.weak && !profile.weak) return false;
  return true;
}

/** The licence as aired in a credit. */
export function shortLabel(id, version = null) {
  const l = LICENCES[id];
  if (!l) return '';
  return id.startsWith('cc-') && version ? `${l.label} ${version}` : l.label;
}

/**
 * The full attribution a published video's description carries (title, author, source, licence; and the change
 * we made, which CC BY and CC BY-SA ask to be stated).
 */
export function attribution({ title = '', author = '', source = '', licence = null, licenceUrl = '', modified = 'pixelated and cropped' } = {}) {
  const lic = licence ? shortLabel(licence.id, licence.version) : '';
  const who = stripHtml(author) || 'unknown author';
  const parts = [`${title ? `"${stripHtml(title)}"` : 'Picture'} by ${who}`];
  if (source) parts.push(`(${source})`);
  const tail = [lic && `${lic}${licenceUrl ? ` ${licenceUrl}` : ''}`, modified && `modified: ${modified}`].filter(Boolean).join(', ');
  return `${parts.join(' ')}${tail ? `, ${tail}` : ''}`;
}
