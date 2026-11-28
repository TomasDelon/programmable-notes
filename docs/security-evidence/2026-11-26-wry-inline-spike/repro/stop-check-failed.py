import json,pathlib,re,subprocess,time

text=pathlib.Path('/mnt/host.log').read_text()
unit=re.search(r'^HOST_UNIT (programmable-notes-preview-[0-9-]+\.service)$',text,re.M)[1]
prefix=['runuser','-u','ubuntu','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus']
group=subprocess.check_output(prefix+['systemctl','--user','show',unit,'-p','ControlGroup','--value'],text=True).strip()
path=pathlib.Path('/sys/fs/cgroup')/group.lstrip('/')
identities={}
def discover():
    if path.exists():
        for pid in (path/'cgroup.procs').read_text().splitlines():
            try:
                fields=(pathlib.Path('/proc')/pid/'stat').read_text().rsplit(')',1)[1].split()
                identities.setdefault(pid,fields[19])
            except FileNotFoundError:
                pass
discover()
started=time.monotonic()
deadline=started+5
subprocess.run(prefix+['env','DISPLAY=:99','XAUTHORITY=/run/user/1000/wry-inline-Xauthority','xdotool','mousemove','200','382','click','1'],check=True)
while time.monotonic()<deadline:
    discover()
    live=[]
    for pid,identity in identities.items():
        try:
            fields=(pathlib.Path('/proc')/pid/'stat').read_text().rsplit(')',1)[1].split()
            if fields[19]==identity and fields[0]!='Z': live.append(pid)
        except FileNotFoundError:
            pass
    if not path.exists() and not live:
        print(json.dumps({'kind':'bounded_post_click_observation','elapsed_seconds':time.monotonic()-started,'cgroup_absent':True,'tracked_identities':identities,'host_stop_receipt':'HOST_BUTTON_STOP Ok(())' in pathlib.Path('/mnt/host.log').read_text(),'not_full_production_oracle':True}),flush=True)
        break
    time.sleep(.05)
else:
    print(json.dumps({'kind':'post_click_deadline_failed','live':live,'cgroup_exists':path.exists(),'elapsed_seconds':time.monotonic()-started}),flush=True)
    raise SystemExit(1)
