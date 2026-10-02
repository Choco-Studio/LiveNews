#!/usr/bin/env python3
"""Showcase A/V sync check on the FINISHED file (independent of the recorder's stems).

  python3 tools/showcase/check-av.py show.mp4 [show-timeline.json] [--frames DIR]

Decodes the MP4 itself - the picture back to native 384x216 (the 5x encode is
nearest-neighbour, so every logical pixel survives), the AAC through ffmpeg
(edit list applied, so encoder priming is accounted for) - and measures:

  1. audio offset: cross-correlation of the decoded AAC with the pre-encode mix
     (<show>.work/mix.wav); 0 ms means the mux added no delay;
  2. stingers: the wipe's first changed frame and the cut (largest change) in the
     picture vs the whoosh onset and the thump (steepest rise) in the sound;
  3. captions: the frame where each caption block changes vs the onset of the
     voice that speaks it (the caption should lead the first word by 0-150 ms).

With --frames DIR it also writes, for the first stinger and the first two
captions, the frames around the event (PNG, 3x) for a look with an image viewer.
Prints a JSON report (also written next to the MP4 as <show>-avcheck.json).
"""

import json
import os
import subprocess
import sys

import numpy as np

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
SR = 48000
W, H = 384, 216


def probe_fps(mp4):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,width,height',
                          '-of', 'json', mp4], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    a, b = s['r_frame_rate'].split('/')
    return float(a) / float(b), int(s['width']), int(s['height'])


def audio(mp4, t0=0.0, dur=None):
    cmd = [FFMPEG, '-v', 'error', '-ss', f'{max(0.0, t0):.4f}', '-i', mp4]
    if dur:
        cmd += ['-t', f'{dur:.4f}']
    cmd += ['-vn', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype='<f4').astype(np.float64)


def frames(mp4, fps, f0, count, scale):
    """Frames f0 .. f0+count-1 at native size, RGB uint8 (count, H, W, 3)."""
    t0 = max(0, f0) / fps
    cmd = [FFMPEG, '-v', 'error', '-ss', f'{t0:.4f}', '-i', mp4, '-frames:v', str(count),
           '-vf', f'scale=iw/{scale}:ih/{scale}:flags=neighbor', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H * 3)
    return np.frombuffer(raw[: n * W * H * 3], dtype=np.uint8).reshape(n, H, W, 3), max(0, f0)


def read_wav_mono(path):
    import wave
    with open(path, 'rb') as f:
        head = f.read(64)
    if head[20:22] == b'\x03\x00':  # IEEE float (mix.py writes float WAVs)
        raw = open(path, 'rb').read()
        i = raw.find(b'data')
        size = int.from_bytes(raw[i + 4:i + 8], 'little')
        ch = int.from_bytes(raw[22:24], 'little')
        data = np.frombuffer(raw[i + 8:i + 8 + size], dtype='<f4').astype(np.float64)
        return data.reshape(-1, ch).mean(axis=1)
    with wave.open(path, 'rb') as w:
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
    return x.reshape(-1, ch).mean(axis=1)


def env_db(x, win=0.005, hop=0.001):
    w, h = int(win * SR), int(hop * SR)
    if len(x) < w:
        return np.full(1, -120.0)
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    idx = np.arange(0, len(x) - w, h)
    return 10 * np.log10((c[idx + w] - c[idx]) / w + 1e-12)


def onset(e, i0, i1, rise=12, floor=-55):
    """First index in [i0, i1) where the level is `rise` dB over the median of the 250 ms before i0."""
    base = float(np.median(e[max(0, i0 - 250):max(1, i0)])) if i0 > 0 else -120.0
    thr = max(floor, base + rise)
    for k in range(max(0, i0), min(len(e), i1)):
        if e[k] > thr:
            return k
    return None


def steepest(e, i0, i1, d=10):
    best, at = -1e9, None
    for k in range(max(0, i0), min(len(e) - d, i1)):
        r = e[k + d] - e[k]
        if r > best:
            best, at = r, k + d // 2
    return at


def save_png(path, img, k=3):
    big = np.repeat(np.repeat(img, k, axis=0), k, axis=1)
    h, w = big.shape[:2]
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-i', '-', path],
                   input=big.tobytes(), check=True)


def main():
    args, frames_dir = [], None
    argv = sys.argv[1:]
    while argv:
        a = argv.pop(0)
        if a == '--frames':
            frames_dir = argv.pop(0)
        else:
            args.append(a)
    if not args:
        print(__doc__)
        return 1
    mp4 = args[0]
    base = mp4[:-4] if mp4.lower().endswith('.mp4') else mp4
    tl_path = args[1] if len(args) > 1 else base + '-timeline.json'
    if frames_dir:
        os.makedirs(frames_dir, exist_ok=True)
    tl = json.load(open(tl_path, encoding='utf-8'))
    fps, vw, vh = probe_fps(mp4)
    scale = vw // W
    rep = {'file': mp4, 'fps': fps, 'scale': scale}

    # 1. Audio offset vs the pre-encode mix (a 20 s window with sound).
    a = audio(mp4)
    mix_path = base + '.work/mix.wav'
    if os.path.exists(mix_path):
        m = read_wav_mono(mix_path)
        n = min(len(a), len(m))
        e = env_db(m[:n], 0.05, 0.05)
        k0 = int(np.argmax(e > -40)) if (e > -40).any() else 0
        s0 = min(max(0, k0 * int(0.05 * SR)), max(0, n - 20 * SR))
        seg_m = m[s0:s0 + 20 * SR]
        seg_a = a[s0:s0 + 20 * SR]
        L = min(len(seg_m), len(seg_a))
        F = 1 << int(np.ceil(np.log2(2 * L)))
        xc = np.fft.irfft(np.fft.rfft(seg_a[:L], F) * np.conj(np.fft.rfft(seg_m[:L], F)), F)
        lag = int(np.argmax(np.concatenate((xc[-SR // 10:], xc[:SR // 10]))) - SR // 10)
        rep['audioOffsetMs'] = round(lag / SR * 1000, 2)
        rep['audioSeconds'] = round(len(a) / SR, 3)
    ea = env_db(a)  # 1 ms hop

    events = tl.get('events', [])
    shots = [e for e in events if e.get('ev') == 'shot']

    # Voice reference for the caption check: the voice stems (the clips the
    # harness synthesised + the channel's own speech bus). mix.py sums them into
    # mix.wav at the same sample indices, so the offset measured above holds for
    # them too; without stems the decoded mix is used (music can blur onsets).
    vref = None
    for name in ('voice.wav', 'speechbus.wav'):
        pth = os.path.join(base + '.work', name)
        if os.path.exists(pth):
            x = read_wav_mono(pth)
            vref = x if vref is None else vref[:min(len(vref), len(x))] + x[:min(len(vref), len(x))]
    if vref is not None:
        lag = int(round((rep.get('audioOffsetMs') or 0) * SR / 1000))
        vref = np.concatenate((np.zeros(max(0, lag)), vref))[max(0, -lag):]
    ev_voice = env_db(vref) if vref is not None else ea
    rep['captionVoiceRef'] = 'stems' if vref is not None else 'mix'
    # The stinger's whoosh is a slow swell: in the full mix the voice and the bed
    # hide where it starts, so its onset is read on the WebAudio stem (the
    # channel's own sounds), aligned the same way. The thump is read on the mix.
    ew = ea
    wpath = os.path.join(base + '.work', 'webaudio.wav')
    if os.path.exists(wpath):
        x = read_wav_mono(wpath)
        lag = int(round((rep.get('audioOffsetMs') or 0) * SR / 1000))
        ew = env_db(np.concatenate((np.zeros(max(0, lag)), x))[max(0, -lag):])
    rep['stingerOnsetRef'] = 'webaudio stem' if ew is not ea else 'mix'

    def changed(fr):
        """Pixels that change between consecutive frames (|delta| > 24 on any channel)."""
        d = np.abs(np.diff(fr.astype(np.int16), axis=0)).max(axis=3)
        return (d > 24).sum(axis=(1, 2))  # [k]: frame f0+k -> f0+k+1

    # 2. Stingers: the wipe's first frame (picture) vs the whoosh onset (sound);
    # the shot change under the wipe (the timeline's next shot, confirmed in the
    # picture) vs the thump.
    stingers = []
    for s in [e for e in events if e.get('ev') == 'stinger' and e.get('at', -1) >= 0.3]:
        at = s['at']
        f0 = int(np.floor((at - 0.4) * fps))
        fr, f0 = frames(mp4, fps, f0, int(1.5 * fps), scale)
        if len(fr) < 4:
            continue
        c = changed(fr)
        pre = c[: max(3, int(0.3 * fps))]
        thr = max(150, 3 * float(np.median(pre)))
        first = next((k + 1 for k in range(len(c)) if (f0 + k + 1) / fps >= at - 0.05 and c[k] > thr), None)
        wipe_t = (f0 + first) / fps if first is not None else None
        nxt = next((x for x in shots if at + 0.05 < (x.get('at') if x.get('at') is not None else x['t']) <= at + 1.0), None)
        cut_tl = (nxt.get('at') if nxt.get('at') is not None else nxt['t']) if nxt else None
        cut_frame = int(np.ceil(cut_tl * fps - 1e-6)) if cut_tl is not None else None
        cut_change = int(c[cut_frame - f0 - 1]) if cut_frame is not None and 0 <= cut_frame - f0 - 1 < len(c) else None
        i0 = int((at - 0.1) * 1000)
        masked = i0 > 0 and float(np.median(ew[max(0, i0 - 250):i0])) > -40  # other channel sounds already loud
        o = None if masked else onset(ew, i0, int((at + 0.5) * 1000), rise=10, floor=-70)
        th = steepest(ea, int((cut_tl - 0.15) * 1000), int((cut_tl + 0.25) * 1000)) if cut_tl is not None else None
        stingers.append({
            'timelineAt': round(at, 3), 'frameOfTimeline': int(np.ceil(at * fps - 1e-6)),
            'wipeFirstFrame': None if first is None else f0 + first, 'wipeStart': None if wipe_t is None else round(wipe_t, 3),
            'soundOnset': None if o is None else round(o / 1000, 3), 'onsetMasked': bool(masked),
            'soundOnsetVsTimelineMs': None if o is None else round(o - at * 1000),
            'soundOnsetVsWipeMs': None if (o is None or wipe_t is None) else round(o - wipe_t * 1000),
            'cutShot': nxt.get('shot') if nxt else None, 'cutFrame': cut_frame, 'cutFramePixelsChanged': cut_change,
            'thumpVsCutMs': None if th is None else round(th - cut_frame / fps * 1000),
        })
        if frames_dir and len(stingers) == 1:
            for k in range(len(fr)):
                save_png(os.path.join(frames_dir, f'stinger-f{f0 + k:05d}-t{(f0 + k) / fps:07.3f}.png'), fr[k])
    rep['stingers'] = stingers

    # 3. Captions: the frame where the caption block changes (white glyphs on a
    # black box, counted in the caption column) vs the voice onset after it.
    voices = [s for s in tl.get('speech', []) if s.get('clip') and s.get('start') is not None]
    clips = tl.get('recordedClips', [])
    subs = [e for e in events if e.get('ev') == 'subtitle' and e.get('text')]
    caps = []
    for sub in subs:
        t = sub['t']
        v = next((s for s in voices if t - 0.05 <= s['start'] <= t + 1.0), None)
        rec = next((c for c in clips if c['start'] - 0.2 <= t <= c['end']), None) if v is None else None
        if v is None and rec is None:
            continue
        f0 = int(np.floor((t - 0.2) * fps))
        fr, f0 = frames(mp4, fps, f0, int(0.6 * fps), scale)
        if len(fr) < 3:
            continue
        col = fr[:, 30:H - 8, 56:W - 56, :].astype(np.int16)
        white = ((col[..., 0] > 225) & (col[..., 1] > 225) & (col[..., 2] > 225)).sum(axis=(1, 2))
        dw = np.abs(np.diff(white))
        expect = int(np.ceil(t * fps - 1e-6)) - f0  # frame index the timeline says
        # The roll nearest the timeline's frame (within 3 frames), else the biggest one.
        near = [k for k in range(len(dw)) if dw[k] > 15 and abs(k + 1 - expect) <= 3]
        k = (min(near, key=lambda q: abs(q + 1 - expect)) + 1) if near else (int(np.argmax(dw)) + 1 if dw.max() > 15 else None)
        if k is None:
            continue
        while k > 1 and dw[k - 2] > 15:  # the first frame of the roll
            k -= 1
        cap_t = (f0 + k) / fps
        i0, i1 = int((cap_t - 0.15) * 1000), int((cap_t + 0.6) * 1000)
        if vref is not None:
            # Rising edge over -45 dBFS: skip a previous sentence still sounding, then the first crossing.
            q = max(0, i0)
            while q < min(i1, int(cap_t * 1000)) and ev_voice[q] > -45:
                q += 1
            while q < min(i1, len(ev_voice)) and ev_voice[q] <= -45:
                q += 1
            o = q if q < min(i1, len(ev_voice)) else None
        else:
            o = onset(ea, i0, i1, rise=12, floor=-45)
        caps.append({'timelineT': round(t, 3), 'captionFrame': f0 + k, 'captionAt': round(cap_t, 3),
                     'voiceOnset': None if o is None else round(o / 1000, 3),
                     'voiceOnsetVsCaptionMs': None if o is None else round(o - cap_t * 1000),
                     'source': 'harness' if v else 'server', 'text': sub['text'][:60]})
        if frames_dir and len(caps) <= 2:
            for j in range(max(0, k - 3), min(len(fr), k + 6)):
                save_png(os.path.join(frames_dir, f'caption{len(caps)}-f{f0 + j:05d}-t{(f0 + j) / fps:07.3f}.png'), fr[j])
    rep['captions'] = caps

    def summ(vals):
        vals = [x for x in vals if x is not None]
        if not vals:
            return {'n': 0}
        return {'n': len(vals), 'median': float(np.median(vals)), 'min': min(vals), 'max': max(vals)}
    rep['summary'] = {
        'audioOffsetMs': rep.get('audioOffsetMs'),
        'stingerSoundVsWipeMs': summ([s['soundOnsetVsWipeMs'] for s in stingers]),
        'stingerSoundVsTimelineMs': summ([s['soundOnsetVsTimelineMs'] for s in stingers]),
        'stingerOnsetsMasked': sum(1 for s in stingers if s['onsetMasked']),
        'stingerThumpVsCutMs': summ([s['thumpVsCutMs'] for s in stingers]),
        'stingerWipeVsTimelineFrames': summ([s['wipeFirstFrame'] - s['frameOfTimeline'] for s in stingers if s['wipeFirstFrame'] is not None]),
        'voiceAfterCaptionMs': summ([c['voiceOnsetVsCaptionMs'] for c in caps]),
        'captionFrameVsTimelineMs': summ([round((c['captionAt'] - c['timelineT']) * 1000) for c in caps]),
    }
    out = base + '-avcheck.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rep, f, indent=1)
    print(json.dumps(rep['summary']))


if __name__ == '__main__':
    main()
