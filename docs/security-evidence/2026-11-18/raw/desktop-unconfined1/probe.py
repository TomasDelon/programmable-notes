"""Bounded installed-desktop smoke; no WebDriver or application test features."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
os.environ['DISPLAY']=':99'
os.environ['XAUTHORITY']='/run/user/1000/pn-Xauthority'
import gi
gi.require_version('Gdk','3.0')
from gi.repository import Gdk

mode=sys.argv[1]
assert mode in ('baseline','no-renderer-flags')
expected='b3b1e05f4b76be83ff5c5c144f5aff98ccdfb0c9a059ffd29b3b334c97f19b83'
observer='/usr/local/lib/assert-webkit-sandbox.py'
observer_sha='4d171904c26634d98cb61d5edce518d3a54cc3da1ae22eb536feeac7407a19f3'
start=time.monotonic()
deadline=start+(110 if mode=='baseline' else 64)
cleanup_deadline=start+(120 if mode=='baseline' else 75)
since=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
out=Path('/home/ubuntu')/'pn-m3-final-desktop-unconfined1'
out.mkdir(mode=0o700,exist_ok=False)
os.chown(out,1000,1000)
result={'hardenedSetting':'kernel.apparmor_restrict_unprivileged_unconfined=1','mode':mode,'started':since,'expectedBinarySha256':expected,'passed':False}
editor=None
child=None
unit=None
log=(out/'commands.log').open('w')

def remaining():
    return max(0.1,deadline-time.monotonic())

def run(args,timeout=None,check=True):
    print(json.dumps({'elapsedMs':round((time.monotonic()-start)*1000),'command':args}),file=log,flush=True)
    proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    try:
        text=proc.communicate(timeout=remaining() if timeout is None else max(0.1,timeout))[0]
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid,signal.SIGKILL)
        text=proc.communicate()[0]
        print(text,file=log,flush=True)
        raise RuntimeError(f'Bounded command timed out: {args[0]}')
    print(text,file=log,flush=True)
    if check and proc.returncode:
        raise RuntimeError(f'Command exited {proc.returncode}: {args[0]}')
    return text,proc.returncode

gui={'HOME':'/home/ubuntu','USER':'ubuntu','LOGNAME':'ubuntu','PATH':'/opt/node/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','DISPLAY':':99','XAUTHORITY':'/run/user/1000/pn-Xauthority','XDG_RUNTIME_DIR':'/run/user/1000','DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/1000/bus','XDG_SESSION_TYPE':'x11','XDG_CURRENT_DESKTOP':'Openbox'}
if mode=='baseline':
    gui.update(WEBKIT_DISABLE_COMPOSITING_MODE='1',WEBKIT_DISABLE_DMABUF_RENDERER='1')

def user(args,**kwargs):
    return run(['runuser','-u','ubuntu','--','env','-i',*[f'{k}={v}' for k,v in gui.items()],*args],**kwargs)

def userctl(args,**kwargs):
    return user(['systemctl','--user',*args],**kwargs)

def info(pid):
    path=Path(f'/proc/{pid}')
    fields=dict(line.split(':',1) for line in (path/'status').read_text().splitlines() if ':' in line)
    env=dict(value.split(b'=',1) for value in (path/'environ').read_bytes().split(b'\0') if b'=' in value)
    keys=['WEBKIT_INSPECTOR_SERVER','TAURI_WEBVIEW_AUTOMATION','TAURI_AUTOMATION','WEBKIT_DISABLE_COMPOSITING_MODE','WEBKIT_DISABLE_DMABUF_RENDERER']
    return {'pid':pid,'exe':os.readlink(path/'exe'),'cmdline':(path/'cmdline').read_bytes().replace(b'\0',b' ').decode().strip(),'uid':int(fields['Uid'].split()[0]),'startTicks':(path/'stat').read_text().rsplit(')',1)[1].split()[19],'environment':{key:env.get(key.encode(),b'').decode() if key.encode() in env else None for key in keys},'namespaces':{key:os.readlink(path/'ns'/key) for key in ('net','mnt','pid','user')},'cgroup':(path/'cgroup').read_text().strip()}

def apps():
    found=[]
    for path in Path('/proc').iterdir():
        if path.name.isdecimal():
            try:
                if os.readlink(path/'exe')=='/usr/bin/programmable-notes': found.append(info(int(path.name)))
            except (OSError,ValueError,KeyError): pass
    return found

def live(pid):
    try: return Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[0]!='Z'
    except OSError: return False

def screenshot(name,timeout=None):
    window=Gdk.get_default_root_window()
    image=Gdk.pixbuf_get_from_window(window,0,0,window.get_width(),window.get_height())
    image.savev(str(out/name),'png',[],[])

def assert_environment(item):
    env=item['environment']
    assert not env['WEBKIT_INSPECTOR_SERVER'],'Inspector must be absent'
    assert env['TAURI_WEBVIEW_AUTOMATION'] in (None,'false'),'No automated editor/child'
    assert env['TAURI_AUTOMATION'] in (None,'false'),'No automated editor/child'
    for key in ('WEBKIT_DISABLE_COMPOSITING_MODE','WEBKIT_DISABLE_DMABUF_RENDERER'):
        assert env[key]==('1' if mode=='baseline' else None),(key,env[key])

try:
    assert not apps(),'Another installed-app instance exists'
    actual=hashlib.sha256(Path('/usr/bin/programmable-notes').read_bytes()).hexdigest()
    result['binarySha256']=actual
    assert actual==expected,'Installed release differs from frozen candidate'
    assert hashlib.sha256(Path(observer).read_bytes()).hexdigest()==observer_sha,'Observer changed'
    run(['uname','-a'])
    run(['dpkg-query','-W','programmable-notes','libwebkit2gtk-4.1-0','webkit2gtk-driver','libgtk-3-0t64','systemd','bubblewrap','xdg-dbus-proxy'])
    run(['/usr/sbin/sysctl','kernel.unprivileged_userns_clone','kernel.apparmor_restrict_unprivileged_userns','kernel.apparmor_restrict_unprivileged_unconfined'])
    (out/'desktop-entry.txt').write_text(Path('/usr/share/applications/Programmable Notes.desktop').read_text())
    # This invokes the installed desktop entry with an ordinary user's graphical
    # environment. No WebDriver transport, test flags or inspector is inherited.
    app_log=(out/'application.log').open('w')
    launch=subprocess.run(['runuser','-u','ubuntu','--','env','-i',*[f'{k}={v}' for k,v in gui.items()],'gio','launch','/usr/share/applications/Programmable Notes.desktop'],stdout=app_log,stderr=subprocess.STDOUT,stdin=subprocess.DEVNULL,timeout=min(10,remaining()))
    assert launch.returncode==0,'Desktop-entry launch failed'
    while time.monotonic()<deadline:
        candidates=[item for item in apps() if '--preview-child' not in item['cmdline']]
        if candidates:
            assert len(candidates)==1
            editor=candidates[0]['pid']
            break
        time.sleep(0.1)
    assert editor,'No desktop editor process observed'
    result['editor']=info(editor)
    assert_environment(result['editor'])
    observed,_=run(['python3',observer,'--app-pid',str(editor),'--timeout',str(min(35,remaining()))])
    result['editorWebProcessPids']=[item['pid'] for item in json.JSONDecoder().raw_decode(observed.lstrip())[0]['web_processes']]
    result['editorSandboxPass']=True
    while time.monotonic()<deadline:
        units,_=userctl(['list-units','--all','--no-legend','--plain',f'programmable-notes-preview-{editor}-*'])
        active=[line.split()[0] for line in units.splitlines() if 'active' in line.split() and 'running' in line.split()]
        if active:
            assert len(active)==1,'Ambiguous active preview services'
            unit=active[0]
            child=int(userctl(['show','--property=MainPID','--value',unit])[0].strip())
            if child: break
        time.sleep(0.2)
    assert child,'No governed default Counter observed'
    result['unit']=unit
    result['child']=info(child)
    assert_environment(result['child'])
    observed,_=run(['python3',observer,'--app-pid',str(child),'--timeout',str(min(35,remaining()))])
    result['previewWebProcessPids']=[item['pid'] for item in json.JSONDecoder().raw_decode(observed.lstrip())[0]['web_processes']]
    result['previewSandboxPass']=True
    group=Path('/sys/fs/cgroup')/result['child']['cgroup'].split('::',1)[1].lstrip('/')
    result['limits']={name:(group/name).read_text().strip() for name in ('cpu.max','memory.max','memory.swap.max','pids.max','pids.current','pids.events')}
    for name,value in {'cpu.max':'25000 100000','memory.max':'536870912','memory.swap.max':'0','pids.max':'128'}.items():
        assert result['limits'][name]==value,(name,result['limits'][name])
    for name,action in [('Count: 0','click'),('Count: 1','click'),('Count: 2','find')]:
        began=time.monotonic()
        text,_=user(['python3','/opt/pn/final-desktop/native-atspi.py',str(child),name,action],timeout=remaining())
        parsed=json.loads(text.strip())
        assert parsed['pid']==child and parsed['button']==name and parsed['passed']
        result.setdefault('counterActions',[]).append({'button':name,'durationMs':round((time.monotonic()-began)*1000),'elapsedMs':round((time.monotonic()-start)*1000)})
    screenshot('counter-two.png')
    result['counterPass']=True
    result['passed']=True
except Exception as error:
    result['error']=str(error)
    result['passed']=False
    try: screenshot('failure.png',timeout=max(0.1,min(3,cleanup_deadline-time.monotonic())))
    except Exception as capture_error: result['failureScreenshotError']=str(capture_error)
finally:
    # Only this launched instance and its specifically named unit are touched.
    try:
        active=False
        if unit:
            active=userctl(['is-active','--quiet',unit],check=False,timeout=2)[1]==0
        result['previewActiveBeforeRootClose']=active
        if editor and live(editor):
            user(['python3','/opt/pn/final-desktop/native-close-window.py',str(editor)],timeout=max(0.1,min(3,cleanup_deadline-time.monotonic())))
            known=result.get('editorWebProcessPids',[])+result.get('previewWebProcessPids',[])
            while (live(editor) or any(live(pid) for pid in known)) and time.monotonic()<cleanup_deadline:
                time.sleep(0.1)
        root_gone=not editor or not live(editor)
        group_gone=not child or not live(child)
        if unit:
            group_state=userctl(['show','--property=ControlGroup','--value',unit],check=False,timeout=1)[0].strip()
            if group_state:
                current=Path('/sys/fs/cgroup')/group_state.lstrip('/')/'cgroup.events'
                group_gone=not current.exists() or 'populated 0' in current.read_text()
        result['rootClosed']=root_gone
        result['previewGroupEmptyAfterRootClose']=group_gone
        result['knownWebProcessesExited']=all(not live(pid) for pid in result.get('editorWebProcessPids',[])+result.get('previewWebProcessPids',[]))
        result['normalCloseStoppedActivePreview']=bool(active and root_gone and group_gone)
        if result['passed'] and (not result['normalCloseStoppedActivePreview'] or not result['knownWebProcessesExited']):
            result['passed']=False
            result['error']='Cannot prove normal Root close stopped a live preview group'
        if not root_gone:
            os.kill(editor,signal.SIGTERM)
            result['forcedCleanup']=True
        if unit and not group_gone:
            userctl(['stop',unit],check=False,timeout=2)
            result['forcedCleanup']=True
    except Exception as error:
        result['cleanupError']=str(error)
        result['passed']=False
    for label,args in [('user-journal.log',['journalctl','--no-pager','--since',since,'_UID=1000']),('kernel-journal.log',['journalctl','-k','--no-pager','--since',since])]:
        try:
            text=subprocess.run(args,capture_output=True,text=True,timeout=2).stdout
            (out/label).write_text('\n'.join(text.splitlines()[-120:])+'\n')
        except Exception as error: result[label+'Error']=str(error)
    result['elapsedMs']=round((time.monotonic()-start)*1000)
    (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    log.close()
    print(json.dumps(result,indent=2),flush=True)
sys.exit(0 if result['passed'] else 1)
