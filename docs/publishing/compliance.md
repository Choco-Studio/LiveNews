# GLOBIT 24 — Publishing compliance

Written 17 October 2026 for the owner, the publishing team and the lawyer who will review it. **This is not legal advice.** It sets out what the rules say, where they come from, what the channel does about each one, and which checks enforce them in code. Section 9 lists what a lawyer should confirm before launch.

## Resumen para el propietario

- **Todo lo que publicamos dice que lo hace la IA**, en pantalla, en la voz y en el texto. En pantalla aparece una pequeña placa amarilla **AI** junto al logo, siempre visible. Al empezar cada programa, al volver de cada pausa y cada cinco minutos, la placa se abre unos segundos y dice **AI · PRODUCED NEWS** (FORECAST en el tiempo, SPORT en deportes, QUIZ en el concurso). El ident de las pausas lo dice con palabras, y la voz de continuidad también: "This is GLOBIT 24, AI-produced news". Lo hacemos aunque alguna ley nos dejara callar. El directo no puede acogerse a la excepción de "revisión editorial", porque nadie revisa cada boletín antes de emitirlo. Además, las plataformas piden sus propias etiquetas.
- **Las recreaciones (IN THEIR WORDS) se mantienen** y ahora llevan **AI RECREATION** en la placa amarilla, más la fuente, en cada fotograma, también en vertical (9:16).
  - El sistema que prepara los clips rechaza cualquier clip que corte la cita, que no incluya la frase del presentador que dice de quién son las palabras, o que pierda la etiqueta al recortar.
  - También rechaza cualquier subida sin la marca de "contenido sintético" de la plataforma.
  - Antes de publicar algo con una recreación hace falta tu visto bueno.
- **Elecciones:** desde 30 días antes de una votación nacional, ningún político de ese país se recrea. Su cita sigue en pantalla como tarjeta de cita, así que no se pierde nada. Ahora mismo afecta a Estados Unidos (votan el 3 de noviembre), Brasil, Bulgaria, Serbia e Israel. A España le afecta desde el 30 de octubre, por las generales del 29 de noviembre. El día antes de votar y el mismo día no publicamos nada sobre esa votación.
- **Quejas y retiradas:** cada queja queda apuntada en un registro. Se retira todo lo publicado en todas las plataformas (también los clips sacados del programa) y se bloquea para el futuro, en 24 horas como máximo (6 horas si es sobre elecciones o sobre un menor o una víctima).
- **Las webs de los medios:** antes de abrir la página de un artículo (para leer su principio o buscar su foto), el canal mira el robots.txt de esa web y obedece lo que dice; si no nos deja, la noticia se cuenta solo con el feed del medio. Hoy ninguno de los 17 sitios nos cierra sus artículos (§6.1). Queda para el abogado si las condiciones de uso de cada medio permiten lo que hacemos (§9, punto 12).
- **Marcado legible por máquina:** cada vídeo y cada imagen exportados llevan credenciales C2PA firmadas que dicen "hecho con IA" y se leen de vuelta para comprobarlas. Funciona aquí. Para el lanzamiento falta un certificado de una autoridad reconocida.
- **Hay que corregir antes de lanzar:**
  1. **El redactor de reserva lee los artículos casi palabra por palabra.** El 89 % de lo que dice en antena es copia literal. Esto plantea un problema de derechos de autor, y YouTube no paga por "lecturas de noticias de otros". El sistema de publicación ya bloquea esos programas, y el equipo del redactor tiene la regla y la herramienta para medirlo (`docs/publishing/verbatim.md`).
  2. **Open-Meteo:** el plan gratuito es solo para uso no comercial. Un canal con anuncios necesita el plan de pago.
  3. Las **fotos de los medios** no tienen licencia. Otro equipo las está cambiando por fotos con licencia, y el canal ya sabe quitar del aire cualquier foto sin licencia (`RIGHTS_GATE=strict`).
  4. Hay que poner un **contacto editorial** público: quién responde del canal.
- **Una orden para saber si estamos listos:** `node tools/compliance/cli.mjs launch` dice qué falta. Mientras el redactor siga copiando (hoy el 80 % de las últimas 300 noticias rompe la regla, medido solo contra el resumen del medio), el lanzamiento queda bloqueado. Con la misma herramienta se apunta una queja en una línea (`complaint add`), y la persona queda retenida al instante (§7).

## 1. What applies to which output

| Rule | Live stream (24/7, YouTube Live) | Full programmes (VOD) | Clips and Shorts (YouTube, TikTok, Instagram, Facebook) | Text posts (X, Threads, Bluesky, Mastodon, LinkedIn) |
| --- | --- | --- | --- | --- |
| AI Act Art. 50(2): machine-readable marking (we build the system) | Applies. The visible mark is on air. C2PA cannot survive RTMP ingest. Recordings we keep are marked (§4) | Applies: C2PA on every file | Applies: C2PA on every file | Free-form text cannot carry metadata. Text watermarking is not feasible for posts under 200 tokens (CoP Measure 1.1) |
| Art. 50(4): deep fake disclosure | Recreations are probably not deep fakes (§2.1), but we label them as if they were | Same | Same, and the label must survive the crop | n/a |
| Art. 50(4): AI-generated text on matters of public interest | Applies: captions and on-screen text. No editorial review is possible on a 24/7 stream | Applies unless the owner's review qualifies. We disclose anyway | Same | Applies: the "AI-generated:" prefix |
| Art. 50(5): clear, at first exposure, accessible | Persistent AI mark, openings every 5 min and after breaks, the spoken line at breaks | Mark plus description first line | Mark (kept inside the crop) plus caption first line | Prefix first |
| Copyright of text (verbatim) | Applies (communication to the public) | Applies. Refused at publish if over the rule | Same | Same |
| YouTube altered or synthetic content | Set on the broadcast (§2.5) | `status.containsSyntheticMedia = true` | Same, for Shorts | n/a |
| YouTube audience ("made for kids", COPPA) | `status.selfDeclaredMadeForKids = false` on the broadcast | Same, on every video | Same, for Shorts | n/a |
| YouTube inauthentic and reused content (monetisation) | Applies to the channel | Applies | Applies | n/a |
| TikTok AI-generated content label | n/a | n/a | `post_info.is_aigc = true` | n/a |
| Meta AI info label | n/a | Facebook: label set by hand plus C2PA | Instagram `is_ai_generated = true`. Facebook and Threads: by hand plus C2PA | Threads: prefix |
| X synthetic and manipulated media | n/a | n/a | Labelled in frame and in text | Prefix. Automated-account label |
| Election rule (§5.4) | Recreations held. Silence on air is not needed (news is allowed) | Held and silence | Held and silence | Silence |
| Takedown register (§7) | The live archive is a publication too | Yes | Yes | Yes |

## 2. The rules, in plain language, with their sources

### 2.1 EU AI Act, Article 50 (transparency)

**What the law says.** Article 50 of Regulation (EU) 2024/1689 has applied since 2 August 2026 ([Art. 113](https://eur-lex.europa.eu/eli/reg/2024/1689/oj); the Commission's guidelines §8.4). Fines run up to €15 million or 3 % of worldwide turnover, whichever is higher. For an SME it is whichever is lower ([Art. 99(4), (6)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj); guidelines §8.3).

- **50(2) marking.** *Providers* of systems that generate synthetic audio, image, video or text must mark outputs in a machine-readable, detectable way. The marking must be effective, interoperable, robust and reliable as far as technically feasible.
- **50(4) first subparagraph.** *Deployers* must disclose deep fakes.
- **50(4) second subparagraph.** Deployers must disclose AI-generated or manipulated text *published with the purpose of informing the public on matters of public interest*. This does not apply where the text "has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility".
- **50(5).** The information must be given clearly and distinguishably, at the latest at first exposure, and it must be accessible.

**The Commission's guidelines.** *Guidelines on the implementation of the transparency obligations… under Article 50*, C(2026) 5054 final, 20 July 2026 ([page](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems), [text](https://ec.europa.eu/newsroom/dae/redirection/document/131215), [approval](https://ec.europa.eu/newsroom/dae/redirection/document/131214)).

- **Status: the Commission approved the content on 20 July.** "The Guidelines will be formally adopted… when all language versions are available. It is only from that moment that these Guidelines will be applicable". They are non-binding, and only the CJEU interprets the Act (§1 point 5).
- We read all 51 pages. The points that decide our case follow.

**Who we are under the Act.**

- We **deploy** AI systems: the AI script writer when configured, and the text-to-speech engine. We do so professionally and publish to the EU (guidelines §2.3, points 12-14).
- We have also built our own composite system (writer, voices, renderer) and put it into service under our own name. On the guidelines' reading (point 11, "developed in-house… for its own use and under its name"), that probably makes us a **provider** too. We therefore assume both roles.
- **No grace period for us.** Regulation (EU) 2026/1744 (the "Digital Omnibus on AI", adopted 8 July 2026, published 24 July 2026 according to [Cuatrecasas](https://www.cuatrecasas.com/en/spain/intellectual-property/art/digital-omnibus-ai-has-been-published); EUR-Lex refused automated access from this environment) gives a transition to **2 December 2026** for marking. It covers only generative systems *placed on the market or put into service before 2 August 2026* (guidelines point 153). GLOBIT 24 goes into service after that date, so **marking applies from launch**.

**What 50(2) means for our files.**

- Marking is required for audio, image, video and text, including mixed content (guidelines points 59-60: "content that is mixed with human-created material also qualifies").
- **Rendered frames are not targeted.** The guidelines name "a rendered frame" (point 64), and our pixel art is drawn by code.
- **Our videos are targeted.** They carry synthetic speech and AI-written text, and for video "both video and audio content must be marked" (point 60).
- **Short text is out of scope**, but published posts are not. Image captions, UI labels and "short sequences" are excluded (point 68).
- **Marking needs detection.** Marking without a means of detection does not comply (point 70). C2PA's open verifiers satisfy this (point 76: "publicly-available industry standard detection solutions").

**The Code of Practice on Transparency of AI-Generated Content.**

- The final text is dated 10 June 2026 ([page](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content), [text](https://ec.europa.eu/newsroom/dae/redirection/document/129555)). The Commission and the AI Board have assessed it as adequate (guidelines §8.1).
- **For providers,** it requires at least **two layers**: digitally signed metadata (Sub-measure 1.1.1) and an imperceptible watermark (1.1.2). Fingerprinting or logging is optional.
- **For deployers,** it requires an icon or label whose **main element is the capital "AI"**. The label is shown at the start, at regular intervals and after interruptions for live and long video (Measure 1.2.2 b). For a deep fake it goes "e.g. in the top right corner". For text it goes at the top. Its user tests found that an added word ("GENERATED", "MODIFIED") makes it clearer (Annex 1).
- **We are not a signatory.** The guidelines expect non-signatories to show compliance "through other adequate means", including a gap analysis against the Code (point 148). Ours:

| Code measure | GLOBIT 24 |
| --- | --- |
| 1.1.1 signed, time-stamped metadata | C2PA manifest, ES256, RFC 3161 time-stamp (§4). In place |
| 1.1.2 imperceptible watermark | Audio watermark integration ready (`AUDIO_WATERMARK`). **Not active here**: the embedder could not be installed (§4). Gap until the production machine has it |
| 1.2 non-removal of markings | We never strip markings. The publisher re-reads every file before upload (`preflight` rule `unmarked`) |
| 1.3 provenance information | System name, publisher, time, what is AI, programme, sources, recreations in `org.globit24.disclosure` |
| Deployers 1.1 icon with "AI" | The yellow AI mark, "AI RECREATION", "AI-generated:" prefix (§3) |
| Deployers 1.2 placement: start, intervals, after breaks, top right for deep fakes | Persistent mark; openings at start, every 5 min, after breaks; recreation label top right (§3, §5.1) |
| Deployers 2.1 internal documentation | This document and the tests that enforce it |
| Deployers 2.3 channel to flag a missing label | The complaints address; category `disclosure` in the register (§7) |
| Deployers 4 editorial responsibility published | `EDITORIAL_CONTACT` in every description and on the About page (launch blocker) |

**Are the recreations deep fakes?** Probably not, but we treat them as if they were.

- A deep fake is content that "resembles existing persons… and would falsely appear to a person to be authentic or truthful" ([Art. 3(60)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)). The guidelines require *appreciable* resemblance, judged objectively "based on… the extent to which characteristic or distinctive features are represented" (point 113 i).
- Our recreations use a **generic look** (never a portrait) and a **generic voice** (never an imitation), in pixel art, labelled from the first frame.
- The guidelines' non-deep-fake examples include "AI voice replication for fictional characters… when there is no deception as to the identity of the narrators" and an "AI-generated cartoon of a pre-existing image depicting a historical event" (§6.1.1).
- Against that, their deep-fake examples include "an individual resembling a politician, holding a speech in front of an audience". The test also takes "the possible diverse composition of the reasonably foreseeable audience", children and the elderly included, into account (point 115).
- News is never "evidently artistic" for the lighter regime: "the informative character should always prevail" (point 122).
- **So we label every recreation to the full deep-fake standard:** a visible label with "AI" as its main element, top right, in every frame, plus the platform flags.
- **The presenters, experts and correspondents are not deep fakes.** They are fictional characters with no real person behind them, which matches the guidelines' fictional-characters example. They are disclosed anyway by the channel mark.

**Penalties and supervision.** National market surveillance authorities enforce Article 50 on their own initiative or on complaint (guidelines §8.2). Spain's authority is AESIA. The Spanish bill adapting the AI Act was approved by the Council of Ministers on 26 May 2026 and is in Parliament ([Ministerio para la Transformación Digital](https://digital.gob.es/content/dam/portal-mtdfp/comunicacion/comunicacion_ministro/2026/05/2026-05-26/260526%20NP%20CMin%20APL%20IA.pdf)). Its sanctions and dates are for the lawyer to confirm (§9).

### 2.2 The editorial-review exemption for AI text: does it apply to us?

**What it takes** (guidelines §6.2.3, points 133-138). Two conditions must both be met.

1. **Human review or editorial control.** A person "possessing relevant knowledge and professional judgement" deliberately examines the substance. "Fact-checking the accuracy of the content is a minimum requirement", and the person has the authority to approve, alter or reject.
   - "Superficial, solely formal or procedural checks… automated review processes or cursory editorial approval" do not count (point 135).
   - Any substantive AI change after sign-off voids the exemption (point 136).
2. **Editorial responsibility.** A natural or legal person holds "the ultimate legal responsibility over the publication". Their identity and contact details should be easy to find (point 138).

**Our case, output by output.**

- **Live stream: no.** Bulletins are written and aired 24 hours a day with nobody reading them first.
- **Full programmes and clips: only if the owner's review is substantive.** The publishing plan has an owner review step, but it qualifies only if it is a substantive check of each item's facts and quotes against its sources, made before publication and with nothing regenerated afterwards. The owner reviews in English, which is not his first language, and the volume is many clips a day. A click to approve would be "cursory approval".
- **Text posts and descriptions: only with the same substantive review**, and only if no AI rewording happens after it.

**What we do.**

- **We do not rely on the exemption.** Every output is disclosed. The live stream cannot qualify. Clips are cut from those same frames, so their burned-in label is there anyway. The platforms require their own labels regardless of the Act. The guidelines are not yet formally adopted. And one identity said everywhere is clearer and honest.
- **We still keep a review step for the riskiest item, the recreation.** Nothing with a recreation is published without a recorded owner review that checks the quote against its source (`register.recordReview`; the publish check refuses otherwise, rule `review-missing`). This protects against misquotation and defamation, not against the AI Act.
- **We make the second condition true anyway.** The editorial contact goes in every description and on the About page (`EDITORIAL_CONTACT`; refused without it, rule `editorial-contact-missing`).

### 2.3 Other law that touches a channel like ours

**Digital Services Act.** The DSA's duties fall on the platforms. Among the risk-mitigation measures open to very large platforms is making deep fakes "distinguishable through prominent markings" (Art. 35(1)(k), as quoted in the guidelines point 126). That is one reason YouTube, TikTok and Meta ask us for flags. The Act's labels "should not influence the assessment… on the illegality of the specific content under other regulatory frameworks" (guidelines point 96): a label does not make a copyright or defamation problem go away.

**European Media Freedom Act.** If GLOBIT 24 is a "media service provider" (editorial responsibility and a professional activity), Article 6 asks it to make its legal name, contact details and owners easily accessible ([Regulation (EU) 2024/1083](https://eur-lex.europa.eu/eli/reg/2024/1083/oj); applies from 8 August 2025). Lawyer: does it apply (§9)?

**Spain, Ley 13/2022 General de Comunicación Audiovisual.** A YouTube channel can become a "usuario de especial relevancia" with registry and content duties once it crosses its income and audience thresholds (set by its implementing royal decree; to confirm). Lawyer: when the channel grows (§9).

**Data protection.** A recreation processes a public figure's personal data (their name, role and words). The legal basis is legitimate interest and the journalism exemption ([GDPR Art. 85](https://eur-lex.europa.eu/eli/reg/2016/679/oj); [UK DPA 2018 Sch. 2 Part 5](https://www.legislation.gov.uk/ukpga/2018/12/schedule/2/part/5)). We use public-role people only, their public statements only, and the facts Wikidata publishes (adult, alive, role). Anyone can ask to be left out: the register blocks them for good (§7).

**Personality and endorsement.**

- Spain protects a person's image and voice ([LO 1/1982, art. 7](https://www.boe.es/buscar/act.php?id=BOE-A-1982-11196)). The use of a public figure's image in connection with public events is allowed (art. 8.2). Our figure is generic, never their image.
- In the UK, passing off protects against a false suggestion of endorsement (*Irvine v Talksport* [2002] EWHC 367 (Ch)). A recreation states whose words they are and that it is a recreation, and it never advertises anything.
- The lawyer should confirm both readings for the recreation (§9).

**Defamation.** The words are the person's own, attributed by a named outlet and never trimmed inside a clause. The risk is low but not nil: the source could be wrong. Hence the review of recreations before publication and the 24-hour correction path.

**Political advertising (Regulation (EU) 2024/900).** It covers paid political messages. Our editorial news is not political advertising. We sell no political ads.

**UK broadcasting rules.** Ofcom's Broadcasting Code binds licensed broadcasters, not a YouTube channel. We follow its election rule as good practice (§5.4).

### 2.4 Copyright in the words we say

**Facts are free; their expression is not.**

- Eleven consecutive words can be protected if they express the author's own intellectual creation ([CJEU C-5/08 Infopaq](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62008CJ0005)).
- Press publishers have their own right over online use of their publications, except "very short extracts" ([Directive (EU) 2019/790, Art. 15](https://eur-lex.europa.eu/eli/dir/2019/790/oj)).

**The exceptions we rely on are narrow.**

- **EU.** Reporting current events and quotation "to the extent justified by the informatory purpose" with the source named. The use of political speeches likewise ([Directive 2001/29, Art. 5(3)(c), (d), (f)](https://eur-lex.europa.eu/eli/dir/2001/29/oj)).
- **UK.** Fair dealing for reporting current events with sufficient acknowledgement ([CDPA s.30](https://www.legislation.gov.uk/ukpga/1988/48/section/30)).
- **Spain.** Quotation and the press-review rules ([LPI arts. 32-33](https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930)).
- **None of them covers reading an article out.**

**What we found.** On the real archive, the fallback writer's words are 89 % copies of the articles (§2 of `verbatim.md`). The rule (no run over 12 words outside an attributed quotation, at most 20 % of a story copied) is enforced at publish time, and the writer team owns the fix.

### 2.5 YouTube

- **Altered or synthetic content.** Disclosure is required for "AI-generated or altered content that seems realistic": content that "makes a real person appear to say or do something they didn't do", "alters footage of a real event or place" or "generates a realistic scene that didn't actually occur" ([Help: Disclosing altered or synthetic content](https://support.google.com/youtube/answer/14328491)).
  - Clearly unrealistic content such as animation, and productivity uses such as scripts, are not required ([YouTube blog, 18 Mar 2024](https://blog.youtube/news-and-events/disclosing-ai-generated-content/)).
  - The label appears in the expanded description. For sensitive topics, "health, news, elections, or finance", there is "a more prominent label on the video itself" (same blog).
  - YouTube applies the label itself to content "that contains C2PA metadata", and then the creator cannot change it.
  - Creators who consistently fail to disclose risk removal or suspension from the Partner Program.
  - In the API it is `videos.status.containsSyntheticMedia` ([Data API](https://developers.google.com/youtube/v3/docs/videos)). The `liveBroadcast` resource has no such field ([Live API](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts)), so it is set on the broadcast's video id or in Studio. The lawyer or the publishing team should confirm (§9).
  - **We set it on every upload.** Pixel art might be "clearly unrealistic", but our synthetic voices narrate real news, our recreations put real people's words in a voice that is not theirs, and our C2PA manifest triggers the label anyway.
- **Audience ("made for kids").** YouTube says "we require you to tell us whether or not your videos are made for kids", to help creators "comply with the Children's Online Privacy Protection Act (COPPA)", and "failure to set your content appropriately may result in consequences on YouTube" ([Help: Set your channel or video's audience](https://support.google.com/youtube/answer/9528076)).
  - In the API it is `status.selfDeclaredMadeForKids`, on videos and on live broadcasts alike ([videos](https://developers.google.com/youtube/v3/docs/videos), [liveBroadcasts](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts)).
  - **We set it to `false` everywhere.** News for a general audience is not child-directed, even drawn in pixel art. A pixel-art channel is exactly the kind a reviewer might mistake for a children's one, so we say it on every upload instead of leaving it to a channel default. (Made-for-kids would also switch off comments and personalised ads.)
  - The publish check refuses a YouTube upload without it (§5.5).
- **Inauthentic content (renamed from "repetitious content" on 15 July 2025).** Content must "not be mass-produced, generic, repetitive, or manipulative" ([Channel monetisation policies](https://support.google.com/youtube/answer/1311392)). The same page refuses:
  - "AI-generated content made with generic or unoriginal templates giving the impression of mass production";
  - "content that exclusively features readings of other materials you did not originally create… like text from websites or news feeds" (the verbatim problem again);
  - channels that "use AI-generated personas to deliver information on sensitive topics", such as an AI "doctor" giving health advice, AI hosts "offering financial guidance", and AI personas "giving legal advice or interpreting laws".
  - **Our experts never give advice and never interpret law.** They state what the source reports, attributed. MONEY MINUTE's description says "Not financial advice" (§3.5). The writer team keeps this rule (`verbatim.md` §5).
  - **Variety matters.** Each edition has its own stories, cast, boards and graphics, and the programmes are distinct. The owner should keep it that way.
- **Privacy complaints for AI likenesses.** "If someone has used AI to alter or create synthetic content that looks or sounds like you, you can ask us to remove it" ([Privacy guidelines](https://support.google.com/youtube/answer/7671399)). YouTube weighs whether the content is disclosed as synthetic, whether the person is uniquely identifiable and realistic, parody or public-interest value, and whether a public figure is shown "engaging in a sensitive behavior… endorsing a product or political candidate". Our answer is the register: we take it down everywhere and block the person (§7).

### 2.6 TikTok

- Creators must label realistic AI-generated content, and TikTok "is starting to automatically label AIGC when it's uploaded from certain other platforms" using C2PA Content Credentials ([TikTok newsroom, 9 May 2024](https://newsroom.tiktok.com/en-us/partnering-with-our-industry-to-advance-ai-transparency-and-literacy)).
- The guidelines bar fake authoritative sources or crisis events and public figures shown in certain contexts, such as endorsements, even when labelled ([Integrity and authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity)). That page renders only in a browser, so its wording was checked through secondary summaries: re-read before launch.
- In the API it is `post_info.is_aigc` ([Content Posting API](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)). **We set it on every video.**

### 2.7 Meta (Instagram, Facebook, Threads)

- Meta requires the disclosure tool "when they post organic content with a photorealistic video or realistic-sounding audio that was digitally created or altered". It "may apply penalties" and may add "a more prominent label" ([Meta, Feb 2024](https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/)).
- The label has been "AI info" since 1 July 2024. Meta reads the C2PA and IPTC "AI generated" signals ([Meta, Apr 2024](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/)).
- **Instagram:** `is_ai_generated` on the media container, available since 22 June 2026 ([changelog](https://developers.facebook.com/documentation/instagram-platform/changelog)). **We set it.**
- **Facebook and Threads:** no API flag found. **We rely on C2PA, the frame and the text.** An item with a recreation is refused for those platforms unless the label was set by hand (rule `flag-unavailable`).

### 2.8 X

- X's "synthetic and manipulated media" policy bars synthetic or manipulated media "that may deceive or confuse people and lead to harm", and may label it ([policy](https://help.x.com/en/rules-and-policies/manipulated-media); the page refuses automated fetching, so its text was read through search summaries).
- A "Made with AI" toggle was reported in testing in 2026 (secondary sources). There is no API flag.
- **We disclose in the frame and in the text, and mark the account as automated.**

### 2.9 Bluesky, Mastodon, LinkedIn

- No AI flag in their APIs.
- We use the text prefix, mark the account as a bot where offered (Mastodon has an "automated account" setting), and rely on C2PA, which LinkedIn displays.

## 3. Disclosure on screen, on air and in text

Design rule: **yellow means made by AI.** One plate, in one colour, used everywhere a viewer meets AI. It is the same yellow as the logo's "bit" and the RECREATION plate, so it belongs to the package rather than looking like a sticker. Renders at 4x: `/tmp/claude-0/-home-user-LiveNews/bb6f89cc-3d0e-5d2d-a7ac-e8a89a5d11d7/scratchpad/compliance/`.

### 3.1 The channel mark (the bug)

- **The mark.** A 17 x 13 px yellow plate with the capital **AI** in double-struck 5x7 caps (black on yellow). It has its corners knocked off, a pixel nod to the EU icon's pill, and it docks 1 px to the right of the GLOBIT 24 bug.
- **Always on screen.** It wipes in with the bug and never leaves while the graphics are up: the open's lock-up, the programme, breaking cards. It is drawn by `public/js/graphics/disclosure.js` and `graphics/bug.js`.
- **When it opens.** It opens to **AI · PRODUCED NEWS** (the words in micro caps on a black plate tucked under the yellow) for 8 s:
  - just after the programme's name leaves the top row (one thing at a time);
  - after every break (the graphics come on again);
  - for 6 s every 5 minutes.
- **NEWS IN 60** keeps its name up all the way, so its mark opens with the name.
- These openings are the CoP's "beginning… regular intervals… after interruptions". The persistent "AI" is its "throughout".

### 3.2 Per-programme wording

The noun in the opened mark and the description's line come from `server/compliance/disclosure.js` and `graphics/disclosure.js` (kept equal by a test).

| Programme | Opened mark | Description line (after the channel's first line) |
| --- | --- | --- |
| WORLD NOW | AI · PRODUCED NEWS | WORLD NOW: the stories shaping our world, presented by Paco Pixel and Lola Byte, animated characters with synthetic voices. |
| TECH BYTES | AI · PRODUCED NEWS | technology news, presented by Max Circuit and Ada Volt… |
| COSMOS DESK | AI · PRODUCED NEWS | science, space and our planet, presented by Dr Nova Reyes and UNIT-8… |
| MONEY MINUTE | AI · PRODUCED NEWS | markets and money, presented by Penny Sterling… Not financial advice: the programme reports what its sources say. |
| NEWS IN 60 | AI · PRODUCED NEWS | the headlines in a minute, presented by Sam… |
| WORLD WEATHER | AI · PRODUCED FORECAST | …Written by software from Open-Meteo forecasts and GDACS alerts; no figure is made up. |
| SEVEN DAYS | AI · PRODUCED NEWS | …Told only from what GLOBIT 24 aired this week. |
| FULL TIME | AI · PRODUCED SPORT | the day in sport, presented by Kai and Rosa… |
| PAY ATTENTION | AI · PRODUCED QUIZ | …Every question comes from a story GLOBIT 24 has already aired. |

### 3.3 The ident and the continuity voice

- **The ident** (every break and between programmes) carries a line under the wordmark: **[AI] PRODUCED NEWS · ANIMATED PRESENTERS · SYNTHETIC VOICES**. It is silver body type with a 1 px shadow, still with the wordmark. The star field keeps clear of it.
- **The continuity voice** now opens every break line with "This is GLOBIT 24, AI-produced news." (`public/js/ads/index.js`). The disclosure is heard as well as seen, which matters for people listening rather than watching.

### 3.4 The recreation label

- **AI RECREATION**: the double-struck AI and RECREATION on the yellow plate. Then "— WORDS FROM PUBLIC STATEMENTS" white on black, and under it "SOURCE: <OUTLET>" on ink.
- It sits top right, under the clock, from the first frame of the piece to the last.
- In a clip's 9:16 or 1:1 frame it stacks inside the window, every word whole (§5.1).

### 3.5 Descriptions, captions and posts

`describe(item)` writes, in this order:

1. "AI-produced news: written by AI / by the channel's software from the named sources and presented by animated characters with synthetic voices." This is the line people see before "more".
2. The programme's line, its data line and its advice line.
3. One line per recreation: "Contains an AI RECREATION: the words of Ana Silva, mayor of Lisbon, as reported by Harbour Herald, said by a generic synthetic voice over a pixel-art figure. It is not their real voice or image."
4. The credits (§6).
5. The channel statement.
6. Who answers for the channel, from `EDITORIAL_CONTACT`.

`textPost(item)` starts with **"AI-generated:"**, then the words, the source and the link, within the network's length. The CoP places the label "above or at the top of the text".

**The channel statement** (the About page, every description):

> GLOBIT 24 is AI-produced news. AI systems and the channel's own software write the scripts from the reporting of the news organisations named on screen. The presenters, reporters and experts are animated characters with synthetic voices. Photos and footage are real and credited to their source. When a public figure appears in pixel art, it is a labelled AI RECREATION: their exact reported words in a generic synthetic voice, never their real voice or image.

Why not "AI GENERATED" over the whole picture? Our photos and footage are real. A permanent "generated" stamp over a real news photo would itself mislead. "AI-produced" says what is true: the production is AI, and the pictures are credited.

## 4. Machine-readable marking

**C2PA content credentials: working, verified by reading back.**

- `server/compliance/c2pa.js` `markFile(path, manifest)` signs every exported MP4, MOV, PNG, JPEG, WebP, WAV or MP3 in place. It uses the C2PA SDK's open-source Python binding (`tools/c2pa/c2pa_tool.py`; `pip install -r tools/c2pa/requirements.txt`, c2pa-python 0.38.0, SDK 0.91.0).
- It then reads the manifest back and refuses the file if the manifest is missing or invalid.
- **What the manifest holds:**
  - `c2pa.actions.v2` with `c2pa.created` and the IPTC digital source type `compositeWithTrainedAlgorithmicMedia`;
  - `org.globit24.disclosure`: the statement, the on-air label, what is AI (words, voices) and what is not (pictures), the programme, sources, recreations, credits and editorial contact. It holds no viewer or staff data (guidelines point 94).
- **Signature and time-stamp.** The signature is ES256 with an RFC 3161 time-stamp (`C2PA_TSA`, default DigiCert's public TSA; tried and working here).
- **Tested.** An MP4 and a PNG are signed and read back as `Valid`. Tampering breaks verification. An unmarked file is refused (`test/compliance-c2pa.test.js`).
- **Status of the certificate.**
  - Without `C2PA_CERT` and `C2PA_KEY` the channel makes a **development** certificate chain once in `data/compliance/c2pa/`. The key is readable only by its owner and never enters the repository.
  - Validators then show "signing certificate untrusted", which is expected.
  - For launch we need a certificate from a CA on the C2PA trust list (launch blocker).
- **The live stream.** RTMP ingest re-encodes and carries no C2PA. On air the disclosure is the burned-in mark. The recordings the publisher exports are marked.
- **What could not be installed.**
  - `c2patool`, the C2PA command-line tool, is not installed. GitHub release downloads answer **403** through this environment's proxy. Building it from crates.io needs more disk than the machine has free (96 % full), so the build was stopped.
  - The SDK's Python binding from PyPI is the same open-source C2PA implementation, and it is what we use.

**The second layer, an imperceptible audio watermark: prepared, not active here.**

- **What is ready.** `watermarkFile()` takes the audio track out with ffmpeg, marks it with the embedder (`audiowmark add IN OUT PAYLOAD`), puts it back without touching the picture, and only then signs. A test proves the pipeline with a stand-in embedder.
- **Why it is not running.**
  - audiowmark's release host (uplex.de) and GitHub answer **403** through the proxy.
  - The alternative, the neural AudioSeal (PyPI), needs PyTorch, about 0.7 GB, on a machine with 1.8 GB free shared by other teams.
- **To turn it on:** install audiowmark on the production machine. It is packaged for Homebrew and buildable from source. Then set `AUDIO_WATERMARK=audiowmark`.
- **Until then this is our one gap** against the Code's two layers (the gap analysis in §2.1).

## 5. IN THEIR WORDS, kept and made bulletproof

Everything the feature already does stays:

- exact attributed quotes;
- a generic voice that never imitates;
- the label and the source in every frame;
- public figures only, checked on Wikidata;
- the balance rule and the audit of every recreation;
- never victims, children, private people or the accused.

### 5.1 The label in every frame, also in 9:16

- **Clip frames.** A clip for a vertical or square platform is recorded with `?frame=9x16` (or `9x16@<x>`, `1x1`, `4x5`). A recreation's 9:16 window is `RECREATION_WINDOW` = `9x16@64`, centred on the guest at the lectern. The graphics that carry a disclosure are then laid out inside that window:
  - the bug and the AI mark (its words open only where they fit whole, so a 9:16 window keeps the plate);
  - the label, stacked: AI RECREATION, then WORDS FROM / PUBLIC STATEMENTS, then the source in the package's micro face for sources (SOURCE: CIRCUIT WEEKLY), all above the guest's eyes;
  - the name super: the role wraps to up to four lines on its tag and the name to two, rather than losing a word;
  - the captions, always above the super.
- **Line breaks** fall where a subtitler would put them (`evenLines`): never after a word that binds to the next ("OF", "THE"), at a natural point when one fits (after "SOURCE:", before "OF" or "FROM"), and otherwise where the lines are most even, with no lone word left under the rest. So the tag reads CHIEF EXECUTIVE / OF NIMBUS RAIL, and a long source reads SOURCE: / THE WALL STREET JOURNAL with the outlet's name whole. A role or name that even four lines cannot hold is reported, and the publish check refuses that window: a word is never dropped silently.
- The clock and the ticker stay out of a clip.
- `recreationLayout(rec, frame)` is the single source of where every plate goes. The renderer draws from it and the publish check verifies the crop against it.
- **The publishing desk's vertical picture** is composed again, not cropped (`frame.layout: 'vertical-216x384'`, output 1080 × 1920, scale 5; `docs/publishing/vertical.md`). With `frame.vertical`, `recreationLayout` sets the label for that frame: the plates (AI RECREATION, WORDS FROM PUBLIC STATEMENTS, the source's credit) at the stage's top right inside the platforms' safe column, all in the body face (35 px on 1920), and the role and name at the stage's foot. `checkClip` (`frameGeometry`) reads the same layout, so a vertical clip passes when its label is whole, inside the frame and the stage, and legible at the output size. It is refused as `label-out-of-frame` or `label-illegible` otherwise (`test/compliance-clips.test.js`). The AI mark is checked docked to the bug at (8 + bug width + 1, 10), and the clip draws it once.
- **Tested** on centred, left and right 9:16, 1:1, 4:5 and 3:4 windows with long outlets, names and real long roles (Secretary-General of the United Nations, Director-General of the World Health Organization) (`test/compliance-onair.test.js`). Rendered at 4x in 9:16, 1:1 and 4:5.
- **Legibility.** The label's smallest capitals must be at least 1.6 % of the published picture's height (16 px minimum). These are the body face's 7 px, or the micro face's 5 px for the source in a window, which is 44 px on a 1920 px picture. A whole 16:9 frame shrunk into a 9:16 picture gives 19.7 px on 1920. That fails, and the check says to crop to the window instead.

### 5.2 Provenance and no cut inside a quote

- A clip with a recreation must start at or before the presenter's hand-over line ("This is what Ana Silva, the mayor of Lisbon, said, as reported by Harbour Herald.") and end after the last word.
- **No cut inside a sentence.** It is refused anywhere, and inside a quotation it is a `quote-cut`.
- **The timeline.** It comes from the recorder's report (`timelineFromRecording(episode, report)`: speak, sentence and clip events with their video times) or is given by the publisher.
- **No timeline, no clip.** A clip with a recreation and no timeline is refused.

### 5.3 The platform flag on every upload with a recreation

- YouTube `containsSyntheticMedia`, TikTok `is_aigc` and Instagram `is_ai_generated` are required on every upload. With a recreation, they are *required by the platform's own rule* too.
- Facebook and Threads have no API flag, so they need the label set by hand, recorded as `flags.<platform>.manualLabel`, or the platform left out.
- YouTube's audience setting, `selfDeclaredMadeForKids = false`, is checked on the same line as its synthetic-content flag (§2.5).

### 5.4 Election periods: the rule we decided

**The rule** (`server/compliance/elections.js`).

1. **Candidates.**
   - From **30 days before a national or regional vote or a referendum** to the end of the day after it, **no politician of that country is re-staged**. Candidate lists are never complete, so every politician of the country counts as a candidate.
   - **Named candidates of any vote** in the calendar, local votes included, are held for 14 days before it.
   - **Their words stay as the quote card:** the feature waits and nothing is lost.
   - Officials, scientists and executives are not affected.
2. **Silence.** From the start of the country's legal silence (at least the day before) to the end of polling day, **nothing about that vote is published**, and no politician of that country is re-staged on air.
3. **A stale calendar fails closed.** If the calendar is more than 8 days old (a snap election can be called), **every** politician's recreation stops until it is read again.

**Why.**

- **Platform rules.**
  - YouTube's privacy test weighs a public figure shown "endorsing a… political candidate".
  - TikTok bars realistic AI content of public figures in political endorsements and, in its 2026 election rules (for example Israel's 27 October vote), removes content that "could mislead voters, impersonate politicians" even when labelled (secondary reporting).
  - Meta and the EU's DSA treat AI depictions around elections as a systemic risk.
- **The law.** Silence laws exist in most of Europe:
  - **Spain:** the campaign ends at midnight before polling day, and polls are banned for 5 days ([LOREG arts. 51.3, 53, 69.7](https://www.boe.es/buscar/act.php?id=BOE-A-1985-11672)).
  - **The UK:** "Discussion and analysis of election and referendum issues must finish when the poll opens" ([Ofcom Code rule 6.4](https://www.ofcom.org.uk/tv-radio-and-on-demand/broadcast-codes/broadcast-code/section-six-elections-referendums); good practice for us).
  - **The list:** 50+ countries with their lengths are on Wikipedia, ["Election silence"](https://en.wikipedia.org/wiki/Election_silence). We hold 2 days in Serbia, Greece and others, and 3 in the Czech Republic and Indonesia.
- **Why 30 days.** It covers most official campaign periods: Spain's is 15 days plus the pre-campaign, and the UK's runs about 5 weeks from dissolution. It is long enough that a recreation is never part of a campaign's final stretch.

**The calendar.**

- **Source.** Wikidata's elections with a date, a country and a level, and their candidates where Wikidata lists them (`tools/compliance/elections.mjs`, committed in `server/compliance/elections.json`). The server reads it again every day into `data/compliance/elections.json`.
- **Today (17 Oct 2026)** it holds 84 votes in the next 75 days:
  - United States, 3 Nov (all US politicians held now);
  - Brazil, Bulgaria and Serbia, 25 Oct;
  - Israel, 27 Oct;
  - New Zealand, 7 Nov;
  - **Spain, 29 Nov** (held from 30 Oct).

**Where it is enforced.**

- **On air,** before a booking: `restageCheck` and `restageHold` with the server's calendar (`configureRestage` in `server/index.js`), and the producer's guests stage after the Wikidata identity. The identity now brings the person's citizenship (Wikidata P27).
- **At publish time,** with the publish date: `checkClip`, rules `election-hold` and `election-silence`.

### 5.5 The publish-time check refuses

`checkClip` and `preflight` refuse, never just warn, on any of these rules:

| Group | Rules |
| --- | --- |
| Recreations and cuts | `provenance-missing`, `quote-cut`, `sentence-cut`, `timeline-missing` |
| Labels in the frame | `label-out-of-frame`, `label-illegible`, `mark-out-of-frame` |
| Platform flags | `flag-missing`, `flag-unavailable` |
| Elections | `election-hold`, `election-silence` |
| Register and review | `blocked`, `review-missing` |
| Content | `demo`, `rights-missing`, `not-publishable`, `verbatim`, `offline-writer` (an episode the offline fallback writer wrote: never published, `verbatim.md` §7) |
| Files and text | `unmarked`, `file-missing`, `text-disclosure-missing` |
| Responsibility | `editorial-contact-missing` |

## 6. Credits and rights

**Rights records.**

- Every asset that can reach air or a file has a record in `server/compliance/rights.json`: its class, owner, licence, credit and whether the credit is required.
- `test/compliance-credits.test.js` **fails when any asset file in the repository has no record**. It scans media, fonts, models and data, 240 files today, all classified.
- The same test fails when an episode puts on screen a picture or clip without a record.
- `preflight` refuses such an export (`rights-missing`). On air, `RIGHTS_GATE=strict` takes the asset off: the story keeps its map or card.

**Audit result (17 Oct).**

| Asset | Licence | Credit, where | Status |
| --- | --- | --- | --- |
| Presenters, sets, graphics, logo, fonts, opens, press room | original | none needed | ok |
| Music, signatures, stingers, sound effects | original (WebAudio) | none needed | ok |
| Synthetic voices (open-source text-to-speech engine and voices) | Apache-2.0 | description: "Voices: synthetic…" (not required) | ok |
| World map (Natural Earth 1:50m via world-atlas) | public domain | description: "Map data: Natural Earth" (not required) | ok |
| WORLD WEATHER data (Open-Meteo) | **CC BY 4.0** | on screen: "DATA: OPEN-METEO.COM (CC BY 4.0) · GDACS". Before it read only "OPEN-METEO". Description: "Weather data by Open-Meteo.com (CC BY 4.0), processed into maps and icons by GLOBIT 24" | credit fixed. **The free API is non-commercial only**: a monetised channel needs a paid plan (**launch blocker**) |
| Weather alerts (GDACS) | terms of use, March 2025: no licence stated; "not meant to substitute… official" alerts | on screen "GDACS". Description: "Alerts: GDACS (UN / European Commission)". The weather writer should say national services issue the official warnings | ok, with the note |
| Identity and election data (Wikidata) | CC0 | none needed, never shown | ok |
| FILE footage (Wikimedia Commons) | per file: CC0, public domain, CC BY, CC BY-SA | on screen "FILE · author · licence". Description: "Footage: author (licence, Wikimedia Commons)" | ok |
| Story pictures | per item | on screen "PHOTO: …" or "FILE · …" | **an outlet's own photo has no licence on record**: refused for export; on air only with `RIGHTS_GATE=strict` off. The cleared-pictures pipeline (another team) gives each picture an `imageRights` record |
| News reporting (facts, quotes) | facts free; quotations attributed | on screen the source plate. Description: "Reporting: <outlets>" | ok (the verbatim rule in §2.4) |
| Fixture pictures and pages (offline demo) | original | none | never published (`publish: false`) |
| Lab voice and music samples | original | none | never on air |

### 6.1 The outlets' pages: robots.txt

The news desk reads two things from an outlet: its **feed** (which the outlet publishes to be read, and which the
operator subscribed to) and, for a story, its **article page**: the first paragraphs for the writer
(`news.js` `readArticle`), and the page's or its AMP page's picture when the feed gave none or a small one
(`pagePictures`, `resolveImage`, also for another outlet's report of the same event). Since round 6 every page read
obeys the outlet's robots.txt (`server/robots.js`, RFC 9309). The feeds are not checked.

- **Which rules.** The group naming our token (`GLOBIT24`, or `GLOBIT`; any case, with or without a version or a
  hyphen), all such groups combined; else the `*` groups; else none. Tokens are compared exactly, never as substrings:
  a group for "bot", "news" or "Mozilla" is not ours. The longest matching Allow or Disallow decides, an Allow wins a
  tie, and `*` and `$` work as the RFC says, on the path and the query.
- **Which answers.** A file (2xx) is obeyed. A 4xx means no file: everything allowed (a 404 or 410 for the day, any
  other 4xx, such as a bot shield's 403, for the hour). A 5xx, a 429, a network failure, a timeout or more than five
  redirects means everything is disallowed until the next try, 30 minutes later.
- **The cache.** A file is kept about 24 hours, in memory and in `data/robots/` (one small JSON file per origin with
  only the rules that apply to us; an origin not read for a week is forgotten). Each origin's file is read once at a
  time, however many stories ask.
- **Crawl-delay** in the group we obey spaces our page requests to that origin; a page whose turn is more than
  3 seconds off is left for the reader's next pass.
- **A refused page is never requested**, on any redirect hop either. The story keeps its feed's text and pictures and
  is marked `pageRefused: 'robots'` (shown in the desk view); the article cache keeps only the feed's text for it, and
  an article text kept for that link before is replaced or removed. An unreachable robots.txt only defers the page.
- **Beyond the RFC.** An origin whose page answers 401, 403 or 429 is not asked for another page for six hours (30
  minutes after a 429). A page is opened at its own address, without the tags a feed adds to count its visits
  (`utm_*`, the BBC's `at_medium`/`at_campaign`, DW's `maca`, Al Jazeera's `traffic_source`, click ids): `news.js`
  `pageUrl`. The robots.txt check applies to that address.
- **The user-agent** is `Mozilla/5.0 (compatible; GLOBIT24/1.0; +https://github.com/choco-studio/livenews)`: the
  channel's name and the repository, never an e-mail. It replaced `LiveNewsBot/0.1` in the news desk, the picture
  downloads and the tools.
- **The tools** that open pages go through the same door: the sport snapshot and the length tools (through the
  desk's `fetchText`), and the verbatim audit (`tools/compliance/verbatim-audit.mjs`), which also drops a cached
  article text whose page robots.txt now keeps from us.

**Today's outlets, read live** (17 Oct, about 18:00 UTC; `node tools/compliance/robots-report.mjs --sample 2`):

- 31 feeds, 393 stories with an article link, **17 hosts**. Every file was read. None names `GLOBIT24` or `GLOBIT`:
  the `*` group applies everywhere. The files name 458 product tokens between them, and none of them is ours or close
  to a word of our user-agent. Most of the named groups shut out AI-training and data crawlers by name.
- **No host keeps an article address from us.** No `*` group of those 17 sets a Crawl-delay. France 24's `*` group
  has no rule at all; the others keep search, previews, APIs, scripts and the like (1 to 107 rules).
- Two feeds gave no story today. ESA's `*` group sets **Crawl-delay: 2**, which the desk honours. CBC's robots.txt
  timed out from here (its feed too): its pages wait until the file answers.
- **Al Jazeera** keeps the tagged copies of its pages from every crawler (`Disallow: /*?traffic_source=`, and the same
  for `fbclid`, `gb`, `q` and `playlist`), and its feed tags every link `?traffic_source=rss`. As tagged, all 25 of
  today's links (and 238 of the 1,430 links in the archive) would be refused; at their own address, all are open, and
  that is how the desk opens them.
- **Sky News** answers our robots.txt request with a 403 from its bot shield, and its pages answer 403 too. The RFC
  reads that as "allowed", but nothing is read there, as before; now one try per six hours instead of one per story.
  The desk never poses as a browser.
- **Euronews** answered the first read of two runs with a 406 and the next with its file (its `*` group keeps only
  `/api/` and scripts). A 406 counts as "no file" for one hour, then the file is read again.
- **The pictures.** The desk downloads a picture its feed names, or one an open page names, without asking the
  picture host's robots.txt (a picture is not a page the desk crawls, and the story keeps its feed's pictures, as
  asked). Read for the record: today's feed pictures live on 15 hosts (`i.guim.co.uk`, `ichef.bbci.co.uk`,
  `s.abcnews.com`, Sky's `365dm.com` and others), and none of their files keeps a picture from us (two have no file,
  one answers 403).
- **What the writer loses: nothing today** (0 of 393 stories). Had the desk opened the feed's tagged links, Al
  Jazeera's 25 stories would have lost their article text (about 1,900 characters on average where a page is read, 34
  pages sampled) and been written from a 100-character summary: Al Jazeera's feed gives no full text.

## 7. Takedown and correction workflow

**1. Receive.**

- Complaints arrive by e-mail at `EDITORIAL_CONTACT` (in every description and on the About page), through platform notices (YouTube privacy complaints, copyright notices, Meta or TikTok reports), by letter, or through a missing-label report.
- Each is logged **the moment it arrives**, by the owner or by whoever reads the inbox, in one command:
  `node tools/compliance/cli.mjs complaint add --category privacy-likeness --person "Name" --url <link> --from "…" --text "…"`
  (in code: `register.fileComplaint({ receivedAt, channel, from, contact, about: { url | remote: { platform, remoteId } | itemId | storyId | person }, category, text })`).
- The running server sees it at once: its register re-reads the file before every check, so no new recreation of the person is made from that moment.

**2. Hold at once.** Logging a complaint about a person, a story or an item holds new publications of it (a *precaution* block) until it is triaged.

**3. Deadlines** (`CATEGORIES`):

| Category | Acknowledge within | Act within |
| --- | --- | --- |
| `privacy-likeness` | 24 h | 24 h |
| `defamation` | 24 h | 24 h |
| `inaccuracy` | 24 h | 24 h |
| `copyright` | 24 h | 24 h |
| `election` | 6 h | 6 h |
| `harm` (a victim, a child, a private person or someone accused) | 6 h | 6 h |
| `disclosure` | 24 h | 48 h |
| `platform` notices | 24 h | 24 h |
| `other` | 72 h | 7 days |

On a privacy complaint YouTube "may give the creator time to remove or edit" the content (its privacy guidelines give no fixed time). We act within the hours above. `register.overdue()` lists anything late.

**4. Triage.** `cli.mjs complaint triage <id> --decision … --reason …` (in code `register.triage(id, { decision, scope, reason, by })`) with one of these decisions:

| Decision | What it does |
| --- | --- |
| `remove` | Take the item down |
| `unlist` | Hide the item without deleting it |
| `correct` | Fix the item where it stands |
| `block-person` | Take down everything with the person and keep them off air |
| `reject` | No action, with a reason |
| `escalate` | Pass it to the lawyer: defamation threats, court papers, regulators |

**5. Act everywhere.**

- The triage returns one action per live publication in scope, on **every platform**:
  - the item named;
  - the clips and Shorts cut from it;
  - with a person named, every publication holding their recreation;
  - with a story named, every publication telling it.
- `remove` and `block-person` also block the person, story or item from air (the producer's restage check reads the register) and from future publication.
- The publisher performs each deletion or edit and reports it: `register.actionDone(actionId, { ok, result })`. A failed action stays open and is retried.

**6. Correct.**

- `register.correction({ about, text, onAir: true })` queues a correction. It is read in the programme's next edition (`pendingCorrections()`, then `correctionAired()`), and it is added to and pinned in each publication's description.

**7. Close.**

- `register.close(id, { outcome, reply })` (`cli.mjs complaint close <id> --outcome … --reply …`) succeeds only when every action is done. The reply to the complainant is recorded.
- `cli.mjs complaints --open`, `complaints --overdue` and `actions` show what is waiting.

**8. Records.**

- Everything lives in `data/compliance/register.jsonl`, one event per line and append-only.
- It is the audit trail for a regulator or a court. A second process (the publisher, the inbox tool) sees new blocks at once.
- Back it up with `data/`.

**Who does it.**

- The owner decides triage and the lawyer handles escalations.
- The publishing system executes the actions.
- The inbox can be read by an assistant, but **a decision to reject a likeness, harm or defamation complaint is always the owner's**.

## 8. The compliance API (contract for `tools/publish/` and `server/publish/`)

All in `server/compliance/index.js`. Nothing in it uploads. Every function is pure, or reads only the register, the election calendar and the files it is given.

| Function | Input | Output |
| --- | --- | --- |
| `disclosureFor(item)` | `{ kind: 'live'\|'episode'\|'clip'\|'short'\|'text'\|'image', episode?, programId?, recreations?, platforms?, writer? }` | `{ kind, programme, writer, ai, recreations, labels: { onAir, mark, recreation?, textPrefix }, description: { opening, lines }, channel, platforms: { youtube: { field, containsSyntheticMedia, audienceField, selfDeclaredMadeForKids: false, required, prominentLabel, descriptionTop }, tiktok: { field, is_aigc, … }, instagram: { field, is_ai_generated, … }, facebook\|threads: { field: null, manualLabel, c2pa }, x\|bluesky\|mastodon\|linkedin: { textTop, … } } }` |
| `describe(item, { credits, summary })` | as above | the description text, disclosure first |
| `textPost(item, { max })` | `{ text, source, link }` | the post, "AI-generated:" first, within `max` |
| `creditsFor(item)` | `{ episode }` or an episode | `["Reporting: …", "Pictures: …", "Footage: …", "Weather data by Open-Meteo.com (CC BY 4.0)…", "Map data: Natural Earth", "Voices: synthetic…", "Presenters, sets, graphics and music: original…"]` |
| `auditItem(item)` | same | `{ assets, missing, credits }` |
| `checkClip(clip, opts)` | `{ id, kind, episode, range: { start, end }, timeline? \| recording?, frame?: { crop, output, place, window }, platforms, flags, text?, publishAt? }`; `opts: { now, calendar, register, requireReview, dataDir }` | `{ ok, violations: [{ rule, message, … }], warnings, recreations, disclosure }` |
| `timelineFromRecording(episode, report)` | the episode and `tools/record.mjs --report` | `[{ start, end, text, slot, segIndex, kind: 'speech'\|'provenance'\|'recreation', recreationId, quote }]` |
| `markFile(path, manifest, opts)` | a file and `buildManifest(item, { title, sources, credits })` | `{ ok, path, label, validation, timestamped, devCert, aiGenerated, watermark }`. Throws if it cannot mark |
| `readMark(path)` | a file | `{ ok, aiGenerated, sourceType, disclosure, validation, state, signer }` |
| `lintEpisode(episode, { getStory, strict })` | the episode and the stories' `{ title, summary, body }` | `{ ok, stories, violations }` |
| `archiveSample({ dataDir, cacheDir, limit })` | the archive (`data/archive`) and the audit's article cache | `{ stories, violating, rate, withArticle, examples }` |
| `archiveGetStory({ dataDir, cacheDir })` | same | `getStory(id)` for `lintEpisode` and `preflight` when the news desk is not at hand |
| `preflight(item, opts)` | a clip (as above) plus `{ files, text, sourceTexts }` (a text post's story sources: the outlet's title, summary and article, measured with the verbatim rule; an attributed quotation is exempt); `opts` also `{ getStory, verbatim: 'block'\|'warn', env }` | `{ ok, violations, warnings, disclosure, credits, description, recreations }` |
| `launchReport({ env, dataDir })` | the environment and the archive | `{ ready, blockers, warnings, c2pa, watermark, calendar, verbatim }` |
| `ComplianceRegister` | `{ dir }` (the server's: `sharedRegister(dataDir)`) | publications, reviews, complaints, triage, actions, blocks, corrections (§7) |

**The publisher's sequence for one item.**

1. Record the episode with `tools/record.mjs --report` (vertical: add `&frame=9x16` to the URL).
2. Build the timeline and choose the range.
3. For a recreation, get the owner's `recordReview`.
4. Export the file and run `markFile` (and on the thumbnail too).
5. Run `preflight(item, { register, getStory })`. **Stop if not ok.**
6. Upload with the flags from `disclosureFor` (on YouTube both `containsSyntheticMedia: true` and `selfDeclaredMadeForKids: false`) and the text from `describe` or `textPost`.
7. Run `recordPublication({ itemId, parentId, platform, remoteId, url, storyIds, recreations: result.recreations, flags, manifest })`.
8. Poll `register.openActions()` and perform them.

**Errors.** Violations are data, not exceptions: show them to the owner and do not upload. Only `markFile` throws, when a file cannot be marked. An unmarked file is never uploaded.

**The operator's command line** (`tools/compliance/cli.mjs`, reading `DATA_DIR` or `data/`):

| Command | What it does | Exit code |
| --- | --- | --- |
| `launch` | the launch report (§9) | 1 while a blocker stands |
| `check <item.json>` | `preflight` of a saved item, its stories checked against the archive's sources | 1 when refused |
| `mark <file> [--item <item.json>]`, `read <file>` | sign a file, read its manifest back | |
| `complaint add \| triage \| done \| close` | the register's steps (§7) | 2 on a bad category |
| `complaints [--open \| --overdue]`, `actions` | what is waiting | |

## 9. Before launch

**For the lawyer to confirm.**

1. **Provider or deployer.** Is GLOBIT 24 a *provider* under Art. 50(2) (our composite system), so that marking is due from launch with no December grace? Is a C2PA manifest plus visible marks, without a watermark, adequate until the watermark runs?
2. **Recreations.** Are they deep fakes under Art. 3(60), as the channel labels them? Do they need consent or carry risk under Spanish image and voice rights (LO 1/1982), UK passing off and false endorsement, and defamation? What legal basis and notice does GDPR need?
3. **Editorial exemption.** Does the owner's review of programmes and clips qualify under Art. 50(4) second subparagraph (we disclose anyway)? What must the published editorial contact contain (EMFA Art. 6, if we are a media service provider)?
4. **Copyright of text.** Do the 12-word run and 20 % share rule (`verbatim.md`) suffice under Infopaq, the press publishers' right (Art. 15 DSM) and UK fair dealing? Is the fallback writer's current output (89 % verbatim) acceptable on the live stream in the meantime?
5. **Spain.** What sanctions, dates and AESIA procedure apply under the AI governance bill once passed? Do Ley 13/2022 obligations for "usuarios de especial relevancia" apply, and when?
6. **Data and pictures.** Can Open-Meteo be used commercially (paid plan), and do the Met Office's CC BY-SA terms apply to the forecasts it blends? Confirm the GDACS terms. Agree the cleared-pictures licences with the other team.
7. **Elections.** Is the rule (30 days, silence periods, fail closed) proportionate? Do the EU political advertising rules (Regulation 2024/900) touch anything we do?
8. **Platforms.** Confirm the YouTube live disclosure path and TikTok's current guideline wording, which could not be read from here.
9. **General media law for the news text.** These are not AI rules, but every news outlet has them, and the writer and the cast follow whatever the lawyer sets: contempt of court and reporting restrictions in the UK (active proceedings, anonymity orders); the anonymity of victims of sexual offences and of minors in the UK and in Spain; the Spanish right of reply (LO 2/1984) and how fast it must be answered; and what an AI presenter may say about someone accused but not convicted.
10. **Outlet headlines in posts and descriptions.** The publishing desk posts in the channel's own words and shows an
   outlet's headline only as an attributed citation, whole and in quotation marks, beside the link to the outlet's
   article. The networks' link cards show it too, and Bluesky's card is built from it. The full programmes' descriptions
   list each source the same way. In the UK, *NLA v Meltwater* ([2011] EWCA Civ 890) held that a headline can be a
   literary work in its own right. In the EU, the press publishers' right (Art. 15 DSM, Directive 2019/790) leaves
   hyperlinking and "individual words or very short extracts" free. Confirm that a whole headline, quoted and
   attributed with its link, is free use: a "very short extract", or a quotation (Art. 5(3)(d) InfoSoc; UK CDPA s. 30).
   Confirm the same for the channel's on-screen strap and a clip's hook, which show the aired headline with the source
   credited beneath.
11. **Keeping the articles' text for the checks** (`server/articlecache.js`, `verbatim.md` §4). For each story the
   channel airs, the archive keeps the text the news desk already read for the writer:
   - the article page's first paragraphs (2,400 characters at most), or else the feed's own full text;
   - text only, at most 6,000 characters, for 14 days;
   - never published, and used only to check that what the channel publishes does not copy the outlet.

   Since round 6 the news desk's reader obeys each outlet's robots.txt (§6.1): a page it keeps from us is never read,
   and the cache keeps only the feed's text for that story. The cache fetches nothing of its own, but keeps what the
   reader read. Confirm that keeping these extracts is allowed:
   - for verifying the channel's own output: the text and data mining exception (Art. 4 DSM, with its opt-out
     honoured), or the temporary copies exception (Art. 5(1) InfoSoc);
   - for each outlet whose terms forbid it (item 12).

   The switches are `ARTICLE_CACHE=off` (nothing kept) and `"cache": false` on a feed in `config/feeds.json` (that
   outlet never kept).
12. **The outlets' terms, beyond robots.txt.** The reader obeys robots.txt (§6.1), and on 17 Oct no outlet keeps an
   article address from us. But robots.txt is not the whole answer:
   - an outlet's terms of use may forbid automated reading, or reuse of its text, even where its robots.txt allows
     it. Do those terms bind a reader that never signed or clicked them, and which outlets' terms forbid what we do?
     (Today's 31 feeds come from 17 organisations; their terms have not been read for this.)
   - most of today's files shut out AI-training crawlers by name. Our reader is not one (it reads a story's first
     paragraphs for a writer that rewrites them, and keeps them to check the channel does not copy), and its token is
     not named, so the `*` group applies. Does a reservation aimed at those crawlers, or a general "no text and data
     mining" in the terms, count as an Art. 4(3) DSM opt-out against our use?
   - the desk opens a page without the feed's tracking tags (§6.1: Al Jazeera keeps the tagged copies from crawlers,
     not the articles). Confirm that this reading of the file is sound.
   - Sky News's bot shield refuses our robots.txt request and our pages (403). The RFC reads a 4xx as "allowed", but
     the desk reads nothing there. Confirm that it should keep trying (once per six hours) rather than never.
   - the feeds themselves and the pictures are read without robots.txt (a feed is published to be read; a picture is
     not a page). On 17 Oct no picture host's file kept a picture from us. Confirm that a feed's terms allow
     broadcasting from it with credit.

**What the launch report blocks on today** (`node tools/compliance/cli.mjs launch`, or `launchReport()`):

- the C2PA development certificate (a trusted one is needed);
- `EDITORIAL_CONTACT` is not set;
- `RIGHTS_GATE` is not strict;
- the Open-Meteo commercial plan;
- **the verbatim rule on what aired.** The report reads the last 300 real stories of `data/archive` and blocks while more than 5 % of them break the rule. On today's archive it is **80.3 %** (241 of 300) against the outlets' titles and summaries alone. That is a floor: with the articles, which the audit tool caches in `data/compliance/articles`, the same 300 stories give **99 %**. The live stream has no publish check of its own, so this is the check that holds it back. It clears when the writer team's composed sentences are on air, measured with the same code.

The audio watermark is a warning.
