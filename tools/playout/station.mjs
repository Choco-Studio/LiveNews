#!/usr/bin/env node
// The station for pre-rendered playout (docs/publishing/playout.md): server/index.js as ever, but on the AIR CLOCK
// (server/playout/clock.js) and in PLAYOUT mode: the renderer (tools/playout/render.mjs) tells it what time it is on
// air as it renders, so the clock marks, the dayparts and the writers' words ("good evening", "this morning", the
// weather's "now") read for the moment each programme airs; every episode passes the check before air; every episode
// waits for all its voices (nothing is watching yet); nothing says LIVE.
//
//   PORT=8790 VOICE_ENGINE=kokoro node tools/playout/station.mjs
//
// The station's own switches apply (server/config.js). Playout's: PLAYOUT_VERBATIM=block|warn (default block),
// PLAYOUT_REVIEW=1|0 (a recreation needs the owner's review before air; default 1), PLAYOUT_WAIT_S (how long the
// renderer may wait for a programme before the station airs filler ads, default 900), PLAYOUT_CLOCK_CAP_S (how far
// the air clock runs on between two words from the renderer, default 60), VOICE_BUDGET_S (default 1800 here: every
// voice is made before the programme is queued).
import { createAirClock, installAirClock } from '../../server/playout/clock.js';

process.env.PLAYOUT = '1';
process.env.VOICE_BUDGET_S ??= '1800';
process.env.VOICE_FIRST_BUDGET_S ??= '1800';
const cap = Math.max(1, Number(process.env.PLAYOUT_CLOCK_CAP_S || 60)) * 1000;
const clock = createAirClock({ cap });
installAirClock(clock);
console.log(`[playout] air clock installed (runs on at most ${cap / 1000} s between the renderer's words)`);
await import('../../server/index.js');
