#!/usr/bin/env bash
# Never echo finding values or upload the private scanner reports.
set -euo pipefail
pn_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
pn_repo=${1:-$pn_root}
mkdir -p "$pn_root/.cache/security-tools"
pn_work=$(mktemp -d "$pn_root/.cache/security-scan-XXXXXX")
pn_tools="$pn_root/.cache/security-tools"
chmod 700 "$pn_work"
pn_version=8.30.1
pn_archive_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
pn_tool=${PN_GITLEAKS_BIN:-$pn_tools/gitleaks}
if [ ! -x "$pn_tool" ]; then
  curl --fail --location --retry 3 "https://github.com/gitleaks/gitleaks/releases/download/v$pn_version/gitleaks_${pn_version}_linux_x64.tar.gz" -o "$pn_tools/gitleaks.tar.gz"
  printf '%s  %s\n' "$pn_archive_sha" "$pn_tools/gitleaks.tar.gz" | sha256sum --check --status
  tar -xzf "$pn_tools/gitleaks.tar.gz" -C "$pn_tools" gitleaks
fi
[ "$("$pn_tool" version)" = "$pn_version" ]
pn_status=0
"$pn_tool" git "$pn_repo" --log-opts='--all --full-history' --redact=100 --ignore-gitleaks-allow --gitleaks-ignore-path "$pn_root/.gitleaksignore" --no-banner --report-format=json --report-path="$pn_work/history.json" --timeout=300 > "$pn_work/history.log" 2>&1 || pn_status=$?
python3 "$pn_root/scripts/audit-git-archives.py" --repo "$pn_repo" --output "$pn_work/archive-members" > "$pn_work/archive-inventory.json"
"$pn_tool" dir "$pn_work/archive-members" --max-archive-depth=4 --redact=100 --ignore-gitleaks-allow --no-banner --report-format=json --report-path="$pn_work/archives.json" --timeout=300 > "$pn_work/archives.log" 2>&1 || pn_status=$?
python3 - "$pn_work" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
for name in ['history', 'archives']:
    path = root / (name + '.json')
    if not path.is_file():
        raise SystemExit('Secret scanner did not produce a complete report')
    rows = json.loads(path.read_text())
    print(json.dumps({'secretScan': name, 'findings': len(rows), 'rules': sorted({r['RuleID'] for r in rows})}))
PY
exit "$pn_status"
