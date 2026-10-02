"""Writing processed voice clips: WAV directly, compressed formats via ffmpeg.

Format for the web: Ogg/Opus (.ogg). Measured on this machine: Playwright's
Chromium (used by tools/record.mjs and the headless checks) decodes Ogg/Opus
with decodeAudioData at the exact clip duration, but refuses AAC/.m4a
("EncodingError: Unable to decode audio data") because open-source Chromium
builds ship without proprietary codecs. Opus is also the better speech codec.
64 kbit/s mono (~8 KB per second): at 48 kbit/s the decoded loudness of the
robot voice dropped 0.5 LU (dense harmonic spectrum), at 64 it holds -16.1.
.m4a (AAC, 48 kHz) is kept for humans listening on phones/QuickTime, .wav
(16-bit PCM with TPDF dither) for tests and offline tools.

Every file is written to a temporary name next to the target and renamed into
place, so a server never serves a half-written clip.
"""

import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')

# ext -> ffmpeg output arguments
_ENCODERS = {
    '.ogg': ['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-application', 'audio',
             '-frame_duration', '20', '-f', 'ogg'],
    '.opus': ['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-application', 'audio',
              '-frame_duration', '20', '-f', 'ogg'],
    '.webm': ['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-application', 'audio', '-f', 'webm'],
    '.m4a': ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-f', 'ipod'],
    '.mp3': ['-c:a', 'libmp3lame', '-q:a', '3', '-ar', '44100', '-f', 'mp3'],
    '.flac': ['-c:a', 'flac', '-f', 'flac'],
}
FORMATS = ('.wav',) + tuple(_ENCODERS)


def pcm16(y, seed=0):
    """Float -> int16 with TPDF dither (deterministic seed, so files are reproducible)."""
    rng = np.random.default_rng(seed)
    d = (rng.random(len(y)) - rng.random(len(y))) / 32768.0
    return np.clip(np.round((np.asarray(y) + d) * 32767.0), -32768, 32767).astype('<i2')


def read_wav(path):
    """Mono float64 samples and rate from a 16-bit PCM WAV (tests, tools)."""
    with wave.open(path, 'rb') as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width != 2:
        raise ValueError('only 16-bit WAV is supported')
    y = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    if ch > 1:
        y = y.reshape(-1, ch).mean(axis=1)
    return y, sr


def _tmp_beside(path, suffix):
    folder = os.path.dirname(os.path.abspath(path)) or '.'
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.voice-', suffix=suffix, dir=folder)
    os.close(fd)
    return tmp


def write_audio(path, y, sr):
    """Write y (mono float) to path; the format follows the extension."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATS:
        raise ValueError(f'unsupported output format {ext!r} (use one of {", ".join(FORMATS)})')
    tmp = _tmp_beside(path, ext)
    try:
        if ext == '.wav':
            with wave.open(tmp, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(int(sr))
                w.writeframes(pcm16(y).tobytes())
        else:
            if shutil.which(FFMPEG) is None:
                raise RuntimeError('ffmpeg not found (needed for ' + ext + ')')
            cmd = [FFMPEG, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                   '-f', 'f32le', '-ar', str(int(sr)), '-ac', '1', '-i', 'pipe:0',
                   *_ENCODERS[ext], tmp]
            proc = subprocess.run(cmd, input=np.asarray(y, dtype='<f4').tobytes(),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
            if proc.returncode != 0:
                raise RuntimeError('ffmpeg failed: ' + proc.stderr.decode('utf-8', 'replace')[-400:])
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return path
