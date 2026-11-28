"""External readiness/input and guarded live Stop diagnostics. No JS evaluation."""
import ctypes
import json
import pathlib
import re
import subprocess
import time
import gi
gi.require_version('Gdk','3.0')
from gi.repository import Gdk

ROOT = pathlib.Path('/mnt')
events = []
result = {'normal_input': 'NOT_RUN', 'forced_focus': 'NOT_RUN', 'stop': 'NOT_RUN', 'host_input': 'NOT_RUN'}

def event(kind, **data):
    value = {'kind': kind, 'monotonic': time.monotonic(), **data}
    events.append(value)
    print(json.dumps(value), flush=True)

def capture(name):
    try:
        root=Gdk.get_default_root_window()
        Gdk.pixbuf_get_from_window(root,0,0,900,700).savev(str(ROOT/name),'png',[],[])
    except Exception as exc:
        event('optional_capture_failed',error=str(exc))

def command(*args, timeout=2):
    return subprocess.check_output(list(args), text=True, timeout=timeout)

def gui(*args):
    return command('xdotool', *map(str, args))

def identity(pid):
    fields = (pathlib.Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'start': fields[19], 'state': fields[0]}

def properties(unit):
    text = command('systemctl', '--user', 'show', unit, '-p', 'MainPID', '-p', 'ControlGroup', '-p', 'ActiveEnterTimestampMonotonic', '-p', 'RuntimeMaxUSec')
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line)

def checked_live(unit):
    props = properties(unit)
    group = props.get('ControlGroup', '')
    parts = pathlib.PurePosixPath(group).parts
    if not group.startswith('/user.slice/user-1000.slice/user@1000.service/') or group == '/' or '..' in parts or '.' in parts or not group.endswith('/' + unit):
        raise RuntimeError('UNSAFE_OR_EMPTY_CONTROL_GROUP')
    pid = int(props.get('MainPID', '0'))
    if pid <= 1:
        raise RuntimeError('NO_LIVE_MAIN_PID')
    root = pathlib.Path('/sys/fs/cgroup') / group.lstrip('/')
    first = identity(pid)
    if first['state'] == 'Z':
        raise RuntimeError('MAIN_PID_IS_ZOMBIE')
    membership = (pathlib.Path('/proc') / str(pid) / 'cgroup').read_text().strip()
    if membership != '0::' + group:
        raise RuntimeError('MAIN_PID_CGROUP_MISMATCH')
    if props.get('RuntimeMaxUSec') != '1min':
        raise RuntimeError('RUNTIME_POLICY_MISMATCH')
    start = int(props['ActiveEnterTimestampMonotonic']) / 1_000_000
    if start <= 0:
        raise RuntimeError('NO_UNIT_START_TIME')
    # Effective controller files, not just systemd strings.
    policy = {name: (root / name).read_text().strip() for name in ('cpu.max', 'memory.max', 'memory.swap.max', 'pids.max')}
    if policy != {'cpu.max': '25000 100000', 'memory.max': '536870912', 'memory.swap.max': '0', 'pids.max': '128'}:
        raise RuntimeError('EFFECTIVE_POLICY_MISMATCH')
    if identity(pid)['start'] != first['start']:
        raise RuntimeError('MAIN_PID_CHANGED')
    return props, root, group, pid, first, start, policy

def discover(root, group, known):
    if not root.exists():
        return
    for file in root.rglob('cgroup.procs'):
        try:
            pids = file.read_text().splitlines()
        except FileNotFoundError:
            continue
        for pid in pids:
            if not pid.isdecimal() or int(pid) <= 1:
                raise RuntimeError('MALFORMED_CGROUP_PID')
            try:
                current = identity(pid)
                known.setdefault((pid, current['start']), current)
                where = (pathlib.Path('/proc') / pid / 'cgroup').read_text().strip()
                if where != '0::' + group and not where.startswith('0::' + group + '/'):
                    raise RuntimeError('IDENTITY_OUTSIDE_OWNED_GROUP')
            except FileNotFoundError:
                pass

def empty(root):
    try:
        fields = dict(line.split() for line in (root / 'cgroup.events').read_text().splitlines())
        if fields.get('populated') not in ('0', '1'):
            raise RuntimeError('MALFORMED_CGROUP_EVENTS')
        return fields['populated'] == '0'
    except FileNotFoundError:
        if root.exists():
            raise
        return True

def live_known(known):
    live = []
    for pid, start in known:
        try:
            current = identity(pid)
            if current['start'] == start and current['state'] != 'Z':
                live.append(pid)
        except FileNotFoundError:
            pass
    return live

def stop_live(unit, host_xid):
    props, root, group, pid, before, start, policy = checked_live(unit)
    age = time.monotonic() - start
    if not 0 <= age < 50:
        raise RuntimeError('INSUFFICIENT_STOP_HEADROOM')
    known = {}
    discover(root, group, known)
    if (str(pid), before['start']) not in known:
        raise RuntimeError('MAIN_PID_NOT_DISCOVERED')
    event('verified_live_before_stop', unit=unit, main_pid=pid, start_identity=before['start'], cgroup=group, unit_age=age, policy=policy, identities=[list(k) for k in known])
    if identity(pid)['start'] != before['start']:
        raise RuntimeError('MAIN_PID_CHANGED_BEFORE_CLICK')
    clicked = time.monotonic()
    deadline = clicked + 5
    gui('mousemove', '--window', host_xid, 50, 275, 'click', 1)
    while time.monotonic() < deadline:
        discover(root, group, known)
        is_empty = empty(root)
        live = live_known(known)
        receipt = 'HOST_BUTTON_STOP Ok(())' in (ROOT / 'host.log').read_text()
        if is_empty and not live and receipt and empty(root) and time.monotonic() < deadline:
            event('bounded_stop_observed', elapsed=time.monotonic()-clicked, unit_age=time.monotonic()-start, identities=[list(k) for k in known], host_stop_receipt=True)
            result['stop'] = 'TARGETED_BOUNDED_OBSERVATION_PASS_NOT_FULL_SECURITY_MATRIX'
            gui('mousemove', '--window', host_xid, 60, 25, 'click', 1, 'key', 'ctrl+a', 'type', 'hostok')
            until = time.monotonic() + 2
            while time.monotonic() < until:
                if 'HOST_ENTRY hostok' in (ROOT / 'host.log').read_text():
                    result['host_input'] = 'PASS'
                    event('host_input_after_stop', text='hostok')
                    return
                time.sleep(.05)
            result['host_input'] = 'UNPROVEN'
            return
        time.sleep(.05)
    raise RuntimeError('STOP_OBSERVATION_DEADLINE_FAILED')

x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x.XGetGeometry.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint)]
x.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_void_p)]
x.XFree.argtypes = [ctypes.c_void_p]
XERROR = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
class ErrorEvent(ctypes.Structure):
    _fields_=[('type',ctypes.c_int),('display',ctypes.c_void_p),('resourceid',ctypes.c_ulong),('serial',ctypes.c_ulong),('error_code',ctypes.c_ubyte),('request_code',ctypes.c_ubyte),('minor_code',ctypes.c_ubyte)]
x_errors=[]
x_unexpected=False
@XERROR
def x_error(display, error):
    # A disappearing window during fixed expiry is a normal observation race.
    value=ctypes.cast(error,ctypes.POINTER(ErrorEvent)).contents
    global x_unexpected
    if value.error_code!=3:
        x_unexpected=True
    if len(x_errors)<32:
        x_errors.append({'code':value.error_code,'request':value.request_code,'resource':value.resourceid})
    return 0
x.XSetErrorHandler.argtypes = [XERROR]
x.XSetErrorHandler(x_error)
display = x.XOpenDisplay(None)
if not display:
    raise RuntimeError('NO_AUTHENTICATED_X11_DISPLAY')

def children(window):
    root, parent = ctypes.c_ulong(), ctypes.c_ulong()
    values, count = ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
    status = x.XQueryTree(display, window, ctypes.byref(root), ctypes.byref(parent), ctypes.byref(values), ctypes.byref(count))
    if x_unexpected:
        raise RuntimeError('UNEXPECTED_X11_QUERY_ERROR')
    if not status:
        return []
    ids = [values[i] for i in range(count.value)]
    if values:
        x.XFree(values)
    if len(ids) > 16:
        raise RuntimeError('TOO_MANY_NATIVE_CHILDREN')
    return ids

def state(window):
    pointer = ctypes.c_void_p()
    status=x.XFetchName(display, window, ctypes.byref(pointer))
    if x_unexpected:
        if pointer:
            x.XFree(pointer)
        raise RuntimeError('UNEXPECTED_X11_TITLE_ERROR')
    if not status or not pointer:
        return None
    value = ctypes.string_at(pointer)
    x.XFree(pointer)
    if len(value)>1024:
        raise RuntimeError('UNBOUNDED_NATIVE_TITLE')
    try:
        data = json.loads(value.decode('utf-8'))
    except (ValueError, UnicodeError):
        return None
    if not isinstance(data, dict) or set(data)!= {'ready','count','field','focus','error'} or data.get('ready') is not True or type(data.get('count')) is not int or not 0<=data['count']<=100 or not isinstance(data.get('field'), str) or len(data['field']) > 80 or not isinstance(data.get('focus'),str) or len(data['focus'])>40 or not isinstance(data.get('error'),str) or len(data['error'])>60:
        return None
    return data

def geometry(window):
    root,xp,yp=ctypes.c_ulong(),ctypes.c_int(),ctypes.c_int()
    width,height,border,depth=ctypes.c_uint(),ctypes.c_uint(),ctypes.c_uint(),ctypes.c_uint()
    status=x.XGetGeometry(display,window,ctypes.byref(root),ctypes.byref(xp),ctypes.byref(yp),ctypes.byref(width),ctypes.byref(height),ctypes.byref(border),ctypes.byref(depth))
    if not status or x_unexpected or width.value<200 or height.value<80:
        raise RuntimeError('INVALID_CHILD_GEOMETRY')
    return {'x':xp.value,'y':yp.value,'width':width.value,'height':height.value,'border':border.value,'depth':depth.value}

def wait_state(child, accept, until, start):
    previous = None
    while time.monotonic() < until:
        value = state(child)
        if value != previous:
            event('state', child_xid=child, state=value, unit_age=time.monotonic()-start)
            previous = value
        if value is not None and accept(value):
            return value
        time.sleep(.05)
    return None

def run():
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        text = (ROOT / 'host.log').read_text()
        host = re.search(r'HOST_READY pid=(\d+) trusted_parent=(\d+) host_xid=(\d+)', text)
        unit = re.search(r'^HOST_UNIT (programmable-notes-preview-[0-9-]+\.service)$', text, re.M)
        if host and unit:
            break
        time.sleep(.1)
    else:
        raise RuntimeError('NO_HOST_UNIT_RECEIPT')
    unit = unit[1]
    host_pid, socket_xid, host_xid = map(int, host.groups())
    props, root, group, pid, before, start, policy = checked_live(unit)
    result.update(unit=unit, host_pid=host_pid, main_pid=pid, socket_xid=socket_xid, host_xid=host_xid, unit_start_monotonic=start, policy=policy)
    event('unit_verified', **result)
    child = None
    ready = None
    while time.monotonic() < start + 58:
        for candidate in children(socket_xid):
            value = state(candidate)
            if value is not None:
                child, ready = candidate, value
                event('script_ready', child_xid=child, state=ready, geometry=geometry(child), unit_age=time.monotonic()-start)
                capture('ready.png')
                break
        if ready is not None:
            break
        time.sleep(.1)
    if ready is None:
        result['normal_input'] = 'SCRIPT_READY_NOT_OBSERVED'
        return
    result['child_xid'] = child
    if time.monotonic() >= start + 48:
        result['normal_input'] = 'READY_TOO_LATE_FOR_BOUNDED_INPUT_AND_STOP'
        return
    event('normal_real_input_begin', child_xid=child, unit_age=time.monotonic()-start)
    gui('mousemove', '--window', child, 30, 15, 'click', 1, 'click', 1)
    gui('mousemove', '--window', child, 170, 15, 'click', 1, 'type', 'hello')
    normal = wait_state(child, lambda s:s.get('count') == 2 and s.get('field') == 'hello' and not s.get('error'), min(start+49, time.monotonic()+3), start)
    result['normal_input'] = 'PASS' if normal else 'UNPROVEN'
    result['last_normal_state'] = normal or state(child)
    capture('after-normal-input.png')
    if not normal and time.monotonic() < start+45:
        event('forced_focus_diagnostic_only', child_xid=child, unit_age=time.monotonic()-start)
        gui('windowfocus', child)
        gui('mousemove','--window',child,170,15,'click',1,'key','ctrl+a','type','hello')
        forced = wait_state(child, lambda s:s.get('field') == 'hello', min(start+48,time.monotonic()+2), start)
        result['forced_focus'] = 'DIAGNOSTIC_ONLY_STATE_CHANGE' if forced else 'UNPROVEN'
        result['last_forced_state'] = forced or state(child)
    try:
        stop_live(unit, host_xid)
    except Exception as exc:
        result['stop'] = 'NOT_PROVEN: ' + str(exc)
        event('stop_not_proven', error=str(exc))

try:
    run()
except Exception as exc:
    result['observer_error'] = str(exc)
    event('observer_error', error=str(exc))
finally:
    result['x_errors']=x_errors
    (ROOT / 'result.json').write_text(json.dumps({'result':result,'events':events},indent=2)+'\n')
    print(json.dumps({'FINAL':result}),flush=True)
