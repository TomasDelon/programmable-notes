"""Black-box integrity/path regressions for the generated review artifact (Linux)."""
import argparse
import hashlib
import json
import os
from copy import deepcopy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Thread
import zipfile

if sys.platform != 'linux':
    raise SystemExit('NOT RUN: Linux is required for the negative filesystem fixtures')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--profile', choices=('legacy', 'web-editor'), default='legacy')
parser.add_argument('--dist', type=Path, default=Path('dist'))
parser.add_argument('--capture', type=Path)
parser.add_argument('--archive', type=Path)
parser.add_argument('--browser', action='store_true')
args = parser.parse_args()
web_editor = args.profile == 'web-editor'
if args.capture is None:
    args.capture = Path('.cache/web-editor-demo' if web_editor else '.cache/editor-demo')
if args.archive is None:
    args.archive = Path('.cache/web-review-demo.zip' if web_editor else '.cache/review-demo.zip')

def package_command(build, capture, output):
    return [sys.executable, 'scripts/package-review-demo.py',
            '--profile', args.profile, '--dist', str(build),
            '--capture', str(capture), '--output', str(output)]

archive_bytes = args.archive.read_bytes()
with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
    manifest = json.loads(archive.read('MANIFEST.json'))
    assert set(archive.namelist()) == set(manifest['sha256']) | {'MANIFEST.json'}
    assert len(archive.namelist()) == len(set(archive.namelist()))
    for name, digest in manifest['sha256'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    assert archive.testzip() is None

# Negatives must start from inputs that the current packager actually accepts.
# Otherwise a stale receipt could make every malformed-input case fail for the
# wrong reason and conceal a missing guard.
with tempfile.TemporaryDirectory(prefix='review-positive-', dir='.cache') as temporary:
    output = Path(temporary) / 'baseline.zip'
    result = subprocess.run(package_command(args.dist, args.capture, output),
                            capture_output=True, text=True)
    assert result.returncode == 0 and output.exists(), (result.stdout, result.stderr)
    with zipfile.ZipFile(output) as baseline:
        current = json.loads(baseline.read('MANIFEST.json'))
        assert current['capture'] == manifest['capture']
        assert current['sha256'] == manifest['sha256']
        verified_receipt = current['capture']

cases = ['notice-missing', 'notice-go-truncated', 'capture-change', 'capture-script-change', 'asset-change', 'asset-missing', 'asset-extra',
         'backslash-path', 'windows-dot-space-path', 'symlink', 'failed-capture']
reasons = {
    'notice-missing': 'Missing dependency redistribution notices',
    'notice-go-truncated': 'Incomplete embedded runtime notices',
    'capture-change': 'Capture checksum mismatch',
    'capture-script-change': 'Capture script changed since recording',
    'asset-change': 'Build files changed since verified capture',
    'asset-missing': 'Build files changed since verified capture',
    'asset-extra': 'Build files changed since verified capture',
    'backslash-path': 'Capture allowlist mismatch',
    'windows-dot-space-path': 'Unsafe portable artifact path',
    'symlink': 'Build symlinks are not packaged',
    'failed-capture': 'Recording did not complete successfully',
}
for case in cases:
    with (tempfile.TemporaryDirectory(prefix='review-negative-', dir='.cache') as temporary,
          zipfile.ZipFile(BytesIO(archive_bytes)) as verified_archive):
        root = Path(temporary)
        build, capture = root / 'dist', root / 'capture'
        # Every case begins with the exact bytes approved by the positive package check.
        receipt = deepcopy(verified_receipt)
        for destination, prefix, names in (
            (build, 'browser-build', verified_receipt['buildFiles']),
            (capture, 'walkthrough', verified_receipt['files']),
        ):
            for name in names:
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(verified_archive.read(f'{prefix}/{name}'))
        if case == 'notice-missing':
            (build / 'THIRD_PARTY_NOTICES.txt').unlink()
        elif case == 'notice-go-truncated':
            notice = build / 'THIRD_PARTY_NOTICES.txt'
            notice.write_bytes(notice.read_bytes().replace(Path('licenses/ESBUILD_WASM_GO_NOTICES.txt').read_bytes(), b''))
        elif case == 'capture-change':
            with (capture / 'lesson.mdx').open('ab') as file:
                file.write(b'\nchanged')
        elif case == 'capture-script-change':
            receipt['captureScriptSha256'] = '0' * 64
        elif case == 'asset-change':
            with next((build / 'assets').glob('*.js')).open('ab') as file:
                file.write(b'\n/* changed without changing index.html */')
        elif case == 'asset-missing':
            next((build / 'assets').glob('*.js')).unlink()
        elif case == 'asset-extra':
            (build / 'extra.js').write_text('/* never recorded */')
        elif case == 'backslash-path':
            name = '..\\..\\escape.txt'
            (capture / name).write_bytes(b'probe')
            receipt['files'][name] = hashlib.sha256(b'probe').hexdigest()
        elif case == 'windows-dot-space-path':
            (build / '.. ').mkdir()
            (build / '.. ' / 'escape.js').write_bytes(b'probe')
            receipt['buildFiles']['.. /escape.js'] = hashlib.sha256(b'probe').hexdigest()
        elif case == 'symlink':
            (build / 'linked.js').symlink_to('index.html')
        elif case == 'failed-capture':
            receipt['verified'] = False
        (capture / 'capture.json').write_text(json.dumps(receipt))
        output = root / 'must-not-exist.zip'
        result = subprocess.run(package_command(build, capture, output),
                                capture_output=True, text=True)
        assert result.returncode != 0 and not output.exists() and reasons[case] in result.stderr, (case, result.stdout, result.stderr)
        print(f'REVIEW_ARTIFACT_REJECTED {case}')
print(f'REVIEW_ARTIFACT_INTEGRITY_PASS manifest_crc_and_{len(cases)}_negative_cases')
if args.browser:
    with tempfile.TemporaryDirectory(prefix='review-browser-clean-', dir='.cache') as temporary:
        root = Path(temporary).resolve()
        with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
            archive.extractall(root)
        handler = partial(SimpleHTTPRequestHandler, directory=str(root / 'browser-build'))
        with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                env = dict(os.environ, REVIEW_DEMO_URL=f'http://127.0.0.1:{server.server_port}/')
                browser_command = (['node', 'scripts/demo-web-editor.mjs', '--verify-extracted']
                                   if web_editor else
                                   ['node', 'scripts/verify-review-browser.mjs'])
                subprocess.run(browser_command, env=env,
                               check=True, timeout=180)
            finally:
                server.shutdown()
                thread.join(timeout=5)
