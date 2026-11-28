"""External X11 measurement only; never constructs a GTK/WebKit foreign window."""
import ctypes
import json
import pathlib
import re
import subprocess
import time
import gi

gi.require_version('Gdk', '3.0')
from gi.repository import Gdk

def emit(**data):
    print(json.dumps(data), flush=True)

x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x.XTranslateCoordinates.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong)]
x.XGetInputFocus.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int)]
x.XFree.argtypes = [ctypes.c_void_p]
display = x.XOpenDisplay(None)
root = Gdk.get_default_root_window()
start = time.monotonic()
parent = None
while time.monotonic() - start < 55:
    text = pathlib.Path('/mnt/host.log').read_text()
    match = re.search(r'HOST_READY pid=(\d+) trusted_parent=(\d+)', text)
    if match:
        parent = int(match[2])
        break
    time.sleep(.2)
if parent is None:
    raise RuntimeError('No trusted host parent XID')

root_xid = ctypes.c_ulong()
parent_xid = ctypes.c_ulong()
children = ctypes.POINTER(ctypes.c_ulong)()
count = ctypes.c_uint()
for attempt in range(55):
    x.XQueryTree(display, parent, ctypes.byref(root_xid), ctypes.byref(parent_xid), ctypes.byref(children), ctypes.byref(count))
    ids = [children[i] for i in range(count.value)]
    if children:
        x.XFree(children)
    emit(kind='tree', parent=parent, children=ids, elapsed=round(time.monotonic()-start,3))
    dx, dy, sub = ctypes.c_int(), ctypes.c_int(), ctypes.c_ulong()
    x.XTranslateCoordinates(display, parent, root_xid.value, 0, 0, ctypes.byref(dx), ctypes.byref(dy), ctypes.byref(sub))
    shot = Gdk.pixbuf_get_from_window(root, 0, 0, 900, 700)
    pixels = shot.get_pixels()
    stride, channels = shot.get_rowstride(), shot.get_n_channels()
    def rgb(px,py):
        i=py*stride+px*channels
        return list(pixels[i:i+3])
    inside=rgb(dx.value+280,dy.value+65)
    outside=rgb(dx.value+310,dy.value+65)
    emit(kind='pixels',inside=inside,outside=outside,origin=[dx.value,dy.value])
    shot.savev('/mnt/latest-before.png','png',[],[])
    if inside == [187,238,221]:
        emit(kind='paint_observed',children=ids)
        for i in range(2):
            subprocess.run(['xdotool','mousemove',str(dx.value+55),str(dy.value+15),'click','1'],check=True)
        subprocess.run(['xdotool','mousemove',str(dx.value+190),str(dy.value+15),'click','1','type','hello'],check=True)
        focus, revert = ctypes.c_ulong(), ctypes.c_int()
        x.XGetInputFocus(display,ctypes.byref(focus),ctypes.byref(revert))
        emit(kind='input_sent',focus_xid=focus.value)
        time.sleep(.5)
        Gdk.pixbuf_get_from_window(root,0,0,900,700).savev('/mnt/after-input.png','png',[],[])
        break
    if time.monotonic()-start > 55:
        emit(kind='no_render_before_observation_deadline')
        break
    time.sleep(1)
