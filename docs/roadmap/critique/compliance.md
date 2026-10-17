# Compliance: publishing without sanction risk, every feature kept

Owner, 17 Oct 2026: "Quiero soluciones buenas, no apaños." GLOBIT 24 will publish a 24/7 YouTube live stream, full programmes, Shorts and clips on TikTok, Instagram and Facebook, and text posts on X and other networks. Every feature stays, IN THEIR WORDS included, and each is made compliant properly.

The work is in `docs/publishing/compliance.md` (the rules, the design, the workflow, the API, the lawyer's list) and `docs/publishing/verbatim.md` (the text audit and the rule). The code is in `server/compliance/`, the on-air disclosure in `public/js/graphics/disclosure.js`, the C2PA tooling in `tools/c2pa/`, and the tools in `tools/compliance/`.

**The panel:**
- a media lawyer (EU and UK);
- a platform policy specialist;
- a standards editor;
- a senior broadcast director;
- a pixel artist.

They score six categories from 0 to 10:
- **legal coverage:** every law that touches us read at its source and answered;
- **platform coverage:** every platform's rule and field;
- **quality preserved:** no feature lost, and disclosure that does not cheapen the look;
- **enforcement:** checks that block, not docs;
- **robustness:** failures fail closed, across processes and time;
- **tests.**

**The round's score is its lowest category.** The bar is above 9.7.

## Round 1: the first complete draft

What was there:
- the API and its six modules;
- the on-air mark, the ident line and the continuity voice;
- the recreation label with AI;
- the election calendar from Wikidata;
- the register;
- C2PA signing and read-back;
- the rights registry;
- the verbatim lint and the audit;
- the compliance document.

**Media lawyer: 8.0.**
- The Commission's guidelines were read in full: the 51 pages of C(2026) 5054 annex. Their status is stated correctly: content approved on 20 July and formal adoption pending, so "only from that moment… applicable".
- The provider/deployer analysis and the "no grace period for a system put into service after 2 August" point are right. The deep-fake reasoning is careful. The decision to label recreations anyway is the right call, and the editorial-exemption analysis is honest.
- But:
  - Two statements in the document were not from a source read in this session: a YouTube "48 hours" for privacy complaints, and a Spanish decree number. A compliance document must not carry unverified specifics.
  - The GDACS licence was guessed, and its terms page URL was a 404.
  - The Omnibus regulation's text was not read on EUR-Lex (automated access refused). Only a law firm's note and the guidelines' point 153 support it. That is acceptable if said, and the document says it.
  - The second marking layer (watermark) is missing against the Code of Practice's two layers.

**Platform policy specialist: 8.5.**
- The YouTube field (`status.containsSyntheticMedia`), the TikTok field (`post_info.is_aigc`) and the Instagram field (`is_ai_generated`, June 2026) were all checked in the official API references. Facebook and Threads have no API flag, which the draft handles: refused unless labelled by hand.
- But:
  - The YouTube live path is not confirmed (the `liveBroadcast` resource has no field).
  - TikTok's and X's policy pages could not be read directly. They are JS-rendered or refuse automated fetching.
  - The "made for kids" audience setting, which YouTube requires on every upload, is not in the flags.

**Standards editor: 8.5.**
- The verbatim audit is the most important finding of the round: **88.7 % of the fallback writer's aired words are the outlets' own**, on 4,780 tellings with 94 % of their articles read. The rule is clear.
- But nothing stops the live stream from airing it. The publish check blocks it, but the launch readiness check does not know.

**Broadcast director: 8.0.**
- The mark is calm. It wipes in with the bug and opens only when the programme name has gone: one thing at a time.
- The spoken line at breaks is right, and it is how channels already identify themselves.
- But a clip's frame was not shown working end to end.

**Pixel artist: 7.0.** The first 4x renders, especially the 9:16 recreation clip, showed four faults:
1. The opened mark ran out of the 9:16 window ("PRODUCED NEW" cut at the edge).
2. The role tag ended on "CHIEF EXECUTIVE OF": a cut role, half a title.
3. The stacked label covered the guest's eyes.
4. A centred 9:16 window cut the guest's face in half. The press room's guest stands at x 124, not 192.

**Enforcement: 8.0.**
- Every publish-time rule refuses.
- Adding the rights gate as a new producer stage broke the pipeline contract: 16 failures in the full suite, in producer, server and voice-stage tests.
- `RIGHTS_GATE` defaults to report on air.

**Robustness: 7.5.**
- The register's takedown plan **over-removed**. A complaint naming a person and an episode's URL also took down a clip cut from that episode that did not contain the person.
- The election calendar classed the "2026 Michigan House of Representatives election" as national, so it would hold every US politician for a state vote's window.
- A test's own date for the end of the window was wrong, by the 12 hours of time zones the rule keeps on purpose.

**Tests: 8.5.** About 50 new tests, all passing alone, but the full suite failed (above).

**Round 1: 7.0** (pixel artist).

## Round 2: the fixes

**Legal.**
- Removed both unverified specifics. The privacy page's own words now stand: YouTube "may give the creator time", with no fixed period. The decree is a lawyer's item.
- Read the real GDACS terms (the March 2025 PDF). No licence is stated, the information is "as is", and alerts are "not meant to substitute… official" warnings. The rights record and a note for the weather writer say so.
- The Omnibus is stated as what was read: the law firm's note and the guidelines' point 153. EUR-Lex refused automated access.
- The watermark gap is written into the gap analysis that the guidelines expect of a non-signatory (point 148). The integration is ready and tested with a stand-in. Why it is not installed is stated: the download hosts answered 403, and disk was short.

**Platforms.** The YouTube live path and the unreadable TikTok and X pages are on the lawyer's list, worded as "confirm".

**The 9:16 clip.**
- The mark's words open only where they fit whole. A 9:16 window keeps the AI plate, and the clip's caption and description say the words. A 1:1 window opens.
- A role wraps to two lines on the tag rather than being cut. `fit()` never ends on a word that needs the next.
- The source moves to the package's micro face for sources (ART_DIRECTION §4) inside a window. The stack now ends above the guest's eyes, and 5 px capitals are still 44 px tall on a 1920 px picture.
- The captions sit above the recreation's name super wherever it stands. They had collided with a two-line tag.
- `RECREATION_WINDOW = '9x16@64'` centres a recreation clip on the guest. The renderer and the check share `recreationLayout()`.
- The publish check measures legibility on the label's smallest capitals.

**Enforcement.** The rights gate runs inside the assets stage: no new stage, no new episode field, and the pipeline contract is kept. It reports in that stage's entry (`unlicensed`, `offAir`).

**Robustness.**
- A takedown takes an item's derived clips only when nothing narrower is named. A named story takes the clips holding the story, and a named person takes the clips holding the person.
- Votes named after a US state or a sub-national place are classed regional or local. Hundreds of state races on one day are one entry, with their candidates kept.
- The test's date was corrected to the rule.

**Tests.**
- New tests cover the window's mark, the role wrap, the captions above the super, and the producer's guests stage holding a US citizen 17 days before the vote while re-staging the same person with no vote in the window.
- The full suite was run again.

**Scores.**

| Category | Score | What holds it back |
| --- | --- | --- |
| Legal coverage | 9.4 | No "made for kids" setting. General media law (contempt, reporting restrictions) is not on the lawyer's list |
| Platform coverage | 9.3 | The YouTube audience setting is missing |
| Quality preserved | 9.6 | The renders are clean |
| Enforcement | 9.2 | The launch check does not know the fallback writer breaks the verbatim rule on air |
| Robustness | 9.5 | |
| Tests | 9.5 | |

**Round 2: 9.2** (enforcement).

## Round 3

<!-- filled after round 3's work: launch report reads the archive for the verbatim rule; YouTube made-for-kids;
     the operator's command line; the full suite -->
