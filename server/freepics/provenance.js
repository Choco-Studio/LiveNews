// Provenance (docs/roadmap/FOTOS_LIBRES.md §3.5): a licence label is a claim, not a proof. Commons and Flickr hold
// uploads that are not the uploader's to license ("licence laundering": an agency photo re-uploaded as CC BY). This
// reads the signs a picture desk would look at and decides, before any ranking, whether a file may air at all.
//
//   provenance(file, { now }) -> { ok, reasons: [why it is out], flags: [signs, good or neutral], trust: 0..3 }
//
// Out: an open deletion request or copyright-violation tag; a missing source, permission or licence; a news agency
// or stock house in the author, credit or description; "all rights reserved"; a © notice that is not followed by a
// free licence; a fresh upload (under 30 days) with no licence review and not the uploader's own work.
// Trust (used by the ranking): licence reviewed, own work, an institution's official release, a quality award.

// open problems Commons marks with (hidden) categories
const BAD_CATEGORY = /\b(deletion requests?|candidates for (speedy )?deletion|copyright violations?|copyvio|possible copyright violations|no source|no permission|missing (permission|source|license|licence)|without (a )?(source|license|licence|permission)|unknown copyright|disputed|license review needed|flickr review needed|flickr images (needing|not found)|unreviewed|problematic|fair use|non-free)\b/i;
// news agencies and stock houses: their pictures are never free, whatever an uploader says
const AGENCY_NAMES = '(reuters|associated press|ap photo|ap images|afp|agence france[- ]presse|getty( images)?|epa(-efe)?|european pressphoto|shutterstock|alamy|xinhua|anadolu|dpa|picture[- ]alliance|imago|sipa( press)?|rex features|abaca|zuma( press)?|corbis|bloomberg|polaris|pa images|press association|tass|ria novosti|sputnik|kyodo|yonhap|efe)';
// in the author or the credit, any mention; in a description only a credit line ("Photo: Reuters", "(AFP)",
// "Reuters/"), since a picture OF Michael Bloomberg or of the Reuters building is not an agency's picture
const AGENCY = new RegExp(`\\b${AGENCY_NAMES}\\b`, 'i');
const AGENCY_CREDIT = new RegExp(`(?:\\b(?:photo|foto|picture|image|credit|source|fuente|bild)\\s*(?:by)?\\s*[:/]\\s*|\\(\\s*|©\\s*)${AGENCY_NAMES}\\b|\\b${AGENCY_NAMES}\\s*(?:/|\\))`, 'i');
const RIGHTS_RESERVED = /all rights reserved|todos los derechos reservados|tous droits réservés/i;
const FREE_WORDS = /\b(cc[ -]?by|cc0|creative commons|public domain|gfdl|free licen[cs]e|attribution)\b/i;
const OWN_WORK = /\bown work\b|\btrabajo propio\b|\beigenes werk\b|\btravail personnel\b/i;
const REVIEWED = /\b(reviewed licen[cs]es?|license review(ed)? passed|flickreview(r)? (passed|reviewed)|reviewed by flickreviewr|files from external sources with reviewed|vrt|otrs|permission received)\b/i;
const OFFICIAL = /\b(official (portrait|photo(graph)?)|government|governo|gobierno|gouvernement|bundesregierung|white house|kremlin|presidency|presidencia|ministry|ministerio|parliament|parlamento|european (union|commission|council)|council of the eu|nasa|noaa|usgs|esa\b|fema|dvids|u\.s\. (army|navy|air force|marine)|department of)\b/i;
const QUALITY = /\b(quality images?|featured pictures?|valued images?|picture of the (day|year))\b/i;

const DAY = 86400_000;

/** May this Commons/Flickr file air, judging by where it comes from? */
export function provenance(file, { now = Date.now() } = {}) {
  const reasons = [];
  const flags = [];
  const cats = (file?.categories || []).join(' | ');
  const who = `${file?.author || ''} | ${file?.credit || ''}`;
  const text = `${who} | ${file?.description || ''} | ${file?.title || ''}`;

  const bad = BAD_CATEGORY.exec(cats);
  if (bad) reasons.push(`category: ${bad[0]}`);
  const agency = AGENCY.exec(who) || AGENCY_CREDIT.exec(text);
  if (agency) reasons.push(`agency: ${agency[0]}`);
  if (RIGHTS_RESERVED.test(`${text} | ${file?.licenceName || ''}`)) reasons.push('all rights reserved');
  // "© Jane Doe / CC BY-SA 4.0" is a normal Commons credit; a bare "© Something" is a claim nobody released
  const copy = /©|\(c\)\s*\d{4}|copyright\s+(by\s+)?\p{Lu}/iu.exec(who);
  if (copy && !FREE_WORDS.test(who)) reasons.push('copyright notice in the credit');

  const own = OWN_WORK.test(who);
  const reviewed = REVIEWED.test(cats);
  const official = OFFICIAL.test(who);
  const quality = QUALITY.test(`${cats} | ${(file?.assessments || []).join(' ')}`) || (file?.assessments || []).length > 0;
  if (own) flags.push('own work');
  if (reviewed) flags.push('licence reviewed');
  if (official) flags.push('official');
  if (quality) flags.push('quality');
  if ((file?.restrictions || []).includes('personality')) flags.push('personality rights');
  if ((file?.restrictions || []).includes('trademarked')) flags.push('trademark');

  const up = Date.parse(file?.uploaded || '');
  if (Number.isFinite(up) && now - up < 30 * DAY && !reviewed && !own) reasons.push('fresh upload without licence review');

  const trust = Math.min(3, Number(reviewed) + Number(own || official) + Number(quality));
  return { ok: reasons.length === 0, reasons, flags, trust };
}
