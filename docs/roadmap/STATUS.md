# V2 round status (maintained by the orchestrator; check before integrating with another area)
Running (wave 1): editorial-2 (round 2 on the final critique's 39 defects; owns server/** except inbox/voice), showcase (inbox AI provider + tools/showcase recording with sound), ads-1, ads-2, ads-3 (relaunched 17:18 with the adult tone), audio, opens, graphics, music team, voices team.
Finished: editorial round 1 (critics 5-6/10 → editorial-2 launched); style bibles docs/programmes/{world-now,money-minute,tech-bytes,news-60,cosmos,channel-and-breaks}.md (web verification was limited: many claims tagged as search summaries; each file ends with requests to other teams — collected for the integration wave); foundation bake-off — OWNER PICKED PROTOTYPE A (canvas25d), now in public/js/v2/canvas25d/.
WAVE 2 RUNNING (19:05): w2-hands, w2-cast-a, w2-cast-b, w2-face, w2-set, w2-camera, w2-integ — plan in PLAN.md rev 2 / wave2-plan.json. After all 7 finish: post-merge INTEG round (PLAN §7), then the final POLISH + 24/7 SOAK wave.

## 19:37 — container restart recovery
Container restarted ~19:30; all 17 workflows were killed. Repo clean at 0585552 (nothing lost). All 17 resumed via
resumeFromRunId with their stored args (completed agent calls return cached): w2-hands, w2-cast-a, w2-cast-b, w2-face,
w2-set, w2-camera, w2-integ, music, voices, showcase, ads-1, ads-2, ads-3, audio, opens, graphics, editorial-2.
Agents that were mid-flight restart their current step from scratch (their file edits on disk survived).

## 20:21 — graphics + audio extra rounds
graphics finished r3 critique at 7/8 with majors (montage caption dup on v1 path, ticker too fast vs 24/7 pace, one-line caption paging churn, missing £/¥/[ ] glyphs, NEWS IN 60 progress + MONEY MINUTE figures not wired) → resumed with rounds=3 (wzl2ywbt5).
audio finished r2 critique 7.5/5 with a BLOCKER (ad beds lose their opening chord: LATE_OK drop) + majors (cue beat-0 drops, open chord not ducked under greeting, muffled presets) → resumed with rounds=2 (wmj2uirkc).

## 22:24 — usage limit hit at ~20:40 (all agents failed 'session limit, resets 22:20'); container restarted again
Relaunched 6 priority workflows: w2-integ, w2-hands, showcase, editorial-2, w2-face, w2-set. Pending relaunch (keep ≤8 running): audio(r2) graphics(r3) opens ads-1 ads-2 ads-3 w2-cast-a w2-cast-b w2-camera music voices.
- 23:10 pace stream launched (wf_32471717-2b0)
- 23:40 WAVE3.md + wave3-plan.json delivered (8 streams: phase1 w3-produce w3-format w3-demo w3-guests w3-voice w3-slides; phase2 w3-studio w3-air; phase3 integ+6h soak 8709). Waiting owner answers to §13 questions; launch after wave 2 finishes and v2 is default.
- 23:35 container restarted again (~23:32); all 8 workflows resumed via resumeFromRunId (w2-integ, w2-hands, showcase, editorial-2, w2-face, w2-set, ads-1, pace). Repo saved at 137929f.
- 02:20 ads-1 DONE (final 7.5/7.5, 2 majors left: ad music beds not ducked → audio team). Launched w2-cast-b (wf_b58533b0-b20). Sent owner pace recording (11 min, 2 parts).
- 03:35 usage limit hit ~02:40 (reset 03:20) + container restart. Relaunched 8: w2-integ, w2-cast-b, w2-hands, w2-face, pace, editorial-2 (critics), w2-set (critics), showcase (critic). Sent owner the long showcase (7 min, AI desk via inbox) in 2 parts. Queue after: audio(r2) graphics(r3) w2-cast-a w2-camera opens ads-2 ads-3 music voices.
- 04:00 editorial-2 r2 critics 6/6 with a BLOCKER (NEWS IN 60 broken sentences from trimClause regression) + 4 majors (figure check, same-event re-air after recycle, word-for-word repetition per rotation, lending leaks) → relaunched rounds=2.
- 04:25 w2-set r3 critics 6/7.5, 8 majors (lonely tag word walls, picture palette fidelity/bands, MONEY strips green, picture halo behind head in solo wides, MONEY practicals craft, wall figure drops words → wrong number, figure clipped, cold-cut 10 ms) → relaunched rounds=3. audio relaunched (rounds=2, fix r2: ad bed chord, beat-0, open tail duck, muffled, speechFrame voice field).
- 04:40 w2-face r3 critics 6.5/7: 1 blocker (short banter head flick) + majors (lip sync without voice field, lip sync invisible in wide/medium, A-seat listeners never seen listening) → relaunched rounds=3. CONTRACTS: orchestrator request to AUDIO for speechFrame voice.
- 04:55 w2-hands r3 critics 6.5/6.5, 5 majors (lift wrist flutter, point_screen 95° snap, box reads as lapel grab, Ada chin 59% in TECH BYTES, action-level repeats vs pace vocabWindow) → relaunched rounds=3.

## 2026-10-03 06:00 PAUSED by owner (10% weekly usage left) — "solo entrega el vídeo"
All 9 workflows stopped (TaskStop). Resume later with Workflow resumeFromRunId + stored args (completed agents cached):
- wf_46ba5e4a-3af w2-integ r3 (critic2) · wf_caf57e98-5dd editorial-2 r3 (critic2) · wf_a18cc221-266 audio r3 (critic2)
- wf_6b569e20-55e w2-hands fix r3 · wf_b58533b0-b20 w2-cast-b fix r1 · wf_163fedd4-3db w2-face fix r3
- wf_13d8705f-b00 w2-set fix r3 (verify) · wf_b4abfbf3-1c7 showcase fix r1 · wf_32471717-2b0 pace fix r1
Queue untouched: graphics r3, w2-camera, w2-cast-a, opens, ads-2, ads-3, music, voices; wave 3 waits for owner answers.
WIP committed as d27d573. Delivered video: showcase-world-now-long-r1b (523 s) in 2 parts; canal-largo (1080 s) still recording.
