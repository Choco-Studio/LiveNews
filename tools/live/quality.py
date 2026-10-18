#!/usr/bin/env python3
"""How much of the picture survives each way to air, measured against the page's own pixels.

The source is a lossless recording of the canvas (tools/record.mjs --scale 1 --lossless: 384x216 RGB). Each chain is
encoded as the stream or the playout would encode it, decoded as a player would (BT.709 for HD, or the tags the file
carries), and compared with the source scaled by nearest neighbour to the same size: SSIM (all planes, mean and the
worst frame) and PSNR, plus the average bitrate.

  python3 tools/live/quality.py --src cosmos.mkv --from 10 --seconds 20 --size 1920x1080 \
      --chain x264:crf=20,max=4500 --chain x264:cbr=4500 --chain vp8sim:2500+x264:crf=20 [--json out.json]

Chains (joined with +): x264:crf=N[,max=KBPS] (constant quality, capped: the stream's and the playout's default) |
x264:cbr=KBPS (maxrate = bitrate, buffer 2x) | vp8sim:KBPS (libvpx VP8 realtime at 384x216, 4:2:0 BT.601: what the
browser's MediaRecorder does, simulated) | cap:FILE (a real capture by tools/live/lab.mjs, already aligned to the
source frame by frame, as RGB). Run with -I; it writes only to --work (default: a temporary folder, removed).
"""
import argparse, json, os, re, subprocess, sys, tempfile, shutil

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--from', dest='start', type=float, default=0)
ap.add_argument('--seconds', type=float, default=20)
ap.add_argument('--size', default='1920x1080')
ap.add_argument('--chain', action='append', default=[])
ap.add_argument('--preset', default='veryfast')
ap.add_argument('--json')
ap.add_argument('--work')
a = ap.parse_args()
W, H = map(int, a.size.split('x'))
K = W // 384
assert W == 384 * K and H == 216 * K, 'whole multiples only'
work = a.work or tempfile.mkdtemp(prefix='quality-')
os.makedirs(work, exist_ok=True)
FPS = 30

def ff(*args, capture=False):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'ffmpeg failed: {" ".join(args)}\n{r.stderr[-1500:]}')
    return r

# the source excerpt, lossless RGB at the canvas size (one file: every chain reads it)
src = os.path.join(work, 'src.mkv')
ff('-ss', str(a.start), '-t', str(a.seconds), '-i', a.src, '-an', '-c:v', 'ffv1', '-pix_fmt', 'rgb24', src)

SCALE709 = f'scale=w={W}:h={H}:flags=neighbor:out_color_matrix=bt709:out_range=tv,format=yuv420p'
TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

def x264(inp, out, spec, in_matrix=None):
    vf = SCALE709 if not in_matrix else f'scale=w={W}:h={H}:flags=neighbor:in_color_matrix={in_matrix}:out_color_matrix=bt709:out_range=tv,format=yuv420p'
    rc = []
    m = re.match(r'(crf|cbr)=(\d+(?:\.\d+)?)(?:,max=(\d+))?$', spec)
    if not m:
        sys.exit(f'x264 needs crf=N[,max=KBPS] or cbr=KBPS, not {spec}')
    if m[1] == 'crf':
        rc = ['-crf', m[2]]
        if m[3]:
            # capped quality: the quality asked, never more than KBPS (buffer 2 s)
            rc += ['-maxrate', f'{m[3]}k', '-bufsize', f'{2 * int(m[3])}k']
    else:
        k = int(float(m[2]))
        rc = ['-b:v', f'{k}k', '-maxrate', f'{k}k', '-bufsize', f'{2 * k}k']
    ff('-i', inp, '-vf', vf, '-c:v', 'libx264', '-preset', a.preset, '-tune', 'animation', *rc,
       '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', *TAGS, '-an', out)

def vp8sim(inp, out, kbps):
    # the browser's encoder is libvpx in realtime mode with error resilience, 4:2:0 BT.601 limited range
    ff('-i', inp, '-vf', 'scale=out_color_matrix=bt601:out_range=tv,format=yuv420p', '-c:v', 'libvpx', '-deadline', 'realtime',
       '-cpu-used', '8', '-error-resilient', '1', '-lag-in-frames', '0', '-b:v', f'{kbps}k', '-minrate', f'{kbps}k', '-maxrate', f'{kbps}k',
       '-bufsize', f'{kbps}k', '-colorspace', 'smpte170m', '-color_range', 'tv', '-an', out)

def bitrate(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=bit_rate,duration', '-of', 'json', f], capture_output=True, text=True)
    j = json.loads(r.stdout)['format']
    br = j.get('bit_rate')
    if br in (None, 'N/A'):
        br = os.path.getsize(f) * 8 / float(j['duration'])
    return int(float(br)) // 1000

def compare(dist, size_k, matrix='bt709'):
    """SSIM (mean, worst frame) and PSNR of `dist` against the source scaled xK, both as RGB."""
    w, h = 384 * size_k, 216 * size_k
    stats = os.path.join(work, 'ssim.log')
    graph = (f'[0:v]scale=w={w}:h={h}:flags=neighbor,format=gbrp[r];'
             f'[1:v]scale=w={w}:h={h}:flags=neighbor:in_color_matrix={matrix}:in_range=tv,format=gbrp[d];'
             f'[d]split[d1][d2];[r]split[r1][r2];[d1][r1]ssim=stats_file={stats};[d2][r2]psnr')
    r = subprocess.run(['ffmpeg', '-v', 'info', '-y', '-i', src, '-i', dist, '-lavfi', graph, '-f', 'null', '-'], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'compare failed\n{r.stderr[-1500:]}')
    per = []
    for line in open(stats):
        m = re.search(r'All:([\d.]+)', line)
        if m:
            per.append(float(m[1]))
    psnr = re.search(r'PSNR .*average:([\d.inf]+)', r.stderr)
    worst = sorted(range(len(per)), key=lambda i: per[i])[:3]
    srt = sorted(per)
    return {'ssim': round(sum(per) / max(1, len(per)), 5), 'ssim_worst': round(min(per) if per else 0, 5),
            'ssim_p1': round(srt[len(srt) // 100] if srt else 0, 5), 'worst_frames': worst, 'psnr': psnr and psnr[1], 'frames': len(per)}

results = []
for chain in a.chain:
    cur, matrix, k, notes = src, None, 1, []
    steps = chain.split('+')
    for i, step in enumerate(steps):
        kind, _, spec = step.partition(':')
        out = os.path.join(work, f'c{len(results)}-{i}.{"mkv" if kind != "vp8sim" else "webm"}')
        if kind == 'x264':
            x264(cur, out, spec, in_matrix=matrix)
            matrix, k = 'bt709', K
            notes.append({'step': step, 'kbps': bitrate(out)})
        elif kind == 'vp8sim':
            vp8sim(cur, out, int(spec))
            matrix = 'bt601'
            notes.append({'step': step, 'kbps': bitrate(out), **compare(out, 1, 'bt601')})
        elif kind == 'cap':
            # a capture already aligned and decoded to RGB by tools/live/lab.mjs (frame k = source frame k)
            out = spec
            matrix = None
            notes.append({'step': step, **compare(out, 1, 'bt709')})
        else:
            sys.exit(f'unknown step {step}')
        cur = out
    res = {'chain': chain, 'size': f'{384 * k}x{216 * k}', 'steps': notes, **compare(cur, k, matrix or 'bt709')}
    results.append(res)
    print(json.dumps(res), flush=True)

if a.json:
    json.dump(results, open(a.json, 'w'), indent=1)
if not a.work:
    shutil.rmtree(work, ignore_errors=True)
