// Composes the broadcast: camera shots, full-screen scenes, the graphics
// package (logo bug, world clocks, lower third, subtitles, ticker) and
// transitions. Everything is drawn at the native 384x216 pixel grid.
import { P } from './palette.js';
import { drawText, measureText, wrapText, LINE_HEIGHT } from './font.js';
import { drawAnchor, drawHands } from './anchors.js';
import { W, H, DESK_Y, ANCHOR_X, ANCHOR_Y, drawSet, drawDesk, drawStripes } from './set.js';
import { r, zoneTime, longDate, easeOut } from './util.js';
import { lookOf, portraitOf, presenterName, THEME_ACCENT } from './cast.js';
import { drawCloseup } from './scenes/portraits.js';
import { drawWorldMap } from './scenes/worldmap.js';
import * as cards from './scenes/cards.js';
import { drawOpen } from './scenes/opens.js';
import { drawLogo, measureLogo } from './logo.js';
import { ACTIONS } from './cues.js';

export { W, H };

const SOLO_X = 192;

// Which graphics sit on top of each shot
const OVERLAYS = {
  wide: 'news',
  close: 'news',
  full: 'news',
  map: 'news',
  fact: 'news',
  montage: 'news',
  breakingCard: 'bug',
  ad: 'ad',
};

// Automatic body language when the script gives no stage directions:
// [action, weight] pools for whoever is speaking or listening, by mood.
const AUTO = {
  speak: [['raise_hand', 3], ['nod', 2], ['count', 1], ['lean_in', 1], ['steeple', 1], ['point_camera', 1], ['point_screen', 1], ['look_partner', 1]],
  speakGrave: [['lean_in', 2], ['steeple', 2], ['nod', 1], ['raise_hand', 1], ['shake_head', 0.5]],
  speakSurprised: [['wow', 1], ['shrug', 1], ['raise_hand', 2], ['point_screen', 1]],
  listen: [['nod', 3], ['look_partner', 2], ['papers', 1], ['chin', 1], ['glasses', 0.5]],
  listenGrave: [['nod', 2], ['look_partner', 2], ['steeple', 1]],
};

function pickWeighted(pool, exclude) {
  const options = pool.filter(([name]) => !exclude.includes(name));
  const total = options.reduce((a, [, w]) => a + w, 0);
  let x = Math.random() * total;
  for (const [name, w] of options) if ((x -= w) <= 0) return name;
  return options[0]?.[0];
}

export function slotPositions(cast) {
  return cast?.B ? { A: ANCHOR_X.A, B: ANCHOR_X.B } : { A: SOLO_X };
}

export class Renderer {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.audio = audio;
    this.stage = document.createElement('canvas');
    this.stage.width = W;
    this.stage.height = H;
    this.sctx = this.stage.getContext('2d');
    this.sctx.imageSmoothingEnabled = false;
    this.anim = {};
  }

  anchorState(slot, t, scene) {
    const a = (this.anim[slot] ??= { blinkAt: 1 + Math.random() * 2, blinkUntil: 0, gestureUntil: 0, nextGesture: 2 });
    if (t > a.blinkAt) {
      a.blinkUntil = t + 0.12;
      a.blinkAt = t + 2 + Math.random() * 3.5;
    }
    const speaking = this.audio.isSpeaking(slot);
    if (speaking && t > a.nextGesture) {
      a.gestureUntil = t + 0.6 + Math.random() * 0.8;
      a.nextGesture = t + 2.5 + Math.random() * 4;
    }
    this.autoPerform(slot, t, scene, speaking, a);
    const level = this.audio.level(slot);
    const other = slot === 'A' ? 'B' : 'A';
    let look = 0;
    if (scene.cast?.[other] && this.audio.isSpeaking(other) && scene.shot === 'wide') look = slot === 'A' ? 1 : -1;
    const act = scene.actions?.[slot];
    const action = act && t < act.t0 + act.dur ? { name: act.name, t0: act.t0, dur: act.dur, p: Math.max(0, (t - act.t0) / act.dur) } : null;
    return {
      t,
      speaking,
      action,
      emotion: scene.anchors[slot]?.emotion || 'neutral',
      mouth: level > 0.62 ? 2 : level > 0.22 ? 1 : 0,
      blink: t < a.blinkUntil,
      look,
      bob: speaking && Math.sin(t * 5.3) > 0.7 ? 1 : 0,
      gesture: !action && speaking && t < a.gestureUntil ? 1 : 0,
    };
  }

  /** Keep presenters alive: occasional natural actions when none is scripted. */
  autoPerform(slot, t, scene, speaking, a) {
    if (!['wide', 'close'].includes(scene.shot)) return;
    const current = scene.actions[slot];
    if (current && t < current.t0 + current.dur + 0.6) {
      a.nextAuto = Math.max(a.nextAuto || 0, current.t0 + current.dur + 1.5);
      return;
    }
    if (a.wasSpeaking !== speaking) {
      // settle in before the first gesture of a new turn
      a.wasSpeaking = speaking;
      a.nextAuto = t + (speaking ? 1.2 + Math.random() * 1.5 : 2 + Math.random() * 3);
      return;
    }
    if (t < (a.nextAuto || 0)) return;
    const duo = !!scene.cast?.B;
    const emotion = scene.anchors[slot]?.emotion;
    const grave = emotion === 'serious' || emotion === 'sad';
    const pool = speaking
      ? grave
        ? AUTO.speakGrave
        : emotion === 'surprised'
          ? AUTO.speakSurprised
          : AUTO.speak
      : grave
        ? AUTO.listenGrave
        : AUTO.listen;
    const exclude = [a.lastAuto];
    if (!duo) exclude.push('look_partner', 'point_partner');
    if (scene.wall?.mode !== 'image') exclude.push('point_screen');
    const name = pickWeighted(pool, exclude);
    if (name && ACTIONS[name]) {
      scene.actions[slot] = { name, t0: t, dur: ACTIONS[name].dur, auto: true };
      a.lastAuto = name;
    }
    a.nextAuto = t + (speaking ? 3 + Math.random() * 3.5 : 5 + Math.random() * 6);
  }

  drawStudio(ctx, t, scene) {
    drawSet(ctx, t, { ...scene, channel: scene.channel.name });
    const pos = slotPositions(scene.cast);
    const slots = Object.keys(pos);
    const states = Object.fromEntries(slots.map((s) => [s, this.anchorState(s, t, scene)]));
    for (const s of slots) drawAnchor(ctx, pos[s], ANCHOR_Y, lookOf(scene.cast[s]), states[s]);
    drawDesk(ctx, t, scene.channel.name, true);
    for (const s of slots) drawHands(ctx, pos[s], DESK_Y, lookOf(scene.cast[s]), states[s].gesture);
  }

  drawShot(t, scene) {
    const ctx = this.ctx;
    const dt = t - (scene.shotSince || 0);
    const img = scene.storyId ? scene.images.get(scene.storyId) : null;
    const card = scene.card || {};
    const program = scene.program;
    switch (scene.shot) {
      case 'start':
        return cards.drawStartScreen(ctx, t, { channel: scene.channel.name, prompt: card.prompt || 'CLICK TO TUNE IN' });
      case 'standby':
        return cards.drawStandby(ctx, t, { channel: scene.channel.name, message: card.message || 'PREPARING THE NEXT PROGRAMME' });
      case 'open':
        return drawOpen(ctx, t, dt, program?.id, {
          title: program?.title || scene.channel.name,
          tagline: program?.tagline || '',
          presenters: Object.values(scene.cast || {}).map(presenterName),
          date: longDate().toUpperCase(),
          channel: scene.channel.name,
        });
      case 'title':
        return cards.drawTitleCard(ctx, t, dt, { channel: program?.title || scene.channel.name, subtitle: program?.tagline || scene.channel.slogan, date: longDate().toUpperCase() });
      case 'endcard':
        return cards.drawEndCard(ctx, t, dt, { channel: program?.title || scene.channel.name, line1: card.line1 || 'STAY WITH US', line2: card.line2 || '' });
      case 'ident':
        return this.drawIdent(ctx, t, dt, scene);
      case 'promo':
        return this.drawPromo(ctx, t, dt, scene);
      case 'montage': {
        const item = scene.rundown[card.index] || {};
        const pic = scene.images.get(item.storyId);
        return cards.drawHeadlineFrame(ctx, t, dt, { index: card.index, total: scene.rundown.length, headline: item.headline, source: item.source, category: item.category, image: pic?.card || null });
      }
      case 'breakingCard':
        return cards.drawBreakingCard(ctx, t, dt, { headline: card.headline, source: card.source });
      case 'fact':
        return cards.drawFactCard(ctx, t, dt, { fact: card.fact, label: card.label, source: card.source, image: img?.card || null });
      case 'map':
        return drawWorldMap(ctx, t, dt, { lat: card.lat, lon: card.lon, place: card.place });
      case 'ad':
        return card.ad?.draw(ctx, t, dt, { line: card.line ?? -1, speaking: this.audio.isSpeaking('ad'), duration: card.ad.duration });
      case 'full':
        if (img?.full) {
          // slow Ken Burns pan across a native-resolution pixel-art photo
          const maxX = img.full.width - W;
          const maxY = img.full.height - H;
          const p = easeOut(Math.min(1, dt / 16));
          const ox = Math.round(maxX * (scene.panDir > 0 ? p : 1 - p));
          const oy = Math.round(maxY * (scene.panDir > 0 ? 1 - p : p));
          ctx.drawImage(img.full, -ox, -oy);
          return;
        }
        break;
      case 'close': {
        const slot = scene.focus in (scene.cast || {}) ? scene.focus : 'A';
        const withBox = !!img?.small;
        const solo = !scene.cast?.B;
        const side = withBox ? (slot === 'B' ? 'right' : 'left') : solo ? 'center' : slot === 'B' ? 'right' : 'left';
        const accent = scene.lowerThird?.breaking ? P.red : THEME_ACCENT[program?.theme] || null;
        drawCloseup(ctx, t, portraitOf(scene.cast[slot]), this.anchorState(slot, t, scene), { side, accent });
        if (withBox) {
          const bw = img.small.width;
          const bh = img.small.height;
          const bx = side === 'left' ? 248 : 32;
          const by = 30;
          r(ctx, bx - 3, by - 3, bw + 6, bh + 6, P.white);
          r(ctx, bx - 2, by - 2, bw + 4, bh + 4, P.black);
          ctx.drawImage(img.small, bx, by);
          r(ctx, bx - 3, by + bh + 3, bw + 6, 2, accent || P.red);
        }
        return;
      }
      default:
        break;
    }
    // wide (and fallbacks)
    this.drawStudio(this.sctx, t, scene);
    ctx.drawImage(this.stage, 0, 0);
  }

  /** Channel ident between programmes and breaks. */
  drawIdent(ctx, t, dt, scene) {
    drawStripes(ctx, 0, 0, W, H, t, P.navy, P.ink);
    // radiating "bits"
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996 + t * 0.15;
      const d = ((t * 40 + i * 37) % 260) + 10;
      const x = Math.round(W / 2 + Math.cos(a) * d * 1.4);
      const y = Math.round(H / 2 - 8 + Math.sin(a) * d * 0.8);
      r(ctx, x, y, 2, 2, i % 5 === 0 ? P.red : i % 3 === 0 ? P.cyan : P.blue);
    }
    const scale = 3;
    const size = measureLogo({ variant: 'full', scale, slogan: true });
    const y = Math.round((H - size.h) / 2 - 6 + (1 - easeOut(dt / 0.6)) * 30);
    drawLogo(ctx, W / 2, y, { variant: 'full', scale, t, slogan: true, align: 'center' });
  }

  /** "Up next" promo at the end of a break. */
  drawPromo(ctx, t, dt, scene) {
    const next = scene.card?.next;
    const accent = THEME_ACCENT[next?.theme] || P.red;
    drawStripes(ctx, 0, 0, W, H, t, P.ink, P.black);
    const slide = easeOut(dt / 0.5);
    const bx = Math.round(-W + slide * W);
    r(ctx, bx, 64, W, 64, accent);
    r(ctx, bx, 128, W, 3, P.black);
    drawText(ctx, scene.card?.label || 'UP NEXT', 24, 44, { color: P.yellow, scale: 2, shadow: P.black });
    if (next) {
      const tx = Math.round(W + 20 - easeOut((dt - 0.2) / 0.6) * (W - 4));
      drawText(ctx, next.title, tx, 74, { color: P.white, scale: 4, shadow: P.black });
      drawText(ctx, next.tagline || '', tx + 2, 112, { color: P.white, shadow: P.black });
      if (dt > 0.9) {
        const names = (next.presenters || []).map(presenterName).join('  &  ');
        drawText(ctx, names ? `WITH ${names}` : '', 24, 150, { color: P.cream, shadow: P.black });
      }
    }
    if (dt > 1.2) drawText(ctx, scene.card?.footer || 'AFTER THE BREAK', 24, 168, { color: P.fog });
    const lw = measureLogo({ variant: 'bug' }).w;
    drawLogo(ctx, W - lw - 10, H - 24, { variant: 'bug', t });
  }

  drawOverlays(t, scene) {
    const mode = OVERLAYS[scene.shot];
    if (!mode) {
      this.ltState = null;
      return;
    }
    const ctx = this.ctx;
    const M = 13; // title-safe margin

    if (mode === 'ad') {
      r(ctx, M, 8, measureText('ADVERTISEMENT') + 8, 11, P.black);
      drawText(ctx, 'ADVERTISEMENT', M + 4, 10, { color: P.fog });
      return;
    }

    // Static logo bug, LIVE / REPLAY, and the programme name for a while after it starts
    const bug = drawLogo(ctx, M, 8, { variant: 'bug' });
    let x = M + bug.w + 2;
    const live = scene.replay ? 'REPLAY' : 'LIVE';
    const lw = measureText(live) + (scene.replay ? 8 : 14);
    r(ctx, x, 8, lw, 13, scene.replay ? P.yellow : P.black);
    if (!scene.replay) r(ctx, x + 4, 12, 4, 4, P.red);
    drawText(ctx, live, x + (scene.replay ? 4 : 10), 11, { color: scene.replay ? P.black : P.white });
    x += lw;
    if (scene.program && mode === 'news' && t < (scene.programTagUntil || 0)) {
      const pw = measureText(scene.program.title) + 8;
      r(ctx, x, 8, pw, 13, THEME_ACCENT[scene.program.theme] || P.red);
      drawText(ctx, scene.program.title, x + 4, 11, { color: scene.program.theme === 'flash' ? P.black : P.white });
    }

    // Studio clock (London)
    const clock = zoneTime().label;
    const cw = measureText(clock) + 10;
    r(ctx, W - cw - M, 8, cw, 13, P.black);
    drawText(ctx, clock, W - M - 5, 11, { color: P.white, align: 'right' });

    if (mode === 'bug') return this.drawTicker(t, scene.ticker);

    // Breaking banner: red tag, two pulses on entry, no continuous flashing
    if (scene.breaking) {
      const bt = t - scene.breaking.since;
      if (bt < 22) {
        const pulse = (bt > 0 && bt < 0.18) || (bt > 0.6 && bt < 0.78);
        r(ctx, 0, 26, W, 14, P.darkRed);
        r(ctx, 0, 26, 66, 14, pulse ? P.white : P.red);
        drawText(ctx, 'BREAKING', 8, 30, { color: pulse ? P.red : P.white });
        const text = `${scene.breaking.source.toUpperCase()}: ${scene.breaking.text}`;
        const tw = measureText(text);
        const tx = Math.round(W - ((bt * 40) % (tw + W)));
        ctx.save();
        ctx.beginPath();
        ctx.rect(68, 26, W - 68, 14);
        ctx.clip();
        drawText(ctx, text, tx, 30, { color: P.white });
        ctx.restore();
      }
    }

    // Lower third: wipes in over 0.35 s (text 0.1 s later), out over 0.25 s
    let subtitleBottom = 198;
    const lt = this.lowerThirdState(t, scene.lowerThird);
    if (lt) {
      const { data, inP, outP } = lt;
      const reveal = easeOut(inP) * (1 - easeOut(outP));
      const barW = Math.round((W - 2 * M) * reveal);
      const textOn = inP >= 1 && outP <= 0;
      const accent = data.breaking ? P.red : THEME_ACCENT[scene.program?.theme] || P.blue;
      const tag = data.breaking ? 'BREAKING' : data.source.toUpperCase();
      const tagW = measureText(tag) + 10;
      if (barW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(M, 160, barW, 40);
        ctx.clip();
        r(ctx, M, 166, tagW, 11, data.breaking ? P.red : P.navy);
        if (textOn) drawText(ctx, tag, M + 5, 168, { color: P.white });
        if (data.showName && t - data.since < 5) {
          const nameW = measureText(data.anchorName) + 10;
          r(ctx, M + tagW, 166, nameW, 11, P.black);
          if (textOn) drawText(ctx, data.anchorName, M + tagW + 5, 168, { color: P.silver });
        }
        r(ctx, M, 177, W - 2 * M, 17, P.white);
        r(ctx, M, 177, 3, 17, accent);
        r(ctx, M, 194, W - 2 * M, 1, P.fog);
        if (textOn) drawText(ctx, data.headline, M + 8, 182, { color: P.black });
        ctx.restore();
      }
      subtitleBottom = 160;
    }

    // Subtitles
    if (scene.subtitles && scene.subtitle) {
      const lines = wrapText(scene.subtitle, W - 48).slice(-2);
      const lh = LINE_HEIGHT - 1;
      const boxH = lines.length * lh + 6;
      const y0 = subtitleBottom - boxH;
      const maxW = Math.max(...lines.map((l) => measureText(l)));
      ctx.fillStyle = 'rgba(24,20,37,0.78)';
      ctx.fillRect(Math.floor(W / 2 - maxW / 2 - 6), y0, maxW + 12, boxH);
      lines.forEach((line, i) => drawText(ctx, line, W / 2, y0 + 5 + i * lh, { color: P.cream, align: 'center' }));
    }

    this.drawTicker(t, scene.ticker);
  }

  /** Tracks the lower third so it can animate out after the director clears it. */
  lowerThirdState(t, current) {
    const prev = this.ltState;
    if (current) {
      if (!prev || prev.data !== current) this.ltState = { data: current, out: null };
      else if (prev.out !== null) this.ltState = { data: current, out: null };
    } else if (prev && prev.out === null) {
      prev.out = t;
    }
    const st = this.ltState;
    if (!st) return null;
    const outP = st.out === null ? 0 : (t - st.out) / 0.25;
    if (outP >= 1) {
      this.ltState = null;
      return null;
    }
    const inP = Math.max(0, Math.min(1, (t - st.data.since) / 0.35));
    // text appears 0.1 s after the bar has finished
    return { data: st.data, inP: t - st.data.since >= 0.45 ? 1 : Math.min(inP, 0.999), outP };
  }

  /** BBC-style flipper: one headline at a time. */
  drawTicker(t, items) {
    const ctx = this.ctx;
    const y = 202;
    const label = 52;
    r(ctx, 0, y, W, 14, P.ink);
    r(ctx, 0, y, W, 1, P.steel);
    if (items?.length) {
      const SLOT = 6;
      const i = Math.floor(t / SLOT) % items.length;
      const dt = t % SLOT;
      const it = items[i];
      const src = `${it.source} ▸ `;
      const sw = measureText(src);
      const tw = sw + measureText(it.text);
      const room = W - label - 12;
      // long headlines glide left after a pause, short ones sit still
      const shift = tw > room ? Math.round(Math.min(tw - room, Math.max(0, dt - 1.2) * 24)) : 0;
      const enter = Math.round((1 - easeOut(dt / 0.3)) * 14);
      ctx.save();
      ctx.beginPath();
      ctx.rect(label + 2, y + 1, W - label - 2, 13);
      ctx.clip();
      const x = label + 8 - shift;
      drawText(ctx, src, x, y + 4 + enter, { color: P.yellow });
      drawText(ctx, it.text, x + sw, y + 4 + enter, { color: P.white });
      ctx.restore();
    }
    r(ctx, 0, y, label, 14, P.red);
    drawText(ctx, 'LATEST', 7, y + 4, { color: P.white });
  }

  render(t, scene) {
    this.drawShot(t, scene);
    this.drawOverlays(t, scene);
    if (scene.stinger) {
      const p = (t - scene.stinger.start) / cards.STINGER_DURATION;
      if (p >= 1) scene.stinger = null;
      else if (p > 0) cards.drawStinger(this.ctx, t, p, { channel: scene.channel.name });
    }
  }
}
