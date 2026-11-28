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
pn_node=$(realpath -e "$(command -v node)")
# All later runner-side tools use immutable system paths, not the movable SDK PATH.
PATH=/usr/bin:/bin
pn_role=pn-shared-editor
pn_home=/home/pn-shared-editor
pn_evidence="$pn_repo/.cache/native-shared-evidence"
pn_created=0
pn_payload=
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
    for pn_name in native-shared-editor.json screenshot-startup.png screenshot-source.png screenshot-preview.png; do
      if sudo -H -u "$pn_role" test -f "$pn_home/evidence/$pn_name" && sudo -H -u "$pn_role" test ! -L "$pn_home/evidence/$pn_name"; then
        sudo -H -u "$pn_role" head -c 5242881 "$pn_home/evidence/$pn_name" > "$pn_evidence/$pn_name"
      fi
    done
    sudo -H -u "$pn_role" head -c 65536 "$pn_home/session.log" > "$pn_diag" 2>/dev/null
    pn_observed=$(sudo -H -u "$pn_role" head -c 80 "$pn_home/stage" 2>/dev/null)
    case "$pn_observed" in display_start|wm_start|accessibility_start|driver_start|journey|journey_finished) pn_stage=$pn_observed ;; esac
    if ! sudo userdel --remove "$pn_role" >/dev/null 2>&1; then pn_clean=false; fi
  fi
  PN_HOST_STATUS="$pn_result" PN_HOST_STAGE="$pn_stage" PN_HOST_CLEAN="$pn_clean" PN_HOST_FORCED="$pn_forced" PN_HOST_RESIDUAL="$pn_residual" "$pn_node" --input-type=module - "$pn_evidence" "$pn_diag" "$pn_payload" <<'REPORT'
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {readFile, writeFile, stat, unlink, lstat, realpath, rm, open} from 'node:fs/promises';
import {join} from 'node:path';
const [directory, diagnostic, payload = ''] = process.argv.slice(2);
let cleanupVerified = process.env.PN_HOST_CLEAN === 'true';
if (payload) {
  try {
    assert.match(payload, /^\/tmp\/pn-shared-observer-[A-Za-z0-9]{6}$/);
    const metadata = await lstat(payload);
    assert(metadata.isDirectory() && !metadata.isSymbolicLink());
    assert.equal(metadata.uid, process.geteuid());
    assert.equal(await realpath(payload), payload);
    // Linux keeps this executing immutable Node image mapped after unlink.
    // Remove its owned payload before deciding whether cleanup really passed.
    await rm(payload, {recursive: true, force: false});
  } catch { cleanupVerified = false; }
}
const knownStages = new Set(['role_setup', 'checkout_boundary', 'checkout_ancestor_exposed', 'observer_tmp_exposed', 'observer_prepare', 'role_creation', 'role_groups', 'role_sudo', 'observer_access', 'node_access', 'desktop_session', 'display_start', 'wm_start', 'accessibility_start', 'driver_start', 'journey', 'journey_finished']);
const stage = knownStages.has(process.env.PN_HOST_STAGE) ? process.env.PN_HOST_STAGE : 'unknown';
const rawExit = Number(process.env.PN_HOST_STATUS);
const exitCode = Number.isInteger(rawExit) && rawExit >= 0 && rawExit <= 255 ? rawExit : 255;
const journeyStages = new Set(['preflight', 'installed_startup', 'authorized_vault_chooser', 'source_autosave', 'undo_redo', 'invalid_source_autosave', 'source_preview_switch', 'preview_caret_autosave', 'preview_undo_redo', 'document_close_reopen', 'os_close', 'fresh_launch_reopen', 'final_os_close']);
const startupPhases = new Set(['not_started', 'driver_session', 'pid_identity', 'executable_identity', 'process_capture', 'product_ready', 'complete']);
const failureKinds = new Set(['none', 'webdriver_session_not_created', 'webdriver_unknown_error', 'webdriver_invalid_session_id', 'webdriver_no_such_window', 'webdriver_timeout', 'webdriver_invalid_argument', 'webdriver_other', 'observation_deadline', 'assertion', 'other', 'os_eperm', 'os_eacces', 'os_enoent', 'os_esrch']);
let journeyStage = 'unknown';
let startupPhase;
let failureKind;
let dialogEligible = false;
async function collectedReceipt() {
  const handle = await open(join(directory, 'native-shared-editor.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    assert(before.isFile() && before.size > 0 && before.size <= 65536);
    const bytes = Buffer.alloc(65537);
    let count = 0;
    while (count < bytes.length) {
      const read = await handle.read(bytes, count, bytes.length - count, count);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    assert.equal(count, before.size);
    assert.equal((await handle.stat()).size, before.size);
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, count)));
  } finally { await handle.close(); }
}
let result = 'failed';
try {
  const receipt = await collectedReceipt();
  // Output directories and the role home start empty. Only a receipt collected
  // from this launched journey can contribute inner diagnostics, never a setup
  // failure or foreign/malformed record. These fields authorize no success.
  if ((stage === 'journey' || stage === 'journey_finished') && receipt?.schema === 1 && receipt.scope === 'Installed shared editor, real chooser/keyboard/autosave/close/reopen; no React or containment acceptance' && ['passed', 'failed'].includes(receipt.result) && journeyStages.has(receipt.stage)) {
    journeyStage = receipt.stage;
    if (startupPhases.has(receipt.startupPhase)) startupPhase = receipt.startupPhase;
    if (failureKinds.has(receipt.failureKind)) failureKind = receipt.failureKind;
    dialogEligible = receipt.result === 'failed' && ['authorized_vault_chooser', 'fresh_launch_reopen'].includes(journeyStage) && startupPhase === 'complete' && failureKind === 'other';
  }
  if (receipt.schema === 1 && receipt.result === 'passed' && receipt.cleanupVerified === true && receipt.forcedCleanup === false && process.env.PN_HOST_STATUS === '0' && cleanupVerified && process.env.PN_HOST_FORCED === 'false' && process.env.PN_HOST_RESIDUAL === 'false') result = 'passed';
} catch { /* Missing/malformed evidence is a failed observation. */ }
for (const name of ['screenshot-startup.png', 'screenshot-source.png', 'screenshot-preview.png']) {
  const path = join(directory, name);
  try {
    const bytes = await readFile(path);
    if (bytes.length > 5 * 1024 * 1024 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') {await unlink(path); result = 'failed';}
  } catch (error) {if (error.code !== 'ENOENT') result = 'failed';}
}
try {if ((await stat(join(directory, 'native-shared-editor.json'))).size > 65536) {await unlink(join(directory, 'native-shared-editor.json')); result = 'failed';}} catch {result = 'failed';}
const raw = await readFile(diagnostic, 'utf8');
const denials = [['bubblewrap_message', /bwrap:/], ['namespace_permission', /[Nn]amespace.*[Pp]ermission/], ['sandbox_failure', /[Ss]andbox.*[Ff]ail/], ['operation_not_permitted', /Operation not permitted/], ['bubblewrap_namespace_denied', /^bwrap: Creating new namespace failed: Operation not permitted\r?$/m]].filter(([, pattern]) => pattern.test(raw)).map(([name]) => name);
// Advisory classification of terminal Python exceptions, never traceback source
// lines or raw paths/arguments. This cannot authorize success or infer a cause.
const dialogClasses = dialogEligible ? [
  ['dialog_window_missing', /^AssertionError: Native dialog not visible for PID [1-9][0-9]{0,9}: Choose local vault\r?$/m],
  ['dialog_window_ambiguous', /^AssertionError: Ambiguous native dialogs for PID [1-9][0-9]{0,9}: Choose local vault\r?$/m],
  ['dialog_location_unfocused', /^AssertionError: Native location entry did not focus\r?$/m],
  ['dialog_location_echo_mismatch', /^AssertionError: Native location entry did not echo the exact fixture path\r?$/m],
  ['dialog_dismissal_unconfirmed', /^AssertionError: Native dialog did not acknowledge choose-folder: Choose local vault\r?$/m],
  ['dialog_pyatspi_missing', /^ModuleNotFoundError: No module named 'pyatspi'\r?$/m],
  ['dialog_window_query_failed', /^RuntimeError: Native window query failed: [^\r\n]{1,2048}\r?$/m],
].filter(([, pattern]) => pattern.test(raw)).map(([name]) => name) : [];
let dialogEchoShape = 'unknown';
if (dialogEligible && dialogClasses.includes('dialog_location_echo_mismatch')) {
  const mentions = raw.split(/\r?\n/).filter(line => line.includes('NATIVE_DIALOG_ECHO'));
  const prefix = 'NATIVE_DIALOG_ECHO_SHAPE=';
  const shapes = new Set(['not_focused', 'empty', 'missing_separator', 'extra_separator', 'shorter_prefix', 'longer_prefix', 'different']);
  if (mentions.length === 1 && mentions[0].startsWith(prefix)) {
    const shape = mentions[0].slice(prefix.length);
    if (shapes.has(shape)) dialogEchoShape = shape;
  }
}
let dialogAcceptState = 'unknown';
let dialogAcceptLookup = 'unknown';
if (dialogEligible && dialogClasses.includes('dialog_dismissal_unconfirmed')) {
  const mentions = raw.split(/\r?\n/).filter(line => line.includes('NATIVE_DIALOG_ACCEPT'));
  const statePrefix = 'NATIVE_DIALOG_ACCEPT_STATE=';
  const lookupPrefix = 'NATIVE_DIALOG_ACCEPT_LOOKUP=';
  const stateLines = mentions.filter(line => line.startsWith(statePrefix));
  const lookupLines = mentions.filter(line => line.startsWith(lookupPrefix));
  const states = new Set(['not_attempted', 'not_found', 'action_error', 'action_rejected', 'action_acknowledged']);
  const lookups = new Set(['not_attempted', 'dialog_not_found', 'button_not_found', 'button_unreadable', ...Array.from({length: 16}, (_, bits) => `button_flags_${bits.toString(2).padStart(4, '0')}`)]);
  const state = stateLines[0]?.slice(statePrefix.length);
  const lookup = lookupLines[0]?.slice(lookupPrefix.length);
  // Validate the entire frame: the new lookup line must not shadow STATE, and
  // duplicate/unknown/quoted/source lines cannot smuggle either observation.
  if (stateLines.length === 1 && lookupLines.length <= 1 && mentions.length === stateLines.length + lookupLines.length && states.has(state) && (lookupLines.length === 0 || lookups.has(lookup))) {
    dialogAcceptState = state;
    // An eligible button or unattempted lookup cannot explain a not-found return.
    if (state === 'not_found' && lookupLines.length === 1 && lookup !== 'not_attempted' && lookup !== 'button_flags_1111') dialogAcceptLookup = lookup;
  }
}
await writeFile(join(directory, 'infrastructure.json'), JSON.stringify({schema: 1, result, stage, journeyStage, ...(startupPhase !== undefined ? {startupPhase} : {}), ...(failureKind !== undefined ? {failureKind} : {}), exitCode, cleanupVerified, forcedCleanup: process.env.PN_HOST_FORCED === 'true', residualApplicationProcesses: process.env.PN_HOST_RESIDUAL === 'true', denials, dialogClasses, dialogEchoShape, dialogAcceptState, dialogAcceptLookup, scope: 'Standard Ubuntu hosted editor-only observation; no React or containment acceptance'}, null, 2) + '\n', {mode: 0o600});
if (result !== 'passed') {
  // Only closed stage names, numeric codes and booleans reach the public API.
  // Never publish diagnostic text, paths, source or framework replies here.
  console.log(`::error title=Native shared editor::stage=${stage}; exitCode=${exitCode}; cleanup=${cleanupVerified}; forced=${process.env.PN_HOST_FORCED === 'true'}; residual=${process.env.PN_HOST_RESIDUAL === 'true'}; denialClasses=${denials.join(',') || 'none'}; journeyStage=${journeyStage}; startupPhase=${startupPhase ?? 'unknown'}; failureKind=${failureKind ?? 'unknown'}; dialogClasses=${dialogClasses.join(',') || 'none'}; dialogEchoShape=${dialogEchoShape}; dialogAcceptState=${dialogAcceptState}; dialogAcceptLookup=${dialogAcceptLookup}`);
  process.exitCode = 1;
}
REPORT
  pn_report=$?
  rm -f "$pn_diag"
  if [[ $pn_report != 0 ]]; then exit 1; fi
  exit "$pn_result"
}
trap cleanup EXIT
if getent passwd "$pn_role" >/dev/null; then exit 2; fi
pn_stage=checkout_boundary
[[ $(stat -c %u "$pn_repo") == "$EUID" ]]
# The observer uses only its public copy. Runner source/cache/token directories
# remain unavailable even when checkout defaults were previously permissive.
chmod 700 "$pn_repo"
pn_stage=observer_tmp_exposed
[[ -d /tmp && ! -L /tmp && $(realpath -e /tmp) == /tmp && $(stat -c %u /tmp) == 0 && $(stat -c %a /tmp) == 1777 ]]
pn_stage=observer_prepare
pn_payload=$("$pn_node" scripts/prepare-native-shared-observer.mjs)
[[ $pn_payload =~ ^/tmp/pn-shared-observer-[A-Za-z0-9]{6}$ && $(stat -c %u "$pn_payload") == "$EUID" && $(realpath -e "$pn_payload") == "$pn_payload" ]]
# Never execute the movable original SDK path after the fresh UID exists.
pn_node="$pn_payload/bin/node"
pn_stage=role_creation
sudo useradd --create-home --user-group --shell /bin/bash --no-log-init "$pn_role"
pn_created=1
pn_uid=$(id -u "$pn_role")
sudo chmod 700 "$pn_home"
pn_stage=role_groups
[[ $(id -G "$pn_role") == "$(id -g "$pn_role")" ]]
pn_stage=role_sudo
if sudo -H -u "$pn_role" env -i PATH=/usr/bin:/bin /usr/bin/sudo -n true >/dev/null 2>&1; then exit 2; fi
# A private checkout is insufficient if the fresh UID could rename one of its
# ancestors and replace the pathname before evidence collection. Ask the kernel
# about effective access at every level, including ACLs and inaccessible parents.
pn_stage=checkout_ancestor_exposed
pn_ancestor=$(dirname "$pn_repo")
while :; do
  # A sudo/PAM error must not be confused with test's ordinary false status.
  if ! sudo -H -u "$pn_role" /bin/sh -c 'if test -w "$1"; then exit 42; fi; exit 0' sh "$pn_ancestor"; then exit 2; fi
  if [[ $pn_ancestor == / ]]; then break; fi
  pn_ancestor=$(dirname "$pn_ancestor")
done
pn_stage=observer_access
sudo -H -u "$pn_role" test ! -x "$pn_repo"
sudo -H -u "$pn_role" test -r "$pn_payload/scripts/native-shared-editor.mjs"
sudo -H -u "$pn_role" test ! -w "$pn_payload"
sudo -H -u "$pn_role" test ! -w "$pn_payload/scripts"
sudo -H -u "$pn_role" test ! -w "$pn_payload/bin"
sudo -H -u "$pn_role" test ! -w "$pn_node"
for pn_file in native-shared-editor.mjs native-webdriver-lib.mjs native-ui-lib.mjs native-dialog.py native-close-window.py; do
  sudo -H -u "$pn_role" test -r "$pn_payload/scripts/$pn_file"
  sudo -H -u "$pn_role" test ! -w "$pn_payload/scripts/$pn_file"
done
pn_stage=node_access
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
  timeout -k 5s 260s dbus-run-session -- /bin/bash -s -- "$pn_payload" "$pn_node" <<'DESKTOP'
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
pn-shared-tauri-driver --native-host 127.0.0.1 --port 4444 --native-driver /usr/bin/WebKitWebDriver &
pn_services+=("$!")
pn_ready=0
for ((pn_i=0; pn_i<30; pn_i++)); do if curl --silent --fail --max-time 1 http://127.0.0.1:4444/status >/dev/null; then pn_ready=1; break; fi; sleep 0.2; done
[[ $pn_ready == 1 ]]
printf journey >"$HOME/stage"
timeout -k 5s 210s "$pn_node" scripts/native-shared-editor.mjs
printf journey_finished >"$HOME/stage"
DESKTOP
