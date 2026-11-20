"""Export reachable ZIP payloads for secret scanning without executing archive content."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path('.'))
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
objects = subprocess.check_output(['git', '-C', str(args.repo), 'rev-list', '--objects', '--all', '--no-object-names'])
metadata = subprocess.check_output(['git', '-C', str(args.repo), 'cat-file', '--batch-check'], input=objects).decode('ascii')
seen = set()
count = 0
budget = 1024 ** 3

def export(data, depth=0):
    global count, budget
    if depth >= 4:
        raise ValueError('Nested archive review limit exceeded')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            path = PurePosixPath(entry.filename)
            if (entry.flag_bits & 1 or entry.file_size > 128 * 1024 ** 2 or entry.file_size > budget or
                    path.is_absolute() or '..' in path.parts or '\\' in entry.filename):
                raise ValueError('Archive member requires explicit security review')
            if any(part.lower() in ['.env', '.ssh', '.aws', 'credentials.json', 'id_rsa', 'id_ed25519'] for part in path.parts):
                raise ValueError('Credential-shaped archive member refused')
            payload = archive.read(entry)
            budget -= len(payload)
            digest = hashlib.sha256(payload).hexdigest()
            # Opaque names avoid leaking member filenames into scanner diagnostics.
            (args.output / (digest + '.txt')).write_bytes(payload)
            count += 1
            if zipfile.is_zipfile(io.BytesIO(payload)) or payload.startswith(b'PK\x03\x04'):
                export(payload, depth + 1)

# rev-list assigns only one pathname to each object: it may choose a non-ZIP
# alias for a ZIP that appears elsewhere. Inspect every reachable blob's content.
for line in metadata.splitlines():
    oid, kind, size = line.split()
    if kind != 'blob' or oid in seen:
        continue
    seen.add(oid)
    if int(size) > 128 * 1024 ** 2:
        raise ValueError('Oversized Git blob requires explicit security review')
    data = subprocess.check_output(['git', '-C', str(args.repo), 'cat-file', 'blob', oid])
    if zipfile.is_zipfile(io.BytesIO(data)):
        export(data)
    elif data.startswith(b'PK\x03\x04'):
        raise ValueError('Malformed ZIP requires explicit security review')
print(json.dumps({'reachableBlobs': len(seen), 'logicalMembers': count, 'expandedBytes': 1024 ** 3 - budget}))
