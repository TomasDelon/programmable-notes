"""Send the desktop WM_DELETE_WINDOW protocol to one known preview window.

Trusted OS test driver, not an API exposed to author code. Xvfb needs no WM.
"""
import ctypes as c
import json
import subprocess
import sys

pid = int(sys.argv[1])
windows = subprocess.check_output(
    ['xdotool', 'search', '--onlyvisible', '--pid', str(pid)], text=True
).split()
assert len(windows) == 1, 'Expected exactly one visible preview window'
window = int(windows[0])
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

display = x11.XOpenDisplay(None)
assert display, 'Cannot connect to test display'
event = Event()
event.client = ClientMessage(33, 0, 1, display, window,
    x11.XInternAtom(display, b'WM_PROTOCOLS', 0), 32,
    (c.c_long * 5)(x11.XInternAtom(display, b'WM_DELETE_WINDOW', 0), 0, 0, 0, 0))
x11.XSendEvent.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_long, c.POINTER(Event)]
x11.XFlush.argtypes = [c.c_void_p]
x11.XCloseDisplay.argtypes = [c.c_void_p]
assert x11.XSendEvent(display, window, 0, 0, c.byref(event)) != 0
x11.XFlush(display)
x11.XCloseDisplay(display)
print(json.dumps({'pid': pid, 'window': window, 'sent': 'WM_DELETE_WINDOW'}))
