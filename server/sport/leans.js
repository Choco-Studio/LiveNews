// What a sport sentence points back to (docs/programmes/full-time.md §3.4b): the forms the first real matchday aired before
// what they lean on (17 Oct), shared by the fallback writer (server/providers/mock.js), the shape's last pass over every
// writer's stories (shape.js) and the gate's checks (tools/sport/edition.mjs).
import { lookupPlace } from '../gazetteer.js';

// "Both players received treatment on the pitch…" (ESPN 17 Oct), the collision never told
export const SPORT_BOTH = /^(?:Both|The two|The pair|The duo|All three|All four)\s+(?:players|sides|teams|men|women|clubs|drivers|riders|managers|coaches|goalkeepers|keepers|strikers|captains|horses|jockeys|of them)\b/;
// "Brentford, who later lost Vitaly Janelt to a second yellow card, could not hold out." (Guardian 17 Oct), the first red card
// never told; "Martínez, however, received extended treatment…" after "Both players received treatment…" (ESPN 17 Oct)
export const SPORT_LATER = /^[^,.;]{0,40},\s+who\s+(?:later|then|subsequently)\b|^[^,.;]{0,30}\b(?:later|subsequently)\s+(?:lost|added|scored|went|had|saw|made|conceded|struck|doubled|levelled|leveled|equalised|equalized|replied|pulled)\b|^[^,.;]{1,40},\s+(?:however|though|meanwhile|too|instead|in turn|in contrast|in response|for (?:his|her|their|its) part),/;
// a person by a description, before (or without) their name: "The Spaniard was four under…" (Sky Sports 17 Oct, before Eugenio
// Chacarra), "…that the Argentina international was conscious", "the Everton defender", "The 24-year-old's composure…"
const DEMONYM_NOUN = 'Spaniard|Frenchman|Frenchwoman|Englishman|Englishwoman|Scot|Scotsman|Scotswoman|Welshman|Welshwoman|Irishman|Irishwoman|Dutchman|Dutchwoman|Argentine|Argentinian|Brazilian|Italian|German|Australian|American|Belgian|Portuguese|Norwegian|Swede|Dane|Croat|Serb|Pole|Kiwi|Briton|Latvian|Japanese|Canadian|Mexican|Colombian|Uruguayan|Nigerian|Ghanaian|Senegalese|Moroccan|Egyptian|Turk|Greek|Russian|Ukrainian|Czech|Slovak|Hungarian|Romanian|Austrian|Swiss|South African|New Zealander|Fijian|Samoan|Tongan|Jamaican|Indian|Pakistani|Chinese|Korean|Kenyan|Ethiopian';
const PERSON_ROLE_NOUN = 'international|striker|forward|midfielder|defender|goalkeeper|keeper|winger|full-back|centre-back|captain|skipper|loanee|youngster|teenager|veteran|jockey|rider|driver|star|playmaker|fly-half|scrum-half|prop|hooker|flanker|quarterback|pitcher|batter|bowler|all-rounder|seed|debutant|substitute|replacement|signing|newcomer|boss|manager|head coach|coach|champion|world number one';
export const PERSON_DESC = new RegExp(`\\b[Tt]he\\s+(?:\\d{1,2}-year-old\\b|(?:${DEMONYM_NOUN})\\b|(?:\\p{Lu}[\\p{L}'’.-]*\\s+){1,3}(?:${PERSON_ROLE_NOUN})\\b(?!\\s+\\p{Lu}))`, 'u');
const PERSON_DESC_ALL = new RegExp(PERSON_DESC.source, 'gu');
// "…," Le Havre added." (BBC Sport 13 Oct) with nothing Le Havre said before it
export const SPORT_ADDED = /[,.]["”’]?\s+(?:(?:\p{Lu}[\p{L}’'-]+|the club|the team|he|she|they)\s+){1,3}added\.?["”’]?$|^[^,;:.]{0,60}\badded\s+(?:that\b|,|:)/u;
// a team by a description: "The Prem club had led 12-0…", "The visitors…", "The Canaries…" (BBC and Sky Sports 17 Oct)
export const TEAM_DESC = /^The\s+(?:(?:\p{Lu}[\p{L}'’.-]*\s+){1,2}(?:club|side|outfit|team)|visitors|hosts|home side|away side|holders|champions|leaders|(?:Steelmen|Canaries|Buddies|Saints|Blades|Bees|Gunners|Blues|Reds|Toffees|Magpies|Hammers|Cherries|Seagulls|Villans|Foxes|Hornets|Eagles|Clarets|Owls|Baggies|Potters|Tigers|Robins|Swans|Terriers|Royals|Bears|Sharks|Warriors|Rhinos|Wolves|Lions|Hoops|Bhoys|Gers|Dons|Jambos|Hibees|Arabs|Accies|Pars|Bairns|Sons|Killie))\b/u;

// a whole name of a person ("Emi Martínez"), never a competition's, a club's or a place's
const WHOLE_PERSON = /(?<![\p{L}’'-])(\p{Lu}\p{Ll}+)\s+((?:Mc|Mac|O['’]|De|Di|Van|Von|Le|La)?\p{Lu}[\p{Ll}’'-]+)/gu;
const NOT_FIRST = /^(?:The|A|An|And|But|In|On|At|For|With|From|By|After|Before|When|While|As|If|Since|Premier|Champions|Scottish|English|British|Irish|Welsh|World|Grand|Super|United|Rugby|Formula|European|National|Women|Men|Golden|Royal|Real|Open|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Spain|France|England|Scotland|Wales|Ireland|Britain|Latvia|Argentina)$/;
const NOT_LAST = /^(?:League|Cup|Open|Series|Prix|Masters|Stakes|Trophy|Championship|Championships|Premiership|Park|Stadium|Road|Arena|Ground|United|City|Town|Rovers|Athletic|County|Albion|Wanderers|Rangers|Villa|Palace|Forest|Hotspur|Sport|Sports|News|Finals?|Games|Club|Council|Board|Federation|Association|Union)$/;
/** Has `text` named a person by their whole name? */
export const personTold = (text) => [...String(text || '').matchAll(WHOLE_PERSON)].some((m) => !NOT_FIRST.test(m[1]) && !NOT_LAST.test(m[2]) && !lookupPlace(m[1]) && !lookupPlace(m[2]));
/** How many people `text` has named: by a whole name, or by a surname of the story's people (prepare.js peopleIn). */
export function peopleTold(text, people = null) {
  const t = String(text || '');
  const names = new Set([...t.matchAll(WHOLE_PERSON)].filter((m) => !NOT_FIRST.test(m[1]) && !NOT_LAST.test(m[2]) && !lookupPlace(m[1]) && !lookupPlace(m[2])).map((m) => m[2].replace(/['’]s$/u, '')));
  for (const sur of Object.keys(people || {})) if (new RegExp(`(?<![\\p{L}])${sur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(t)) names.add(sur);
  return names.size;
}

/**
 * A sport sentence that points back to someone or something its story has not yet told (`told`: the lines said before it;
 * `prevSaid`: the sentence the outlet wrote just before it was said; `people`: the story's people by surname, prepare.js
 * peopleIn, so "The Austrian encouraged the crowd…" may follow "Suljovic apologises…"). A description needs as many people
 * told as it describes: "The Austrian encouraged the crowd to boo the Englishman…" after Mensur Suljovic alone names one of
 * its two (Sky Sports 13 Oct, Ross Smith named a sentence later).
 */
export function sportLeans(t, told, { prevSaid = false, people = null } = {}) {
  const s = String(t || '').replace(/^(?:\[[^\]]*\]\s*)*/, '').trim();
  if ((SPORT_BOTH.test(s) || SPORT_LATER.test(s) || SPORT_ADDED.test(s)) && !prevSaid) return true;
  const described = (s.replace(/[“"][^”"]*[”"]/g, ' ').match(PERSON_DESC_ALL) || []).length;
  if (described && peopleTold(told, people) < described) return true;
  return TEAM_DESC.test(s) && !String(told || '').trim();
}
