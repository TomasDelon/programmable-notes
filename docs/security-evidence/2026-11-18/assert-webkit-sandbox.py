"""Assert the installed application's actual WebProcess enforcement from /proc.

Run as a trusted administrative observer inside the guest. No app IPC, test flags,
author scripts or UI actions are used. Exit 1 is a real failed assertion.
"""
import argparse
import json
import os
import pathlib
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--app-pid', required=True, type=int)
parser.add_argument('--timeout', type=float, default=45)
args = parser.parse_args()

def process(pid):
    base = pathlib.Path(f'/proc/{pid}')
    status = {}
    for line in (base / 'status').read_text().splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            status[key] = value.strip()
    namespaces = {}
    for name in ('mnt', 'net', 'pid', 'user', 'uts', 'ipc', 'cgroup'):
        namespaces[name] = os.readlink(base / 'ns' / name)
    return {
        'pid': pid, 'ppid': int(status['PPid']),
        'exe': os.readlink(base / 'exe'),
        'cmdline': (base / 'cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace').strip(),
        'uid': int(status['Uid'].split()[0]),
        'no_new_privs': int(status['NoNewPrivs']),
        'seccomp': int(status['Seccomp']),
        'seccomp_filters': int(status.get('Seccomp_filters', '0')),
        'apparmor': (base / 'attr/current').read_text().strip(),
        'cgroup': (base / 'cgroup').read_text().strip(),
        'namespaces': namespaces,
    }

try:
    app = process(args.app_pid)
    if app['exe'] != '/usr/bin/programmable-notes' or app['uid'] != 1000:
        raise RuntimeError('Target must be the installed /usr/bin/programmable-notes running as UID1000')
    deadline = time.monotonic() + args.timeout
    web_processes = []
    while time.monotonic() < deadline:
        processes = {}
        for entry in pathlib.Path('/proc').iterdir():
            if entry.name.isdecimal():
                try:
                    item = process(int(entry.name))
                    processes[item['pid']] = item
                except (OSError, KeyError, ValueError):
                    pass
        for item in processes.values():
            if not item['exe'].endswith('/WebKitWebProcess'):
                continue
            ancestor = item['ppid']
            seen = set()
            while ancestor in processes and ancestor not in seen:
                if ancestor == args.app_pid:
                    web_processes.append(item)
                    break
                seen.add(ancestor)
                ancestor = processes[ancestor]['ppid']
        if web_processes:
            break
        time.sleep(0.1)
    errors = []
    if not web_processes:
        errors.append('No live descendant WebKitWebProcess observed before timeout')
    for item in web_processes:
        if item['uid'] != 1000:
            errors.append(f"WebProcess {item['pid']} UID is {item['uid']}, expected1000")
        if item['no_new_privs'] != 1:
            errors.append(f"WebProcess {item['pid']} NoNewPrivs is {item['no_new_privs']}, expected1")
        if item['seccomp'] != 2 or item['seccomp_filters'] < 1:
            errors.append(f"WebProcess {item['pid']} Seccomp is {item['seccomp']} with {item['seccomp_filters']} filters, expected2 and >=1")
        for name in ('mnt', 'net', 'pid', 'user'):
            if item['namespaces'][name] == app['namespaces'][name]:
                errors.append(f"WebProcess {item['pid']} {name} namespace equals app's namespace")
    result = {'app': app, 'web_processes': web_processes, 'errors': errors, 'passed': not errors}
    print(json.dumps(result, indent=2), flush=True)
    if errors:
        print('FAIL: installed app WebKit sandbox process assertion', file=sys.stderr)
        sys.exit(1)
    print('PASS: installed app WebKit sandbox process assertion', flush=True)
except (OSError, RuntimeError, KeyError, ValueError) as error:
    print(f'FAIL: process observer could not verify the installed app: {error}', file=sys.stderr)
    sys.exit(1)
