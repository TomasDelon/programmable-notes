#!/usr/bin/python3
"""Fixed guest diagnostic session. No caller payload, privileges or native acceptance."""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/home/fixture/native-inline-react-v1')
UID = 1001
LOG_LIMIT = 256 * 1024
JSON_LIMIT = 16 * 1024
OBSERVATIONS = ('bridge', 'pointer', 'keyboard', 'termination', 'host_input')
REASONS = frozenset(('none', 'not_run', 'preflight_refused', 'desktop_failed', 'observer_failed',
                     'receipt_invalid', 'output_limit', 'deadline', 'interrupted', 'cleanup_failed',
                     'xauth_deadline', 'display_readiness_deadline', 'xvfb_exited', 'internal_error'))
START_FAILURES = frozenset(('not_run', 'none', 'unknown', 'unit_not_active', 'network_not_isolated',
                            'privileges_missing', 'invalid_limits', 'input_rejected'))
SOURCES = (
    "src-tauri/src/preview_browser_guards.rs", "src-tauri/src/preview_activation.rs",
    'scripts/native-inline-react-v1/host/src/main.rs',
    'scripts/native-inline-react-v1/host/src/native_snapshot.rs',
    'scripts/native-inline-react-v1/host/build.rs',
    'scripts/native-inline-react-v1/host/Cargo.toml',
    'scripts/native-inline-react-v1/host/Cargo.lock',
    'scripts/native-inline-react-v1/compile.mjs',
    'scripts/native-inline-react-v1/document.mdx',
    'native-policy/src/lib.rs', 'native-policy/Cargo.toml',
    'native-policy/Cargo.lock', 'package.json', 'package-lock.json', '.nvmrc',
)
INTERRUPTED = False

# Fixed native test-driver protocol, adapted from scripts/native-close-window.py.
# Runs through the same bounded owned-child tool path; never destroys the window.
CLOSE_HOST = r'''
import ctypes as c
import sys
assert len(sys.argv) == 2
raw = sys.argv[1]
assert raw.isascii() and raw.isdecimal() and 1 <= len(raw) <= 20
window = int(raw)
assert 0 < window < 2**64 and str(window) == raw
x11 = c.CDLL('libX11.so.6')
x11.XOpenDisplay.argtypes = [c.c_char_p]
x11.XOpenDisplay.restype = c.c_void_p
x11.XInternAtom.argtypes = [c.c_void_p, c.c_char_p, c.c_int]
x11.XInternAtom.restype = c.c_ulong
class ClientMessage(c.Structure):
    _fields_ = [('type', c.c_int), ('serial', c.c_ulong), ('send_event', c.c_int),
               ('display', c.c_void_p), ('window', c.c_ulong),
               ('message_type', c.c_ulong), ('format', c.c_int),
               ('data', c.c_long * 5)]
class Event(c.Union):
    _fields_ = [('client', ClientMessage), ('pad', c.c_long * 24)]
x11.XSendEvent.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_long, c.POINTER(Event)]
x11.XSendEvent.restype = c.c_int
x11.XFlush.argtypes = [c.c_void_p]
x11.XCloseDisplay.argtypes = [c.c_void_p]
display = x11.XOpenDisplay(None)
assert display
try:
    event = Event()
    event.client = ClientMessage(33, 0, 1, display, window,
        x11.XInternAtom(display, b'WM_PROTOCOLS', 0), 32,
        (c.c_long * 5)(x11.XInternAtom(display, b'WM_DELETE_WINDOW', 0), 0, 0, 0, 0))
    assert x11.XSendEvent(display, window, 0, 0, c.byref(event)) != 0
    x11.XFlush(display)
finally:
    x11.XCloseDisplay(display)
'''


class Refused(Exception):
    pass


def check(condition, reason='preflight_refused'):
    if not condition:
        raise Refused(reason)


def pairs(items):
    result = {}
    for key, value in items:
        check(key not in result)
        result[key] = value
    return result


def decode(data):
    try:
        return json.loads(data, object_pairs_hook=pairs,
                          parse_constant=lambda _: check(False))
    except (ValueError, UnicodeError, TypeError) as error:
        raise Refused('receipt_invalid') from error


def private_directory(path):
    value = path.lstat()
    check(stat.S_ISDIR(value.st_mode) and value.st_uid == UID
          and stat.S_IMODE(value.st_mode) == 0o700)
    return value.st_dev, value.st_ino


def read_file(path, limit, mode=0o600):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        raise Refused('preflight_refused') from error
    try:
        value = os.fstat(fd)
        check(stat.S_ISREG(value.st_mode) and value.st_uid == UID
              and value.st_nlink == 1 and stat.S_IMODE(value.st_mode) == mode
              and 0 < value.st_size <= limit)
        data = bytearray()
        while len(data) <= limit:
            chunk = os.read(fd, min(65536, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
        check(len(data) == value.st_size and len(data) <= limit)
        return bytes(data), (value.st_dev, value.st_ino)
    finally:
        os.close(fd)


class Artifacts:
    def __enter__(self):
        # Reject ancestor aliases as well as the final directory symlink.
        check(ROOT.is_absolute() and ROOT.resolve(strict=True) == ROOT)
        self.root_identity = private_directory(ROOT)
        check(set(os.listdir(ROOT)) == {'host', 'session.py', 'observer.py', 'manifest.json'})
        self.raw, self.manifest_identity = read_file(ROOT / 'manifest.json', JSON_LIMIT)
        manifest = decode(self.raw)
        check(type(manifest) is dict and set(manifest) == {
            'version', 'profile', 'native_app_tested', 'files', 'sources'})
        check(type(manifest['version']) is int and manifest['version'] == 1
              and manifest['profile'] == 'inline-react-guarded-v2'
              and manifest['native_app_tested'] is False)
        check(type(manifest['sources']) is dict and set(manifest['sources']) == set(SOURCES))
        check(all(type(value) is str and re.fullmatch('[0-9a-f]{64}', value)
                  for value in manifest['sources'].values()))
        check(type(manifest['files']) is dict and set(manifest['files']) == {'host', 'session.py', 'observer.py'})
        self.files = manifest['files']
        self.identities = {}
        for name, specification in self.files.items():
            cap = 64 * 1024 * 1024 if name == 'host' else LOG_LIMIT
            check(type(specification) is dict and set(specification) == {'bytes', 'sha256'})
            check(type(specification['bytes']) is int and 1 <= specification['bytes'] <= cap)
            check(type(specification['sha256']) is str and re.fullmatch('[0-9a-f]{64}', specification['sha256']))
            data, identity_value = read_file(ROOT / name, cap, 0o700 if name == 'host' else 0o600)
            check(len(data) == specification['bytes'] and hashlib.sha256(data).hexdigest() == specification['sha256'])
            self.identities[name] = identity_value
        return self

    def __exit__(self, *_):
        return False

    def verify(self):
        check(private_directory(ROOT) == self.root_identity)
        check(set(os.listdir(ROOT)) in ({'host', 'session.py', 'observer.py', 'manifest.json'},
                                       {'host', 'session.py', 'observer.py', 'manifest.json', 'run'}))
        raw, identity_value = read_file(ROOT / 'manifest.json', JSON_LIMIT)
        check(raw == self.raw and identity_value == self.manifest_identity)
        for name, expected in self.identities.items():
            spec = self.files[name]
            data, current = read_file(ROOT / name, spec['bytes'], 0o700 if name == 'host' else 0o600)
            check(current == expected and hashlib.sha256(data).hexdigest() == spec['sha256'])

    def scope(self):
        check(ROOT.resolve(strict=True) == ROOT and private_directory(ROOT) == self.root_identity)
        for suffix, expected in getattr(self, 'layout', {}).items():
            check(private_directory(ROOT / suffix) == expected)
        for name, expected in self.identities.items():
            value = (ROOT / name).lstat()
            check(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and value.st_uid == UID
                  and (value.st_dev, value.st_ino) == expected
                  and stat.S_IMODE(value.st_mode) == (0o700 if name == 'host' else 0o600))


def create_layout(artifacts):
    artifacts.verify()
    artifacts.layout = {}
    try:
        for suffix in ('run', 'run/auth', 'run/evidence', 'run/evidence/stop', 'run/evidence/expiry'):
            (ROOT / suffix).mkdir(mode=0o700)
            artifacts.layout[suffix] = private_directory(ROOT / suffix)
    except FileExistsError as error:
        raise Refused('preflight_refused') from error


def desktop_environment():
    return {'PATH': '/usr/bin:/bin', 'HOME': '/home/fixture', 'USER': 'fixture',
            'LOGNAME': 'fixture', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'DISPLAY': ':93', 'XAUTHORITY': str(ROOT / 'run/auth/Xauthority'),
            'XDG_RUNTIME_DIR': '/run/user/1001',
            'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/1001/bus',
            'GDK_BACKEND': 'x11', 'WEBKIT_DISABLE_COMPOSITING_MODE': '1',
            'WEBKIT_DISABLE_DMABUF_RENDERER': '1'}


def xvfb_arguments():
    return ['/usr/bin/Xvfb', ':93', '-screen', '0', '900x700x24',
            '-nolisten', 'tcp', '-auth', str(ROOT / 'run/auth/Xauthority')]


def identity(pid):
    text = Path('/proc', str(pid), 'stat').read_text()
    fields = text.rsplit(')', 1)[1].split()
    return fields[19], fields[0]


class Owned:
    def __init__(self, process, start):
        self.process, self.start = process, start

    def close(self):
        process = self.process
        if process.poll() is not None:
            return
        check(identity(process.pid)[0] == self.start[0], 'cleanup_failed')
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            check(identity(process.pid)[0] == self.start[0], 'cleanup_failed')
            os.killpg(process.pid, signal.SIGKILL)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired as error:
                raise Refused('cleanup_failed') from error


class Log:
    def __init__(self, path):
        self.path = path
        self.size = 0

    def __enter__(self):
        self.fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        return self

    def write(self, data):
        available = LOG_LIMIT - self.size
        selected = data[:available]
        while selected:
            count = os.write(self.fd, selected)
            selected = selected[count:]
        self.size += min(len(data), available)
        check(len(data) <= available, 'output_limit')

    def __exit__(self, *_):
        os.close(self.fd)


def validate_receipt(value, case):
    keys = {'version', 'profile', 'case', 'scope', 'native_app_tested',
            'status', 'phase', 'reason', *OBSERVATIONS}
    check(type(value) is dict and set(value) == keys, 'receipt_invalid')
    check(type(value['version']) is int and value['version'] == 1
          and value['profile'] == 'inline-react-guarded-v2' and value['case'] == case
          and value['scope'] == 'fixed-native-diagnostic-only'
          and value['native_app_tested'] is False
          and value['status'] == 'passed' and value['phase'] == 'complete'
          and value['reason'] == 'none', 'receipt_invalid')
    for field in OBSERVATIONS:
        expected = 'not_run' if case == 'expiry' and field in ('pointer', 'keyboard', 'host_input') else 'passed'
        check(value[field] == expected, 'receipt_invalid')


def exit_diagnostic(owned):
    if owned is None:
        return {'state': 'not_started', 'code': None}
    try:
        code = owned.process.poll()
        if code is None:
            return {'state': 'running', 'code': None}
        if type(code) is int and -64 <= code <= 255:
            return {'state': 'exited', 'code': code}
    except Exception:
        pass
    return {'state': 'unknown', 'code': None}


def empty_diagnostic():
    return {'original_reason': 'not_run', 'host_exit': exit_diagnostic(None),
            'observer_exit': exit_diagnostic(None), 'host_stage': 'not_run', 'start_failure': 'not_run'}


def host_markers(raw, pid):
    """Diagnostics only. These markers confer no process or cleanup authority."""
    unknown = ('unknown', 'unknown')
    if type(raw) is not bytes or not raw.endswith(b'\n') or len(raw) > LOG_LIMIT or type(pid) is not int or not 1 < pid < 2**31:
        return unknown
    stage, failure = 'unknown', 'unknown'
    for line in raw.splitlines():
        if line.startswith(b'HOST_READY'):
            if stage != 'unknown' or not re.fullmatch(rb'HOST_READY pid=' + str(pid).encode() + rb' trusted_parent=[1-9][0-9]{0,19} host_xid=[1-9][0-9]{0,19}', line):
                return unknown
            stage = 'ready'
        elif line.startswith(b'HOST_SUPERVISOR_START'):
            if stage != 'ready' or line != b'HOST_SUPERVISOR_START':
                return unknown
            stage = 'supervisor_start'
        elif line.startswith(b'HOST_START_FAILURE'):
            if stage != 'supervisor_start':
                return unknown
            values = line.split(b' ')
            if len(values) != 2 or values[1] not in {code.encode() for code in START_FAILURES - {'none', 'not_run'}}:
                return unknown
            stage, failure = 'start_failed', values[1].decode('ascii')
        elif line.startswith(b'HOST_UNIT'):
            if stage != 'supervisor_start' or not re.fullmatch(rb'HOST_UNIT programmable-notes-preview-' + str(pid).encode() + rb'-[0-9]{1,30}\.service', line):
                return unknown
            stage, failure = 'unit_ready', 'none'
    return stage, failure


class Runner:
    def __init__(self, artifacts):
        self.artifacts = artifacts
        self.environment = desktop_environment()
        self.owned = []
        self.deadline = time.monotonic() + 190
        self.cases = {'stop': 'not_run', 'expiry': 'not_run'}
        self.diagnostics = {case: empty_diagnostic() for case in ('stop', 'expiry')}
        self.cleanup_failed = False
        self.cleaning = False

    def capture_diagnostic(self, case, error, host, observer):
        value = self.diagnostics[case]
        reason = 'none' if error is None else str(error) if type(error) is Refused else 'internal_error'
        value['original_reason'] = reason if reason in REASONS else 'internal_error'
        # Frozen once before any teardown can signal or reap either child.
        value['host_exit'] = exit_diagnostic(host)
        value['observer_exit'] = exit_diagnostic(observer)
        if host is not None:
            value.update(host_stage='unknown', start_failure='unknown')

    def capture_markers(self, case, host, logpath):
        if host is None:
            return
        try:
            raw, _ = read_file(logpath, LOG_LIMIT)
            stage, failure = host_markers(raw, host.process.pid)
            self.diagnostics[case].update(host_stage=stage, start_failure=failure)
        except Exception:
            self.diagnostics[case].update(host_stage='unknown', start_failure='unknown')

    def remaining(self, deadline):
        check(self.cleaning or not INTERRUPTED, 'interrupted')
        remaining = min(deadline, self.deadline) - time.monotonic()
        check(remaining > 0, 'deadline')
        return remaining

    def spawn(self, argv, *, output=False, input_pipe=False):
        self.remaining(self.deadline)
        self.artifacts.scope()
        process = subprocess.Popen(argv, env=self.environment, stdin=subprocess.PIPE if input_pipe else subprocess.DEVNULL,
                                   stdout=subprocess.PIPE if output else subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        # Signal handlers only record during Popen; this handle is owned before checking them.
        owned = Owned(process, ('', ''))
        self.owned.append(owned)
        if process.poll() is None:
            try:
                owned.start = identity(process.pid)
            except ProcessLookupError:
                process.wait(timeout=2)
            except FileNotFoundError:
                process.wait(timeout=2)
        self.remaining(self.deadline)
        return owned

    def tool(self, argv, timeout=2, input_data=None):
        deadline = min(time.monotonic() + timeout, self.deadline)
        owned = self.spawn(argv, output=True, input_pipe=input_data is not None)
        process = owned.process
        try:
            if input_data is not None:
                process.stdin.write(input_data)
                process.stdin.close()
            data = bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    for key, _ in selector.select(min(0.1, self.remaining(deadline))):
                        chunk = os.read(key.fd, 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                        else:
                            data.extend(chunk)
                            check(len(data) <= 65536, 'output_limit')
                code = process.wait(timeout=self.remaining(deadline))
            return code, bytes(data)
        finally:
            process.stdout.close()
            if process.stdin is not None and not process.stdin.closed:
                process.stdin.close()
            owned.close()

    def preflight(self):
        runtime = Path('/run/user/1001')
        private_directory(runtime)
        bus = (runtime / 'bus').lstat()
        check(stat.S_ISSOCK(bus.st_mode) and bus.st_uid == UID)
        code, output = self.tool(['/usr/bin/systemctl', '--user', 'is-system-running'])
        check(code in (0, 1) and output.strip() in (b'running', b'degraded'))
        group = Path('/sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service')
        for name in ('cgroup.controllers', 'cgroup.subtree_control'):
            check({'cpu', 'memory', 'pids'} <= set((group / name).read_text().split()))
        code, _ = self.tool(['/usr/bin/python3', '-I', '-c',
                             "import gi;gi.require_version('Gdk','3.0');from gi.repository import Gdk"])
        check(code == 0)
        check(not os.path.lexists('/tmp/.X93-lock') and not os.path.lexists('/tmp/.X11-unix/X93'))

    def desktop(self):
        auth = ROOT / 'run/auth/Xauthority'
        fd = os.open(auth, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        cookie = os.urandom(16).hex()
        try:
            code, _ = self.tool(['/usr/bin/xauth', '-f', str(auth)], input_data=f'add :93 MIT-MAGIC-COOKIE-1 {cookie}\n'.encode())
        except Refused as error:
            if str(error) == 'deadline':
                raise Refused('xauth_deadline') from error
            raise
        except subprocess.TimeoutExpired as error:
            raise Refused('xauth_deadline') from error
        check(code == 0, 'desktop_failed')
        read_file(auth, 4096)
        xvfb = self.spawn(xvfb_arguments())
        deadline = time.monotonic() + 5
        # One bounded readiness window, never a host/unit relaunch.
        try:
            while True:
                self.remaining(deadline)
                check(xvfb.process.poll() is None, 'xvfb_exited')
                try:
                    code, _ = self.tool(['/usr/bin/xdpyinfo', '-display', ':93'], timeout=min(1, self.remaining(deadline)))
                except Refused as error:
                    if str(error) != 'deadline':
                        raise
                    code = 1  # A failed sample, never a new five-second window.
                except subprocess.TimeoutExpired:
                    code = 1
                self.remaining(deadline)
                check(xvfb.process.poll() is None, 'xvfb_exited')
                if code == 0:
                    break
                time.sleep(min(0.05, self.remaining(deadline)))
        except Refused as error:
            if str(error) == 'deadline':
                raise Refused('display_readiness_deadline') from error
            raise
        self.spawn(['/usr/bin/openbox', '--sm-disable'])

    def unit_cleanup(self, host, log):
        data, _ = read_file(log, LOG_LIMIT)
        units = re.findall(rb'^HOST_UNIT (programmable-notes-preview-[0-9]+-[0-9]+\.service)$', data, re.M)
        check(len(units) <= 1, 'cleanup_failed')
        if not units:
            # Before HOST_UNIT, Supervisor handles failed start; a live host must close normally.
            check(host.process.returncode == 0, 'cleanup_failed')
            return
        unit = units[0].decode()
        check(unit.startswith(f'programmable-notes-preview-{host.process.pid}-'), 'cleanup_failed')
        code, _ = self.tool(['/usr/bin/systemctl', '--user', 'stop', unit], timeout=3)
        # A collected unit may already be absent; verify its absence instead of trusting stop's code.
        _, output = self.tool(['/usr/bin/systemctl', '--user', 'show', unit,
                               '--property=LoadState', '--property=ActiveState', '--property=MainPID'])
        props = dict(line.split('=', 1) for line in output.decode().splitlines() if '=' in line)
        check(props.get('LoadState') == 'not-found' or
              (code == 0 and props.get('MainPID') == '0' and props.get('ActiveState') in ('inactive', 'failed')), 'cleanup_failed')

    def close_host(self, host, log):
        data, _ = read_file(log, LOG_LIMIT)
        matches = re.findall(rb'^HOST_READY pid=([0-9]+) trusted_parent=[0-9]+ host_xid=([0-9]+)$', data, re.M)
        check(len(matches) == 1 and int(matches[0][0]) == host.process.pid, 'cleanup_failed')
        xid = matches[0][1].decode()
        check(1 <= len(xid) <= 20 and not xid.startswith('0') and int(xid) < 2**64, 'cleanup_failed')
        code, pid = self.tool(['/usr/bin/xdotool', 'getwindowpid', xid])
        check(code == 0 and pid.strip() == str(host.process.pid).encode(), 'cleanup_failed')
        code, _ = self.tool(['/usr/bin/python3', '-I', '-c', CLOSE_HOST, xid])
        check(code == 0, 'cleanup_failed')

    def case(self, case):
        check(case in ('stop', 'expiry'))
        self.artifacts.verify()
        self.artifacts.scope()
        directory = ROOT / 'run/evidence' / case
        logpath = directory / 'host.log'
        host = observer = None
        phase_error = None
        with Log(logpath) as log:
            try:
                host = self.spawn([str(ROOT / 'host')], output=True)
                observer = self.spawn(['/usr/bin/python3', '-I', str(ROOT / 'observer.py'), '--case', case])
                deadline = min(time.monotonic() + 85, self.deadline)
                with selectors.DefaultSelector() as selector:
                    selector.register(host.process.stdout, selectors.EVENT_READ)
                    while observer.process.poll() is None:
                        self.pump(selector, log, deadline)
                        check(host.process.poll() is None, 'observer_failed')
                    check(observer.process.returncode == 0, 'observer_failed')
                    # Receipt includes authenticated expiry cause; read BEFORE close triggers Stop.
                    raw, _ = read_file(directory / 'result.json', JSON_LIMIT)
                    validate_receipt(decode(raw), case)
                    events, _ = read_file(directory / 'events.jsonl', LOG_LIMIT)
                    check(events.endswith(b'\n'), 'receipt_invalid')
                    self.cases[case] = 'passed'
            except BaseException as error:
                self.cases[case] = 'failed'
                phase_error = error
            finally:
                self.capture_diagnostic(case, phase_error, host, observer)
                self.cleaning = True
                if observer is not None:
                    try:
                        observer.close()
                    except BaseException:
                        self.cleanup_failed = True
                        phase_error = Refused('cleanup_failed')
                if host is not None:
                    try:
                        try:
                            with selectors.DefaultSelector() as selector:
                                selector.register(host.process.stdout, selectors.EVENT_READ)
                                if host.process.poll() is None:
                                    self.close_host(host, logpath)
                                deadline = min(time.monotonic() + 5, self.deadline)
                                while host.process.poll() is None:
                                    self.pump(selector, log, deadline)
                                while selector.get_map():
                                    self.pump(selector, log, deadline)
                            check(host.process.returncode == 0, 'cleanup_failed')
                        finally:
                            # Even a failed window close must attempt its one recorded owned unit.
                            self.unit_cleanup(host, logpath)
                    except BaseException as error:
                        self.cleanup_failed = True
                        phase_error = Refused('cleanup_failed')
                        phase_error.__cause__ = error
                    finally:
                        host.close()
                        host.process.stdout.close()
                        self.capture_markers(case, host, logpath)
                self.cleaning = False
            if phase_error is not None:
                raise phase_error

    def pump(self, selector, log, deadline):
        for key, _ in selector.select(min(0.1, self.remaining(deadline))):
            chunk = os.read(key.fd, 65536)
            if chunk:
                log.write(chunk)
            else:
                selector.unregister(key.fileobj)
        self.remaining(deadline)

    def close(self):
        failed = self.cleanup_failed
        for owned in reversed(self.owned):
            try:
                owned.close()
            except BaseException:
                failed = True
        check(not failed, 'cleanup_failed')


def run_cases(runner, receipt=None):
    for case in ('stop', 'expiry'):
        if receipt is not None:
            receipt['phase'] = case
        runner.case(case)


def write_receipt(value):
    data = (json.dumps(value, separators=(',', ':')) + '\n').encode()
    check(len(data) <= JSON_LIMIT)
    fd = os.open(ROOT / 'run/session.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        while data:
            written = os.write(fd, data)
            data = data[written:]
    finally:
        os.close(fd)


def main(arguments):
    global INTERRUPTED
    check(not arguments and os.getuid() == UID and os.geteuid() == UID)
    os.umask(0o077)
    result = dict(version=1, profile='inline-react-guarded-v2', scope='fixed-native-diagnostic-only',
                  native_app_tested=False, status='failed', phase='preflight',
                  reason='preflight_refused', cases={'stop': 'not_run', 'expiry': 'not_run'}, cleanup='not_run',
                  diagnostics={case: empty_diagnostic() for case in ('stop', 'expiry')})
    runner = None
    layout = False
    previous = {}
    def interrupted(_number, _frame):
        global INTERRUPTED
        INTERRUPTED = True
    try:
        for number in (signal.SIGINT, signal.SIGTERM):
            previous[number] = signal.signal(number, interrupted)
        with Artifacts() as artifacts:
            create_layout(artifacts)
            layout = True
            runner = Runner(artifacts)
            runner.preflight()
            result['phase'] = 'desktop'
            runner.desktop()
            run_cases(runner, result)
            result.update(status='passed', phase='complete', reason='none')
    except BaseException as error:
        reason = str(error) if type(error) is Refused else 'internal_error'
        result['reason'] = reason if reason in REASONS - {'none', 'not_run'} else 'internal_error'
    finally:
        try:
            if runner is not None:
                result['cases'] = dict(runner.cases)
                result['diagnostics'] = runner.diagnostics
                try:
                    runner.close()
                    result['cleanup'] = 'passed'
                except BaseException:
                    result.update(status='failed', phase='cleanup', reason='cleanup_failed', cleanup='failed')
            if layout:
                artifacts.scope()
                write_receipt(result)
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)
    return 0 if result['status'] == 'passed' else 2


if __name__ == '__main__':
    try:
        code = main(sys.argv[1:])
    except BaseException:
        code = 2
    sys.exit(code)
