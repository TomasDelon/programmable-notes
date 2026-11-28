import json, os, pathlib, re, subprocess, time

text=pathlib.Path('/mnt/host.log').read_text()
unit=re.search(r'^HOST_UNIT (programmable-notes-preview-[0-9-]+\.service)$',text,re.M)[1]
host=int(re.search(r'^HOST_READY pid=(\d+)',text,re.M)[1])
command=['runuser','-u','ubuntu','--','env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','systemctl','--user','show',unit,'-p','MainPID','-p','ControlGroup','-p','RuntimeMaxUSec','-p','KillMode','-p','OOMPolicy']
properties=subprocess.check_output(command,text=True)
print(properties,flush=True)
group=re.search(r'^ControlGroup=(.+)$',properties,re.M)[1]
path=pathlib.Path('/sys/fs/cgroup')/group.lstrip('/')
data={'unit':unit,'host_pid':host,'host_netns':os.readlink(f'/proc/{host}/ns/net'),'sample_utc':time.strftime('%Y-%m-%d %H:%M:%S',time.gmtime())}
for name in ['cpu.max','memory.max','memory.swap.max','pids.max','cgroup.events','cpu.stat','memory.current','memory.peak','cgroup.procs']:
    data[name]=(path/name).read_text().strip()
processes=[]
for pid in data['cgroup.procs'].splitlines():
    try:
        base=pathlib.Path('/proc')/pid
        status=(base/'status').read_text().splitlines()
        processes.append({'pid':int(pid),'comm':(base/'comm').read_text().strip(),'stat':(base/'stat').read_text().strip(),'cgroup':(base/'cgroup').read_text().strip(),'netns':os.readlink(base/'ns/net'),'status':[line for line in status if line.startswith(('Uid:','NoNewPrivs:','Seccomp:','Seccomp_filters:'))]})
    except FileNotFoundError:
        processes.append({'pid':int(pid),'raced_exit':True})
data['processes']=processes
print(json.dumps(data,indent=2),flush=True)
