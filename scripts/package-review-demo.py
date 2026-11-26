"""Package only verified current captures and the portable browser build. No network."""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--profile', choices=('legacy', 'web-editor'), default='legacy')
parser.add_argument('--dist', type=Path, default=Path('dist'))
parser.add_argument('--capture', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
web_editor = args.profile == 'web-editor'
if args.capture is None:
    args.capture = Path('.cache/web-editor-demo' if web_editor else '.cache/editor-demo')
if args.output is None:
    args.output = Path('.cache/web-review-demo.zip' if web_editor else '.cache/review-demo.zip')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_inside(root, name):
    portable = str(name)
    if ('\\' in portable or ':' in portable or
            PurePosixPath(portable).as_posix() != portable or
            PurePosixPath(portable).is_absolute() or
            '..' in PurePosixPath(portable).parts):
        raise ValueError('Unsafe artifact path')
    for part in PurePosixPath(portable).parts:
        if (part.endswith(('.', ' ')) or re.search(r'[<>:"\\|?*\x00-\x1f]', part) or
                re.match(r'(?i)^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)', part)):
            raise ValueError('Unsafe portable artifact path')
    name = Path(portable)
    path = root / name
    if (path.is_symlink() or not path.is_file() or
            not path.resolve().is_relative_to(root.resolve())):
        raise ValueError('Artifact must be a regular file inside its declared root')
    return path.read_bytes()

receipt_bytes = read_inside(args.capture, 'capture.json')
receipt = json.loads(receipt_bytes)
if (receipt.get('verified') is not True or
        receipt.get('schema') != (2 if web_editor else 1) or
        (web_editor and receipt.get('profile') != args.profile)):
    raise ValueError('Recording did not complete successfully')
if sha(read_inside(args.dist, 'index.html')) != receipt['buildIndexSha256']:
    raise ValueError('Build changed since the verified capture')
capture_script = 'scripts/demo-web-editor.mjs' if web_editor else 'scripts/demo-editor.mjs'
if sha(Path(capture_script).read_bytes()) != receipt['captureScriptSha256']:
    raise ValueError('Capture script changed since recording')

notice_path = args.dist / 'THIRD_PARTY_NOTICES.txt'
if not notice_path.is_file():
    raise ValueError('Missing dependency redistribution notices')
notices = read_inside(args.dist, 'THIRD_PARTY_NOTICES.txt')
if b'THIRD-PARTY NOTICES' not in notices or b'Permission is hereby granted' not in notices:
    raise ValueError('Incomplete dependency redistribution notices')
embedded_notices = Path('licenses/ESBUILD_WASM_GO_NOTICES.txt').read_bytes()
if embedded_notices not in notices:
    raise ValueError('Incomplete embedded runtime notices')
entries = {'walkthrough/capture.json': receipt_bytes,
           'THIRD_PARTY_NOTICES.txt': notices}
allowed = {'01-preview.png', '02-inline-edit.png', '03-updated.png', '04-new-note.png',
           '05-dirty-sibling.png', '06-long-input.png', 'long-note.mdx',
           '07-quote.png', 'quoted-note.mdx',
           '08-multiline-quote.png', '09-unsafe-quote.png', 'multiline-quoted-note.mdx',
           '10-source-navigation.png', '11-dense-fallback.png',
           'source-navigation.mdx', 'dense-visual.mdx',
           'walkthrough.webm', 'walkthrough.html', 'lesson.mdx', 'new-note.mdx'}
for device in ('desktop', 'tablet', 'mobile'):
    allowed.add(f'before/{device}.png')
    allowed.update(f'{device}-{mode}.png' for mode in ('source', 'split', 'visual'))
if web_editor:
    allowed = {'01-math-source.png', '02-math-corrected.png', 'lesson.mdx',
               'walkthrough.html', 'walkthrough.webm'}
    for device in ('desktop', 'tablet', 'mobile'):
        allowed.update(f'{device}-{mode}.png' for mode in ('source', 'preview'))
if set(receipt['files']) != allowed:
    raise ValueError('Capture allowlist mismatch')
for name, digest in receipt['files'].items():
    data = read_inside(args.capture, name)
    if sha(data) != digest:
        raise ValueError(f'Capture checksum mismatch: {name}')
    entries[f'walkthrough/{name}'] = data
build_files = {}
for path in sorted(args.dist.rglob('*')):
    if path.is_symlink():
        raise ValueError('Build symlinks are not packaged')
    if path.is_file():
        name = path.relative_to(args.dist).as_posix()
        data = read_inside(args.dist, name)
        entries[f'browser-build/{name}'] = data
        build_files[name] = sha(data)
if build_files != receipt['buildFiles']:
    raise ValueError('Build files changed since verified capture')
if web_editor:
    served = receipt['servedFiles']
    if (not isinstance(served, dict) or
            served.get('index.html') != build_files['index.html'] or
            any(name not in build_files or build_files[name] != digest
                for name, digest in served.items())):
        raise ValueError('Served build checksums differ from the capture build')

commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
entries['README.txt'] = b'''Programmable Notes review demo (not a public release).

Open walkthrough/walkthrough.html for the recording, screenshots and actual saved MDX.
To run the browser editor, open a terminal in browser-build and run:
  python3 -m http.server 8000 --bind 127.0.0.1
Then open http://127.0.0.1:8000 in Chromium. No Node/npm install is needed.
In Visual mode, Enter applies text and Escape cancels it. Apply before saving.
Focus Source, Visual or the toolbar and use Ctrl/Cmd+S to export MDX.
Unapplied visual text stays in memory until applied.

This is a local browser demo. Native filesystem permissions, WebKitGTK, cgroups,
and Linux recovery require separate native tests. Browser CPU/memory quotas are
not claimed. No production security readiness or public release is implied.
'''
if web_editor:
    entries['README.txt'] = b'''Programmable Notes web editor review demo

Open walkthrough/walkthrough.html for the recording, screenshots and exact MDX export.
To run the web editor, open a terminal in browser-build and run:
  python3 -m http.server 8000 --bind 127.0.0.1
Then open http://127.0.0.1:8000 in Chromium.
Use Ctrl/Cmd+K to open the command palette and switch between Preview and Source.
Save workspace persists edits in the browser. Export current source downloads the MDX.

This artifact is limited to local browser workflow review. Native runtime,
browser CPU and memory quotas, production security certification and public
release require separate evidence.
'''
entries['MANIFEST.json'] = (json.dumps({
    'sourceCommitAtAssembly': commit,
    'capture': receipt,
    'sha256': {name: sha(data) for name, data in entries.items()},
}, indent=2) + '\n').encode()
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in entries.items():
        archive.writestr(name, data)
with zipfile.ZipFile(args.output) as archive:
    if archive.testzip() is not None:
        raise ValueError('Archive CRC verification failed')
print(json.dumps({'file': str(args.output), 'bytes': args.output.stat().st_size,
                  'sha256': sha(args.output.read_bytes()), 'entries': len(entries)}))
