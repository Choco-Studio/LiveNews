#!/usr/bin/env python3
"""C2PA content credentials for GLOBIT 24's exports (docs/publishing/compliance.md section 4).

The machine-readable marking layer of AI Act Article 50(2): a signed, time-stamped C2PA manifest saying the file is
AI-produced (IPTC digital source type), what in it is AI, and who published it. Built on the open-source C2PA SDK
(c2pa-python, the Content Authenticity Initiative's binding of c2pa-rs; pip install -r tools/c2pa/requirements.txt).
server/compliance/c2pa.js calls this script; it prints one JSON object and exits 0, or prints {"error": ...} and
exits 1.

    python3 tools/c2pa/c2pa_tool.py version
    python3 tools/c2pa/c2pa_tool.py sign --in IN --out OUT --manifest MANIFEST.json --cert CHAIN.pem --key KEY.pem [--tsa URL]
    python3 tools/c2pa/c2pa_tool.py read --in FILE
"""
import argparse
import json
import mimetypes
import os
import sys

MIME = {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
}


def out(obj, code=0):
    sys.stdout.write(json.dumps(obj))
    sys.stdout.write('\n')
    sys.stdout.flush()
    sys.exit(code)


def load():
    try:
        import c2pa  # noqa: F401
        return c2pa
    except Exception as err:  # the SDK is not installed
        out({'error': f'c2pa-python is not installed ({err}); pip install -r tools/c2pa/requirements.txt'}, 1)


def mime_of(path):
    ext = os.path.splitext(path)[1].lower()
    return MIME.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream'


def cmd_version(_args):
    c2pa = load()
    out({'ok': True, 'sdk': c2pa.sdk_version(), 'mimeTypes': sorted(set(m for m in c2pa.Builder.get_supported_mime_types() if '/' in m))})


def cmd_sign(args):
    c2pa = load()
    with open(args.manifest, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    with open(args.cert, 'rb') as f:
        cert = f.read()
    with open(args.key, 'rb') as f:
        key = f.read()
    mime = mime_of(args.inp)
    manifest.setdefault('format', mime)
    info = c2pa.C2paSignerInfo(args.alg, cert, key, args.tsa or None)
    signer = c2pa.Signer.from_info(info)
    builder = c2pa.Builder(json.dumps(manifest))
    tmp = args.out + '.part'
    try:
        with open(args.inp, 'rb') as src, open(tmp, 'w+b') as dst:
            builder.sign(signer, mime, src, dst)
        os.replace(tmp, args.out)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    out({'ok': True, 'out': args.out, 'format': mime, 'timestamped': bool(args.tsa)})


def cmd_read(args):
    c2pa = load()
    mime = mime_of(args.inp)
    try:
        with open(args.inp, 'rb') as f:
            reader = c2pa.Reader(mime, f)
            store = json.loads(reader.json())
    except Exception as err:
        out({'ok': False, 'manifest': None, 'error': str(err)}, 0)
    active = store.get('active_manifest')
    manifest = (store.get('manifests') or {}).get(active) if active else None
    out({'ok': manifest is not None, 'active': active, 'manifest': manifest, 'validation_status': store.get('validation_status') or [], 'validation_state': store.get('validation_state')})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('version')
    s = sub.add_parser('sign')
    s.add_argument('--in', dest='inp', required=True)
    s.add_argument('--out', required=True)
    s.add_argument('--manifest', required=True)
    s.add_argument('--cert', required=True)
    s.add_argument('--key', required=True)
    s.add_argument('--alg', default='es256')
    s.add_argument('--tsa', default=None)
    r = sub.add_parser('read')
    r.add_argument('--in', dest='inp', required=True)
    args = p.parse_args()
    try:
        {'version': cmd_version, 'sign': cmd_sign, 'read': cmd_read}[args.cmd](args)
    except SystemExit:
        raise
    except Exception as err:
        out({'error': f'{type(err).__name__}: {err}'}, 1)


if __name__ == '__main__':
    main()
