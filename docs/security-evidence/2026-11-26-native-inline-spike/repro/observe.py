import gi,subprocess,time,json
gi.require_version('Gdk','3.0')
from gi.repository import Gdk
display=Gdk.Display.get_default()
root=Gdk.get_default_root_window()
Gdk.pixbuf_get_from_window(root,0,0,900,700).savev('/mnt/inline-before.png','png',[],[])
window=subprocess.check_output(['xdotool','search','--name','^Inline feasibility host$'],text=True).strip().splitlines()[-1]
print(subprocess.check_output(['xdotool','getwindowgeometry','--shell',window],text=True),flush=True)
subprocess.run(['xdotool','windowactivate','--sync',window],check=True)
for i in range(2):
    subprocess.run(['xdotool','mousemove','--window',window,'60','90','click','1'],check=True)
subprocess.run(['xdotool','mousemove','--window',window,'190','90','click','1','type','hello'],check=True)
time.sleep(1)
Gdk.pixbuf_get_from_window(root,0,0,900,700).savev('/mnt/inline-after.png','png',[],[])
print('INPUT_SENT',flush=True)
