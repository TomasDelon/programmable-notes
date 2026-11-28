#!/usr/bin/env bash
# Local editor-only witness. Retains the dedicated account, observer payload and evidence.
# The unchanged journey removes only its own disposable synthetic fixture.
# Outcome: A03/A07 real installed editing. Invariants: scoped authority/isolation.
# Witness: unchanged production GUI journey. Done: receipts plus clean app exit.
set -euo pipefail
PATH=/usr/bin:/bin
umask 077
export PATH
refuse() { printf 'NATIVE_SHARED_LOCAL_REFUSED %s\n' "$1" >&2; exit 2; }
[[ $# == 6 ]] || refuse arguments
[[ $EUID == 0 ]] || refuse administrator-required
pn_owner=$1 pn_payload=$2 pn_owner_home=$3 pn_app_hash=$4 pn_node_hash=$5 pn_driver_hash=$6
[[ $pn_owner =~ ^[1-9][0-9]*$ && $pn_owner == 1000 ]] || refuse owner
[[ $pn_payload =~ ^/tmp/pn-shared-observer-[A-Za-z0-9]{6}$ ]] || refuse payload-path
[[ $pn_owner_home == /home/* && $pn_owner_home != /home/pn-local-20261128 && $(realpath -e "$pn_owner_home") == "$pn_owner_home" ]] || refuse owner-home
for pn_hash in "$pn_app_hash" "$pn_node_hash" "$pn_driver_hash"; do [[ $pn_hash =~ ^[a-f0-9]{64}$ ]] || refuse digest; done
[[ $(uname -m) == x86_64 ]] || refuse architecture
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 26.04 ]] || refuse distribution
pn_role=pn-local-20261128 pn_uid=1001 pn_home=/home/pn-local-20261128
[[ $(id -u "$pn_role") == "$pn_uid" && $(id -G "$pn_role") == "$(id -g "$pn_role")" ]] || refuse role
[[ $(getent passwd "$pn_role" | cut -d: -f6) == "$pn_home" && ! -L $pn_home && $(stat -c '%u:%a' "$pn_home") == 1001:700 ]] || refuse role-home
[[ $(getent passwd "$pn_owner" | cut -d: -f6) == "$pn_owner_home" ]] || refuse owner-identity
if pgrep -u "$pn_uid" >/dev/null; then refuse role-busy; fi
[[ -x /usr/sbin/runuser ]] || refuse runuser-unavailable
role() { /usr/sbin/runuser -u "$pn_role" -- env -i HOME="$pn_home" USER="$pn_role" LOGNAME="$pn_role" PATH=/usr/bin:/bin LANG=C.UTF-8 "$@"; }
role test ! -x "$pn_owner_home" || refuse owner-home-exposed
if role /usr/bin/sudo -n true >/dev/null 2>&1; then refuse role-sudo; fi
[[ ! -L $pn_payload && $(realpath -e "$pn_payload") == "$pn_payload" && $(stat -c %u "$pn_payload") == "$pn_owner" ]] || refuse payload-owner
for pn_dir in "$pn_payload" "$pn_payload/bin" "$pn_payload/scripts"; do
  [[ -d $pn_dir && ! -L $pn_dir && $(stat -c %u "$pn_dir") == "$pn_owner" ]] || refuse payload-directory
  role test ! -w "$pn_dir" || refuse payload-writable
done
for pn_name in bin/node bin/tauri-driver scripts/native-shared-editor.mjs scripts/native-webdriver-lib.mjs scripts/native-ui-lib.mjs scripts/native-dialog.py scripts/native-close-window.py; do
  pn_file="$pn_payload/$pn_name"
  [[ -f $pn_file && ! -L $pn_file && $(stat -c %u "$pn_file") == "$pn_owner" ]] || refuse payload-file
  role test -r "$pn_file" || refuse payload-unreadable
  role test ! -w "$pn_file" || refuse payload-writable
done
[[ -f /usr/bin/programmable-notes && ! -L /usr/bin/programmable-notes ]] || refuse application-file
[[ $(sha256sum /usr/bin/programmable-notes | cut -d' ' -f1) == "$pn_app_hash" ]] || refuse application-digest
[[ $(sha256sum "$pn_payload/bin/node" | cut -d' ' -f1) == "$pn_node_hash" ]] || refuse node-digest
[[ $(sha256sum "$pn_payload/bin/tauri-driver" | cut -d' ' -f1) == "$pn_driver_hash" ]] || refuse driver-digest
[[ $(role "$pn_payload/bin/node" --version) == v24.22.1 ]] || refuse node-version
# Cargo's locked installation receipt establishes version; this binary only
# supports --help. Its exact image hash is bound above before probing features.
pn_driver_help=$(role "$pn_payload/bin/tauri-driver" --help) || refuse driver-help
[[ $pn_driver_help == *'USAGE: tauri-driver [FLAGS] [OPTIONS]'* && $pn_driver_help == *'--native-driver PATH'* && $pn_driver_help == *'--native-host HOST'* && $pn_driver_help == *'--port NUMBER'* ]] || refuse driver-capabilities
for pn_tool in Xvfb xauth openbox xdpyinfo xprop gsettings dbus-run-session WebKitWebDriver python3; do command -v "$pn_tool" >/dev/null || refuse dependency; done
[[ ! -e /tmp/.X91-lock && ! -e /tmp/.X11-unix/X91 ]] || refuse display-busy
if /usr/bin/python3 - <<'PY'
import socket
s=socket.socket()
try: s.bind(('127.0.0.1',4444))
except OSError: raise SystemExit(1)
finally: s.close()
PY
then :; else refuse driver-port-busy; fi
pn_evidence=$(role mktemp -d "$pn_home/evidence-XXXXXX")
[[ $pn_evidence =~ ^/home/pn-local-20261128/evidence-[A-Za-z0-9]{6}$ ]] || refuse evidence-path
printf 'NATIVE_SHARED_LOCAL_EVIDENCE %s\n' "$pn_evidence"
# Only exact observed UID/start-time identities are signalled; never another user.
cleanup() {
  pn_exit=$?
  trap - EXIT
  set +e
  if /usr/bin/python3 - "$pn_uid" "$pn_evidence" "$pn_exit" <<'PY'
import os,signal,sys,time,json
uid=int(sys.argv[1]); directory=sys.argv[2]; result=int(sys.argv[3]); owned={}
def identity(pid):
    try:
        if os.stat('/proc/'+str(pid)).st_uid != uid: return None
        return open('/proc/'+str(pid)+'/stat').read().rsplit(')',1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError): return None
for name in os.listdir('/proc'):
    if name.isdigit():
        value=identity(int(name))
        if value: owned[int(name)]=value
residual=bool(owned); forced=False
for sig in (signal.SIGTERM, signal.SIGKILL):
    current={pid:start for pid,start in owned.items() if identity(pid)==start}
    if not current: break
    if sig==signal.SIGKILL: forced=True
    for pid,start in current.items():
        if identity(pid)==start:
            try: os.kill(pid,sig)
            except ProcessLookupError: pass
    deadline=time.monotonic()+3
    while time.monotonic()<deadline and any(identity(pid)==start for pid,start in current.items()): time.sleep(.05)
# A child can be born while an initially captured parent handles termination.
# Never claim cleanup from the original snapshot alone. Newly observed processes
# are not signalled without a captured identity; their presence fails this run.
remaining={int(name):identity(int(name)) for name in os.listdir('/proc') if name.isdigit()}
clean=not any(remaining.values())
residual=residual or not clean
# Drop privileges before opening anything in the retained test-user directory.
import pwd
account=pwd.getpwuid(uid); os.setgroups([]); os.setgid(account.pw_gid); os.setuid(uid)
receipt={'schema':1,'exitCode':result,'cleanupVerified':clean,'forcedCleanup':forced,'residualProcesses':residual,'scope':'Local Ubuntu26.04 editor-only observation; no React or containment acceptance','retained':True}
fd=os.open(directory+'/local-infrastructure.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as output: json.dump(receipt,output); output.write('\n')
if result or residual or forced or not clean: raise SystemExit(1)
PY
  then pn_cleanup=0; else pn_cleanup=$?; fi
  # Read retained outputs only as the role; create the collected copy as the
  # owner. No root filesystem read/write follows a role-controlled filename.
  role "$pn_payload/bin/node" --input-type=module - "$pn_evidence" <<'COLLECT' | /usr/sbin/runuser -u "$(getent passwd "$pn_owner" | cut -d: -f1)" -- env -i PATH=/usr/bin:/bin LANG=C.UTF-8 "$pn_payload/bin/node" --input-type=module -e '
import {mkdtemp,writeFile} from "node:fs/promises";
const chunks=[];for await(const chunk of process.stdin) chunks.push(chunk);
const files=JSON.parse(Buffer.concat(chunks).toString("utf8"));
const directory=await mkdtemp("/tmp/pn-local-collected-");
for(const [name,data] of files) await writeFile(directory+"/"+name,Buffer.from(data,"base64"),{flag:"wx",mode:0o600});
console.log("NATIVE_SHARED_LOCAL_COLLECTED "+directory);
'
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
const directory=process.argv[2], files=[];
for(const name of ['local-infrastructure.json','native-shared-editor.json','screenshot-startup.png','screenshot-source.png','screenshot-preview.png']) {
  let handle;
  try {
    handle=await open(directory+'/'+name,constants.O_RDONLY|constants.O_NOFOLLOW);
    const metadata=await handle.stat();
    const limit=name.endsWith('.json')?65536:5*1024*1024;
    if(!metadata.isFile()||metadata.size>limit) throw Error('Invalid evidence');
    const bytes=Buffer.alloc(metadata.size+1);
    let count=0;
    while(count<bytes.length) {const read=await handle.read(bytes,count,bytes.length-count,count);if(!read.bytesRead)break;count+=read.bytesRead;}
    if(count!==metadata.size||(await handle.stat()).size!==metadata.size) throw Error('Changed evidence');
    if(name.endsWith('.png')&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw Error('Invalid screenshot');
    if(name.endsWith('.json')) JSON.parse(bytes.subarray(0,count).toString('utf8'));
    files.push([name,bytes.subarray(0,count).toString('base64')]);
  } catch(error) {if(error.code!=='ENOENT') throw error;} finally {await handle?.close();}
}
console.log(JSON.stringify(files));
COLLECT
  pn_collection=$?
  if [[ $pn_cleanup != 0 || $pn_collection != 0 ]]; then exit 1; fi
  exit "$pn_exit"
}
trap cleanup EXIT
role mkdir -m 700 "$pn_evidence/runtime"
role env DISPLAY=:91 XAUTHORITY="$pn_evidence/Xauthority" XDG_RUNTIME_DIR="$pn_evidence/runtime" GTK_MODULES=atk-bridge NO_AT_BRIDGE=0 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 NATIVE_DISPOSABLE_PROFILE=1 NATIVE_SHARED_EVIDENCE="$pn_evidence/native-shared-editor.json" timeout -k 5s 260s dbus-run-session -- /bin/bash -s -- "$pn_payload" "$pn_evidence" <<'DESKTOP'
set -euo pipefail
cd "$1"
pn_payload=$1 pn_evidence=$2
exec >"$pn_evidence/session.log" 2>&1
pn_services=()
pn_starts=()
track() {
  pn_services+=("$1")
  pn_starts+=("$(sed 's/.*) //' "/proc/$1/stat" | cut -d' ' -f20)")
}
stop_services() {
  for pn_index in "${!pn_services[@]}"; do
    pn_pid=${pn_services[$pn_index]}
    pn_current=$(sed 's/.*) //' "/proc/$pn_pid/stat" 2>/dev/null | cut -d' ' -f20) || continue
    if [[ $pn_current == "${pn_starts[$pn_index]}" ]]; then kill -TERM "$pn_pid" 2>/dev/null || true; fi
  done
  wait || true
}
trap stop_services EXIT
xauth -f "$XAUTHORITY" add "$DISPLAY" . "$(mcookie)"
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp -auth "$XAUTHORITY" &
track "$!"
for ((pn_i=0; pn_i<50; pn_i++)); do if xdpyinfo >/dev/null 2>&1; then break; fi; sleep .1; done
xdpyinfo >/dev/null
openbox --sm-disable &
track "$!"
for ((pn_i=0; pn_i<50; pn_i++)); do if xprop -root _NET_SUPPORTING_WM_CHECK | grep -Eq 'window id # 0x[1-9a-f]'; then break; fi; sleep .1; done
xprop -root _NET_SUPPORTING_WM_CHECK | grep -Eq 'window id # 0x[1-9a-f]'
timeout 10s gsettings set org.gnome.desktop.interface toolkit-accessibility true
timeout 10s dbus-update-activation-environment DISPLAY XAUTHORITY XDG_RUNTIME_DIR
timeout 10s gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method org.a11y.Bus.GetAddress
"$pn_payload/bin/tauri-driver" --native-host 127.0.0.1 --port 4444 --native-driver /usr/bin/WebKitWebDriver &
track "$!"
for ((pn_i=0; pn_i<30; pn_i++)); do if curl --silent --fail --max-time 1 http://127.0.0.1:4444/status >/dev/null; then break; fi; sleep .2; done
curl --silent --fail --max-time 1 http://127.0.0.1:4444/status >/dev/null
timeout -k 5s 210s "$pn_payload/bin/node" scripts/native-shared-editor.mjs
DESKTOP
