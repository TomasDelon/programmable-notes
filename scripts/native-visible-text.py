"""Read a visible installed-preview client window with exact OCR, never IPC.

CLI: PID TEXT [EVIDENCE_DIRECTORY]. Dependencies: python3-gi, gir1.2-gtk-3.0,
xdotool, x11-utils (xprop), tesseract-ocr, tesseract-ocr-eng. Uses the existing
authenticated DISPLAY/XAUTHORITY. Does not focus, raise, click or modify windows.
Requires Openbox or an EWMH window manager exposing _NET_CLIENT_LIST_STACKING.
Run as the non-root user that owns the preview (effective UID must match).
The complete client-area OCR must equal TEXT after whitespace normalization.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

started=time.monotonic()
deadline=started+55
import gi
gi.require_version('Gdk','3.0')
gi.require_version('GdkX11','3.0')
from gi.repository import Gdk,GdkX11

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('pid',type=int)
parser.add_argument('text')
parser.add_argument('evidence_directory',nargs='?')
args=parser.parse_args()
os.umask(0o077)
base=Path(args.evidence_directory) if args.evidence_directory else Path(tempfile.mkdtemp(prefix='pn-visible-text-'))
base.mkdir(parents=True,exist_ok=True)
out=base/f'visible-{args.pid}-{time.time_ns()}'
out.mkdir()

def normalise(value):return ' '.join(value.split())
expected=normalise(args.text)
assert expected,'Expected text must be nonempty'

def command(argv):
    left=deadline-time.monotonic()
    if left<=0:raise TimeoutError('55-second visible-text deadline reached')
    result=subprocess.run(argv,capture_output=True,text=True,timeout=min(8,left),env=dict(os.environ,OMP_THREAD_LIMIT="1",LC_ALL="C"))
    if result.returncode:raise RuntimeError(f'{argv[0]} exited {result.returncode}: {result.stderr.strip()[:250]}')
    return result.stdout

def identity():
    root=Path(f'/proc/{args.pid}')
    stat=(root/'stat').read_text().rsplit(')',1)[1].split()
    status=dict(line.split(':',1) for line in (root/'status').read_text().splitlines() if ':' in line)
    exe=os.readlink(root/'exe')
    cmdline=(root/'cmdline').read_bytes().split(b'\0')
    assert exe=='/usr/bin/programmable-notes','PID is not the installed application'
    assert b'--preview-child' in cmdline,'PID is not a production preview child'
    assert os.geteuid()!=0,'Visible-text driver must run as a non-root user'
    assert int(status['Uid'].split()[1])==os.geteuid(),'Preview effective UID must match the driver effective UID'
    assert stat[0]!='Z','Preview exited'
    return {'pid':args.pid,'startTicks':stat[19],'exe':exe}

def geometry(window):
    # xdotool double-counts the frame offset on this reparenting WM. Read
    # X server absolute client coordinates, not a guessed decoration offset.
    description=command(['xwininfo','-id',str(window)])
    patterns=[r'Absolute upper-left X:\s*(-?\d+)',r'Absolute upper-left Y:\s*(-?\d+)',r'Width:\s*(\d+)',r'Height:\s*(\d+)']
    matches=[re.search(pattern,description) for pattern in patterns]
    assert all(matches),'Cannot verify absolute client geometry'
    return tuple(int(match.group(1)) for match in matches)

def overlaps(a,b):return a[0]<b[0]+b[2] and b[0]<a[0]+a[2] and a[1]<b[1]+b[3] and b[1]<a[1]+a[3]

def binding():
    visible=command(['xdotool','search','--onlyvisible','--pid',str(args.pid)]).split()
    assert len(visible)==1,f'Expected one visible preview window, observed{len(visible)}'
    window=int(visible[0],0)
    assert int(command(['xdotool','getwindowpid',str(window)]).strip())==args.pid,'Window PID mismatch'
    title=command(['xdotool','getwindowname',str(window)]).strip()
    assert title=='Unprivileged document preview',f'Unexpected native title: {title}'
    description=command(['xwininfo','-id',str(window)])
    assert re.search(r'Map State:\s+IsViewable',description),'Preview is not viewable according to the X server'
    rect=geometry(window)
    stack=[int(value,16) for value in re.findall(r'0x[0-9a-fA-F]+',command(['xprop','-root','_NET_CLIENT_LIST_STACKING']))]
    assert window in stack,'Preview absent from window-manager client stack'
    for higher in stack[stack.index(window)+1:]:
        description=command(['xwininfo','-id',str(higher)])
        if 'Map State: IsViewable' in description:
            assert not overlaps(rect,geometry(higher)),'Preview client area is obscured by a higher visible window'
    return window,title,rect

result={'pid':args.pid,'expectedText':expected,'passed':False,'evidenceDirectory':str(out)}
attempts=[]
last_error=None
try:
    original=identity()
    result['identity']=original
    display=Gdk.Display.get_default()
    assert display and isinstance(display,GdkX11.X11Display),'Authenticated X11 display required'
    screen=Gdk.get_default_root_window()
    while time.monotonic()<deadline:
        attempt={'elapsedMs':round((time.monotonic()-started)*1000)}
        try:
            assert identity()==original,'Native PID identity changed'
            window,title,rect=binding()
            x,y,width,height=rect
            assert width>0 and height>0 and x>=0 and y>=0
            assert x+width<=screen.get_width() and y+height<=screen.get_height(),'Preview is outside visible screen bounds'
            # Gdk foreign-window mapped flags may be stale. X11 visibility,
            # stacking and geometry above bind this exact root-surface crop.
            image=Gdk.pixbuf_get_from_window(screen,x,y,width,height)
            assert image,'Cannot capture the bound preview client window'
            image_path=out/'latest.png'
            image.savev(str(image_path),'png',[],[])
            raw=command(['tesseract',str(image_path),'stdout','-l','eng','--psm','11'])
            text=normalise(raw)
            (out/'latest.txt').write_text(raw)
            assert identity()==original,'Native PID changed during capture'
            window_after,_,rect_after=binding()
            assert window_after==window and rect_after==rect,'Window binding changed during capture'
            attempt.update(window=window,title=title,geometry=rect,observedText=text)
            if text==expected:
                (out/'matched.png').write_bytes(image_path.read_bytes())
                result.update(passed=True,window=window,title=title,geometry=rect,observedText=text,screenshotSha256=hashlib.sha256(image_path.read_bytes()).hexdigest())
                attempts.append(attempt)
                break
        except (AssertionError,OSError,RuntimeError,TimeoutError,subprocess.TimeoutExpired) as error:
            last_error=str(error)
            attempt['error']=last_error
        attempts.append(attempt)
        time.sleep(min(.5,max(0,deadline-time.monotonic())))
    if not result['passed']:result['error']=last_error or 'Exact expected text was not observed before55seconds'
except (AssertionError,OSError,RuntimeError,TimeoutError,subprocess.TimeoutExpired) as error:
    result['error']=str(error)
finally:
    result['elapsedMs']=round((time.monotonic()-started)*1000)
    result['attemptCount']=len(attempts)
    (out/'attempts.json').write_text(json.dumps(attempts,indent=2)+'\n')
    (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result),flush=True)
sys.exit(0 if result['passed'] else 1)
