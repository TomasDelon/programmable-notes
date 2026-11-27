#!/usr/bin/env bash
# Editor-only installed-package witness on a disposable standard Ubuntu runner.
set -euo pipefail
if [[ $# != 0 || ${GITHUB_ACTIONS:-} != true || ${RUNNER_ENVIRONMENT:-} != github-hosted || ${RUNNER_OS:-} != Linux || ${RUNNER_ARCH:-} != X64 ]]; then
  printf 'NATIVE_SHARED_HOST_BLOCKED runner-type\n' >&2
  exit 2
fi
source /etc/os-release
if [[ $ID != ubuntu || $VERSION_ID != 24.04 || $EUID == 0 ]]; then
  printf 'NATIVE_SHARED_HOST_BLOCKED host-version-or-identity\n' >&2
  exit 2
fi
pn_repo=$(pwd -P)
pn_node=$(command -v node)
pn_role=pn-shared-editor
pn_home=/home/pn-shared-editor
pn_evidence="$pn_repo/.cache/native-shared-evidence"
pn_created=0
pn_stage=role_setup
mkdir -p "$pn_evidence"
chmod 700 "$pn_evidence"
if [[ -n $(find "$pn_evidence" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
  printf 'NATIVE_SHARED_HOST_BLOCKED stale-evidence\n' >&2
  exit 2
fi
cleanup() {
  local pn_result=$? pn_clean=true pn_forced=false pn_residual=false pn_diag
  trap - EXIT
  set +e
  pn_diag=$(mktemp "${RUNNER_TEMP:?}/pn-shared-diagnostic-XXXXXX")
  if [[ $pn_created == 1 ]]; then
    # Driver/display/accessibility services are expected until teardown. An app
    # or its WebKit children surviving the journey are a failed observation.
    if sudo pgrep -u "$pn_uid" -f '/usr/bin/programmable-notes|/WebKit(Web|Network|GPU)Process' >/dev/null; then
      pn_residual=true
      pn_result=1
    fi
    sudo pkill -TERM -u "$pn_uid" 2>/dev/null
    for ((pn_i=0; pn_i<30; pn_i++)); do
      if ! pgrep -u "$pn_uid" >/dev/null; then break; fi
      sleep 0.1
    done
    if pgrep -u "$pn_uid" >/dev/null; then
      pn_forced=true
      sudo pkill -KILL -u "$pn_uid" 2>/dev/null
      for ((pn_i=0; pn_i<20; pn_i++)); do
        if ! pgrep -u "$pn_uid" >/dev/null; then break; fi
        sleep 0.1
      done
    fi
    if pgrep -u "$pn_uid" >/dev/null; then pn_clean=false; fi
    # Read only as the ordinary role: a changed path cannot turn collection into
    # root access to another user's data. Never copy a home/profile/log tree.
    for pn_name in native-shared-editor.json screenshot-source.png screenshot-preview.png; do
      if sudo -H -u "$pn_role" test -f "$pn_home/evidence/$pn_name" && sudo -H -u "$pn_role" test ! -L "$pn_home/evidence/$pn_name"; then
        sudo -H -u "$pn_role" head -c 5242881 "$pn_home/evidence/$pn_name" > "$pn_evidence/$pn_name"
      fi
    done
    sudo -H -u "$pn_role" head -c 65536 "$pn_home/session.log" > "$pn_diag" 2>/dev/null
    pn_observed=$(sudo -H -u "$pn_role" head -c 80 "$pn_home/stage" 2>/dev/null)
    case "$pn_observed" in display_start|wm_start|accessibility_start|driver_start|journey|journey_finished) pn_stage=$pn_observed ;; esac
    if ! sudo userdel --remove "$pn_role" >/dev/null 2>&1; then pn_clean=false; fi
  fi
  PN_HOST_STATUS="$pn_result" PN_HOST_STAGE="$pn_stage" PN_HOST_CLEAN="$pn_clean" PN_HOST_FORCED="$pn_forced" PN_HOST_RESIDUAL="$pn_residual" "$pn_node" --input-type=module - "$pn_evidence" "$pn_diag" <<'REPORT'
import {readFile, writeFile, stat, unlink} from 'node:fs/promises';
import {join} from 'node:path';
const [directory, diagnostic] = process.argv.slice(2);
let result = 'failed';
try {
  const receipt = JSON.parse(await readFile(join(directory, 'native-shared-editor.json'), 'utf8'));
  if (receipt.schema === 1 && receipt.result === 'passed' && receipt.cleanupVerified === true && receipt.forcedCleanup === false && process.env.PN_HOST_STATUS === '0' && process.env.PN_HOST_CLEAN === 'true' && process.env.PN_HOST_FORCED === 'false' && process.env.PN_HOST_RESIDUAL === 'false') result = 'passed';
} catch { /* Missing/malformed evidence is a failed observation. */ }
for (const name of ['screenshot-source.png', 'screenshot-preview.png']) {
  const path = join(directory, name);
  try {
    const bytes = await readFile(path);
    if (bytes.length > 5 * 1024 * 1024 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') {await unlink(path); result = 'failed';}
  } catch (error) {if (error.code !== 'ENOENT') result = 'failed';}
}
try {if ((await stat(join(directory, 'native-shared-editor.json'))).size > 65536) {await unlink(join(directory, 'native-shared-editor.json')); result = 'failed';}} catch {result = 'failed';}
const raw = await readFile(diagnostic, 'utf8');
const denials = raw.split(/\r?\n/).filter(line => /bwrap:|[Nn]amespace.*[Pp]ermission|[Ss]andbox.*[Ff]ail|Operation not permitted/.test(line)).slice(-8).map(line => line.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 512));
await writeFile(join(directory, 'infrastructure.json'), JSON.stringify({schema: 1, result, stage: process.env.PN_HOST_STAGE, exitCode: Number(process.env.PN_HOST_STATUS), cleanupVerified: process.env.PN_HOST_CLEAN === 'true', forcedCleanup: process.env.PN_HOST_FORCED === 'true', residualApplicationProcesses: process.env.PN_HOST_RESIDUAL === 'true', denials, scope: 'Standard Ubuntu hosted editor-only observation; no React or containment acceptance'}, null, 2) + '\n', {mode: 0o600});
if (result !== 'passed') process.exitCode = 1;
REPORT
  pn_report=$?
  rm -f "$pn_diag"
  if [[ $pn_report != 0 ]]; then exit 1; fi
  exit "$pn_result"
}
trap cleanup EXIT
if getent passwd "$pn_role" >/dev/null; then exit 2; fi
sudo useradd --create-home --user-group --shell /bin/bash --no-log-init "$pn_role"
pn_created=1
pn_uid=$(id -u "$pn_role")
sudo chmod 700 "$pn_home"
[[ $(id -G "$pn_role") == "$(id -g "$pn_role")" ]]
if sudo -H -u "$pn_role" env -i PATH=/usr/bin:/bin /usr/bin/sudo -n true >/dev/null 2>&1; then exit 2; fi
sudo -H -u "$pn_role" test -r "$pn_repo/scripts/native-shared-editor.mjs"
sudo -H -u "$pn_role" test ! -w "$pn_repo"
sudo -H -u "$pn_role" test -x "$pn_node"
sudo -H -u "$pn_role" mkdir -m 700 "$pn_home/runtime" "$pn_home/evidence"
pn_stage=desktop_session
sudo -H -u "$pn_role" env -i \
  HOME="$pn_home" USER="$pn_role" LOGNAME="$pn_role" \
  PATH=/usr/bin:/bin:/usr/local/bin LANG=C.UTF-8 \
  DISPLAY=:91 XAUTHORITY="$pn_home/.Xauthority" XDG_RUNTIME_DIR="$pn_home/runtime" \
  GTK_MODULES=atk-bridge NO_AT_BRIDGE=0 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  NATIVE_DISPOSABLE_PROFILE=1 NATIVE_SHARED_EVIDENCE="$pn_home/evidence/native-shared-editor.json" \
  timeout -k 5s 260s dbus-run-session -- /bin/bash -s -- "$pn_repo" "$pn_node" <<'DESKTOP'
set -euo pipefail
exec >"$HOME/session.log" 2>&1
cd "$1"
pn_node=$2
pn_services=()
trap 'if ((${#pn_services[@]})); then kill "${pn_services[@]}" 2>/dev/null || true; fi' EXIT
printf display_start >"$HOME/stage"
xauth -f "$XAUTHORITY" add "$DISPLAY" . "$(mcookie)"
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp -auth "$XAUTHORITY" &
pn_services+=("$!")
pn_ready=0
for ((pn_i=0; pn_i<50; pn_i++)); do if xdpyinfo >/dev/null 2>&1; then pn_ready=1; break; fi; sleep 0.1; done
[[ $pn_ready == 1 ]]
printf wm_start >"$HOME/stage"
openbox --sm-disable &
pn_services+=("$!")
pn_ready=0
for ((pn_i=0; pn_i<50; pn_i++)); do if xprop -root _NET_SUPPORTING_WM_CHECK | grep -Eq 'window id # 0x[1-9a-f]'; then pn_ready=1; break; fi; sleep 0.1; done
[[ $pn_ready == 1 ]]
printf accessibility_start >"$HOME/stage"
timeout -k 1s 10s gsettings set org.gnome.desktop.interface toolkit-accessibility true
timeout -k 1s 10s dbus-update-activation-environment DISPLAY XAUTHORITY XDG_RUNTIME_DIR
timeout -k 1s 10s gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.a11y.Bus.GetAddress
printf driver_start >"$HOME/stage"
pn-shared-tauri-driver --host 127.0.0.1 --port 4444 --native-driver /usr/bin/WebKitWebDriver &
pn_services+=("$!")
pn_ready=0
for ((pn_i=0; pn_i<30; pn_i++)); do if curl --silent --fail --max-time 1 http://127.0.0.1:4444/status >/dev/null; then pn_ready=1; break; fi; sleep 0.2; done
[[ $pn_ready == 1 ]]
printf journey >"$HOME/stage"
timeout -k 5s 210s "$pn_node" scripts/native-shared-editor.mjs
printf journey_finished >"$HOME/stage"
DESKTOP
