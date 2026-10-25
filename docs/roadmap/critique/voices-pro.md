# Professional voices (25 Oct)

The owner, 25 Oct: "Ponte con lo de las voces a nivel profesional" (and on 16 Oct: "las voces nuevas suenan
artificiales"). This page holds the research, the decision the owner has to make, and what is built so the switch is
one setting.

## 1. Where Kokoro stands

Kokoro-82M, the channel's engine since September, runs on the server's CPU for nothing. The 16 Oct round took it as
far as it goes (`voices-naturalness.md`: the best blends, the accents fixed, the processing that hurt taken out). It
is still **#57 of the Artificial Analysis Speech Arena** (blind votes, read 25 Oct 2026: Elo 1066). Every engine in
that top ten would be picked over it by listeners about 74 % (#10) to 83 % (#1) of the time.

No open-source model with a commercial licence beats it clearly *and* runs on a CPU server:

- Ming-3.0-tts (MIT, #19) is the only real step up. It needs a GPU of about €104–214 a month, as much as a
  commercial engine.
- Chatterbox, Maya1, Magpie and Qwen3-TTS are level with Kokoro or below it.
- The best open models are non-commercial (Breeze TTS 2, Voxtral, Higgs, F5-TTS, XTTS-v2; VibeVoice is "research
  only").

**Professional quality means a commercial engine.**

## 2. The commercial engines (read 25 Oct 2026; € at the ECB rate of 23 Oct)

Monthly cost at 4, 8 and 12 hours of new speech a day (6.5, 13 and 19.4 million characters a month):

| Engine | Arena rank | €/month at 4 / 8 / 12 h | Word timings | Notes |
|---|---|---|---|---|
| ElevenLabs Eleven v4 Turbo | #1 | 232 / 463 / 695 | character alignment | the best rated; voice design; paid plans commercial; IPA and pronunciation dictionaries |
| ElevenLabs Eleven v4 | #2 | 463 / 926 / 1,389 | character alignment | tied with v4 Turbo at twice the price |
| Cartesia Sonic 3.6 | #4 | 254 / 436 / 656 | word and phoneme | trains on customer data unless opted out |
| Gemini 3.8 Flash TTS (Preview) | #5 | 175 / 350 / 525 (Batch: half; half again until 31 Dec 2026) | none: forced alignment needed | Preview; price doubles on 1 Jan 2027 |
| **Inworld Realtime TTS-2** | **#6** | **101 / 203 / 268** (Batch about 20 % less) | **word, phoneme, viseme** | `STABLE` delivery, IPA, voice design, commercial licence on every plan (broadcast use to be confirmed in writing) |
| Speechify Simba 3.2 | #10 | 50 / 88 / 131 | word speech marks | British voice coverage not checked |
| Inworld TTS-2 Flash | #13 | 58 / 104 / 156 | as TTS-2 | |

Out of the running: OpenAI's TTS models are shut down on 6 Jan 2027, Hume's TTS API ends on 13 Nov 2026, and Azure HD
(#30) and Polly/Chirp (#56–60) are no better than mid-table.

Sources: [Artificial Analysis leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard),
[TTS Arena v2](https://tts-agi-tts-arena-v2.hf.space/api/leaderboard),
[ElevenLabs pricing](https://elevenlabs.io/pricing/api), [ElevenLabs terms](https://elevenlabs.io/terms-of-use),
[ElevenLabs timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps),
[Inworld pricing](https://inworld.ai/pricing), [Inworld terms](https://inworld.ai/terms),
[Inworld synthesis](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech),
[Inworld voice design](https://docs.inworld.ai/tts/voice-design.md),
[Cartesia pricing](https://cartesia.ai/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Speechify pricing](https://speechify.ai/pricing), [OpenAI TTS](https://developers.openai.com/api/docs/guides/text-to-speech),
[Hume TTS](https://dev.hume.ai/docs/text-to-speech-tts/overview).

## 3. The recommendation

- **Up to about €100 a month:** Inworld TTS-2 (#6), at 4 hours a day, through the Batch API. At 8–12 hours,
  Inworld TTS-2 Flash (#13, €104–156). Speechify (#10) is the cheapest top-ten engine, once its British voices are
  checked.
- **Up to €500 a month:** Inworld TTS-2 at any volume (€101–268), or ElevenLabs v4 Turbo (#1) up to about 8 hours
  (€232–463).
- **The best, whatever it costs:** ElevenLabs v4 Turbo, on an Enterprise contract (SLA, data processing, zero
  retention), with Inworld as the second vendor and Kokoro as the fallback.

**Either way, the owner chooses by ear.** The arena judges short clips of stock voices; our test is long news reads
by designed voices. The bake-off (§5) renders the channel's own lines with each engine for a blind comparison, and
puts our own measures (word errors, the predicted listening score, the accent) beside it.

## 4. What is built (ready; off until `VOICE_PRO` is set)

- **The engine** (`tools/voice/pro.py`, in the voice worker):
  - It reads a segment in one request, from the planner's newsreader text, so the engine reads it as a paragraph. A
    segment longer than a request takes (Inworld: 2,000 characters) goes in pieces cut between phrases, each told
    what came before it, so the reading runs on.
  - It takes the engine's own word timings (Inworld: word alignment; ElevenLabs: character alignment) for the
    captions and the lips. Kokoro's are estimated.
  - It sets the pauses between the planner's phrases to the programme's own (the pacing bible), cut at the engine's
    word boundaries. A breath in a pause goes with the cut (the owner's rule).
  - Then the channel's broadcast chain: the same loudness and peaks, and UNIT-8's robot effect.
  - Anything that fails (no key, the network, the vendor, an engine that reads other words than the text) falls back
    to Kokoro, and says so.
- **The service** (`server/voice/service.js`):
  - `VOICE_PRO=inworld|elevenlabs` picks the engine. Each presenter with a voice there gets it
    (`server/voice/procast.json`); the others keep Kokoro.
  - `VOICE_PRO_MONTHLY_CHARS` (6.5 million, about 4 hours a day) is the bill's ceiling: past it, Kokoro until the
    month turns. Use is counted in `data/voice/pro-usage.json`.
  - A clip Kokoro read in place of the engine is voiced again after 30 minutes. A Kokoro clip keeps the name it had,
    so nothing on the server is voiced again on deploy.
- **Kept on Kokoro on purpose:**
  - **The recreated public figures**: a generic voice is the channel's rule, and every vendor bans impersonating
    officials, some even with a label.
  - **The adverts.**
- **The voices** (`server/voice/procast.json`): a brief for each of the 23 characters (age, accent, timbre, pace,
  manner; "no breaths, no laughter"; never "like" anyone real). The vendor's voice design builds the voice from it.
- **The casting** (`tools/voice/pro-design.mjs`): three candidates a character, each reading a line of its own
  programme. A page lets the owner listen and choose (`--page`); the pick is kept in the account and written down
  (`--pick paco=2`).
- **The bake-off**:
  - `tools/voice/audit-requests.mjs --pro <engine>` builds the requests; `tools/voice/audit.py render` renders them
    through the same router as the worker. In the audit, a professional clip never falls back silently.
  - `audit.py measure` and `compare` measure them as the Kokoro voices were measured.
  - `tools/voice/bakeoff-page.mjs` makes the blind page: the same lines by each engine, letters shuffled per
    character, the key kept apart.
- **Tests**:
  - `tools/voice/test_pro.py` (run by `test/voice-pro.test.js`): stand-ins for both vendors, exact word timings, the
    pauses, every fallback.
  - `test/voice-pro.test.js`: the service, the ceiling, the clip names, the design tool.

## 5. The steps (the owner's, then ours)

1. **The owner chooses a budget** (the table in §2), and so the engine(s) to try: ideally two, Inworld and ElevenLabs.
2. **The owner opens the account(s)** and creates an API key. The owner types it on their own screen; it never goes
   in a chat:
   - for the samples, in this work environment's settings (the cloud environment menu > Edit > secrets), as
     `INWORLD_API_KEY` and/or `ELEVENLABS_API_KEY`;
   - for the channel, in `/etc/globit24.env` on the server.
3. **Casting** (cost: a few cents of preview lines):
   ```
   node tools/voice/pro-design.mjs --engine inworld
   node tools/voice/pro-design.mjs --engine inworld --page
   ```
   The owner picks per character, then `--pick paco=2,lola=1,...`.
4. **The bake-off** on the chosen voices:
   ```
   node tools/voice/audit-requests.mjs --out k.jsonl
   node tools/voice/audit-requests.mjs --pro inworld --out i.jsonl
   python3 tools/voice/audit.py render --reqs k.jsonl --out clips-k     # and the same for clips-i
   python3 tools/voice/audit.py measure --dir clips-i --json i.json [--scorer …]
   node tools/voice/bakeoff-page.mjs --dir kokoro=clips-k --dir inworld=clips-i --out data/voice/bakeoff
   ```
5. **The owner's ear decides.** Then on the server: `VOICE_PRO=inworld` (or `elevenlabs`) and
   `VOICE_PRO_MONTHLY_CHARS` set to the budget, in `/etc/globit24.env`, and a restart.

## 6. Risks

- **Prices and models change.** Gemini doubles on 1 Jan 2027; vendors retire models (OpenAI, Hume). The ceiling caps
  the bill. Kokoro stays the fallback, and the voice briefs let a voice be designed again elsewhere.
- **A vendor's update can change a voice.** The bake-off's measures are the reference: run them again after an update.
- **Terms:**
  - Inworld's licence speaks of "internal business purposes": get broadcast use confirmed in writing.
  - Cartesia trains on data unless opted out.
  - Microsoft, ElevenLabs, Google and Cartesia ban impersonation (hence the recreations stay on Kokoro).
- **Disclosure**: unchanged. The ident and the descriptions already say the presenters are AI characters with
  synthetic voices (`docs/publishing/compliance.md`).
- **The owner's rules**: expressive engines can add breaths. `STABLE` delivery (Inworld) and steady settings
  (ElevenLabs) are the defaults, the pauses are cut clean, and the owner's ear is the last check.
