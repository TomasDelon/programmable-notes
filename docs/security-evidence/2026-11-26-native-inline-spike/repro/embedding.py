import gi, sys, os, ctypes, subprocess, json, time
gi.require_version('Gtk','3.0')
gi.require_version('GdkX11','3.0')
gi.require_version('WebKit2','4.1')
from gi.repository import Gtk, Gdk, GdkX11, GLib, WebKit2

def emit(**data):
    print(json.dumps(data), flush=True)

if len(sys.argv)>1 and sys.argv[1]=='child':
    parent=int(sys.argv[2])
    xlib=ctypes.CDLL('libX11.so.6')
    xlib.XOpenDisplay.argtypes=[ctypes.c_char_p]; xlib.XOpenDisplay.restype=ctypes.c_void_p
    xlib.XCreateSimpleWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_int,ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,ctypes.c_ulong,ctypes.c_ulong]
    xlib.XCreateSimpleWindow.restype=ctypes.c_ulong
    xlib.XMapWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
    xlib.XFlush.argtypes=[ctypes.c_void_p]
    display=xlib.XOpenDisplay(None)
    xid=xlib.XCreateSimpleWindow(display,parent,0,0,400,170,0,0,0)
    xlib.XMapWindow(display,xid); xlib.XFlush(display)
    foreign=GdkX11.X11Window.foreign_new_for_display(Gdk.Display.get_default(),xid)
    window=Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
    window.connect('realize',lambda w:w.set_window(foreign))
    window.set_has_window(True); window.realize()
    context=WebKit2.WebContext.new_ephemeral()
    context.set_sandbox_enabled(True)
    if not context.get_sandbox_enabled(): raise RuntimeError('sandbox disabled')
    view=WebKit2.WebView.new_with_context(context)
    view.get_settings().set_enable_developer_extras(False)
    context.connect('download-started',lambda c,d:d.cancel())
    window.add(view)
    view.load_html('''<html><body style="margin:0;background:#bbeedd;font:20px sans-serif"><button onclick="this.textContent='Count: '+(++window.n)">Count: 0</button><input id="field" placeholder="Type here"><p>SUPERVISED EMBED</p><script>window.n=0</script></body></html>''',None)
    window.show_all()
    emit(kind='child',pid=os.getpid(),xid=xid,parent=parent,sandbox=context.get_sandbox_enabled())
    view.connect('load-changed',lambda v,e:emit(kind='load',event=str(e)))
    def inspect():
        def result(v,r,*args):
            try: emit(kind='dom',value=v.run_javascript_finish(r).get_js_value().to_string())
            except Exception as e: emit(kind='inspect-error',error=str(e))
        view.run_javascript('JSON.stringify({text:document.body.innerText,field:document.getElementById("field").value,focus:document.activeElement.id})',None,result,None)
        return True
    GLib.timeout_add_seconds(2,inspect)
    GLib.timeout_add_seconds(58,lambda:Gtk.main_quit() or False)
    Gtk.main()
else:
    host=Gtk.Window(title='Inline feasibility host')
    host.set_default_size(640,500)
    fixed=Gtk.Fixed(); host.add(fixed)
    title=Gtk.Entry(); title.set_text('TRUSTED EDITOR INPUT'); fixed.put(title,20,10)
    viewport=Gtk.EventBox(); viewport.set_visible_window(True)
    viewport.set_size_request(300,120); fixed.put(viewport,20,70)
    label=Gtk.Label(label='TRUSTED TEXT BELOW; child must clip at 300 x 120')
    fixed.put(label,20,210)
    host.connect('destroy',Gtk.main_quit)
    host.show_all()
    xid=viewport.get_window().get_xid()
    emit(kind='host',pid=os.getpid(),xid=xid,window=host.get_window().get_xid())
    args=['systemd-run','--user','--unit=pn-inline-child','--collect','--quiet','--property=MemoryMax=512M','--property=MemorySwapMax=0','--property=CPUQuota=25%','--property=TasksMax=128','--property=RuntimeMaxSec=60','--property=TimeoutStartSec=5','--property=TimeoutStopSec=1','--property=KillMode=control-group','--property=SendSIGKILL=yes','--property=OOMPolicy=kill','--property=NoNewPrivileges=yes','--property=PrivateNetwork=yes','--property=LimitCORE=0','--setenv=DISPLAY='+os.environ['DISPLAY'],'--setenv=XAUTHORITY='+os.environ['XAUTHORITY'],'--setenv=WEBKIT_DISABLE_COMPOSITING_MODE=1','--setenv=WEBKIT_DISABLE_DMABUF_RENDERER=1','/usr/bin/python3','/probe/embedding.py','child',str(xid)]
    subprocess.Popen(args)
    GLib.timeout_add_seconds(65,lambda:Gtk.main_quit() or False)
    Gtk.main()
