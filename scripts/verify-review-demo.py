"""Black-box integrity/path regressions for the generated review artifact (Linux)."""
import argparse
import hashlib
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from threading import Thread
import zipfile

if sys.platform != 'linux':
    raise SystemExit('NOT RUN: Linux is required for the negative filesystem fixtures')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=Path, default=Path('.cache/review-demo.zip'))
parser.add_argument('--browser', action='store_true')
args = parser.parse_args()
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
    result = subprocess.run([sys.executable, 'scripts/package-review-demo.py',
                             '--output', str(output)], capture_output=True, text=True)
    assert result.returncode == 0 and output.exists(), (result.stdout, result.stderr)
    with zipfile.ZipFile(output) as baseline:
        current = json.loads(baseline.read('MANIFEST.json'))
        assert current['capture'] == manifest['capture']
        assert current['sha256'] == manifest['sha256']

cases = ['capture-change', 'asset-change', 'asset-missing', 'asset-extra',
         'backslash-path', 'windows-dot-space-path', 'symlink', 'failed-capture']
reasons = {
    'capture-change': 'Capture checksum mismatch',
    'asset-change': 'Build files changed since verified capture',
    'asset-missing': 'Build files changed since verified capture',
    'asset-extra': 'Build files changed since verified capture',
    'backslash-path': 'Capture allowlist mismatch',
    'windows-dot-space-path': 'Unsafe portable artifact path',
    'symlink': 'Build symlinks are not packaged',
    'failed-capture': 'Recording did not complete successfully',
}
for case in cases:
    with tempfile.TemporaryDirectory(prefix='review-negative-', dir='.cache') as temporary:
        root = Path(temporary)
        build, capture = root / 'dist', root / 'capture'
        shutil.copytree('dist', build)
        receipt = json.loads(Path('.cache/editor-demo/capture.json').read_text())
        capture.mkdir()
        for name in receipt['files']:
            target = capture / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path('.cache/editor-demo') / name, target)
        if case == 'capture-change':
            with (capture / 'lesson.mdx').open('ab') as file:
                file.write(b'\nchanged')
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
        result = subprocess.run([
            sys.executable, 'scripts/package-review-demo.py', '--dist', str(build),
            '--capture', str(capture), '--output', str(output),
        ], capture_output=True, text=True)
        assert result.returncode != 0 and not output.exists() and reasons[case] in result.stderr, (case, result.stdout, result.stderr)
        print(f'REVIEW_ARTIFACT_REJECTED {case}')
print('REVIEW_ARTIFACT_INTEGRITY_PASS manifest_crc_and_8_negative_cases')
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
                subprocess.run(['node', 'scripts/verify-review-browser.mjs'], env=env,
                               check=True, timeout=180)
            finally:
                server.shutdown()
                thread.join(timeout=5)
