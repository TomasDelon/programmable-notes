"""Observe KVM API access from an ordinary account on the standard x64 Linux job."""

import errno
import os
import stat
import sys


def device_metadata():
    import grp

    fields = dict.fromkeys((
        "character", "symlink", "root_owned", "group_exists", "group_matches",
        "mode_0660", "sysfs_matches", "acl_absent", "caller_member",
    ))
    group_id = None
    try:
        group_id = grp.getgrnam("kvm").gr_gid
        fields["group_exists"] = True
        fields["caller_member"] = os.getegid() == group_id or group_id in os.getgroups()
    except KeyError:
        fields["group_exists"] = False
    except OSError:
        pass

    try:
        node = os.lstat("/dev/kvm")
    except OSError:
        return fields
    fields["character"] = stat.S_ISCHR(node.st_mode)
    fields["symlink"] = stat.S_ISLNK(node.st_mode)
    if not fields["character"]:
        return fields

    # Do not follow a link or print owners, ACLs or sysfs contents. Only an
    # explicit ENODATA establishes absence of the access ACL.
    details = {
        "root_owned": node.st_uid == 0,
        "group_matches": None if group_id is None else node.st_gid == group_id,
        "mode_0660": stat.S_IMODE(node.st_mode) == 0o660,
    }
    try:
        with open("/sys/class/misc/kvm/dev", encoding="ascii") as dev:
            text = dev.read(65)
        numbers = text.strip().split(":")
        if len(text) <= 64 and len(numbers) == 2 and all(n.isdecimal() for n in numbers):
            device_numbers = (os.major(node.st_rdev), os.minor(node.st_rdev))
            details["sysfs_matches"] = device_numbers == tuple(map(int, numbers))
    except (OSError, UnicodeError):
        pass
    try:
        os.getxattr("/dev/kvm", "system.posix_acl_access", follow_symlinks=False)
        details["acl_absent"] = False
    except OSError as error:
        if error.errno == errno.ENODATA:
            details["acl_absent"] = True
    try:
        after = os.lstat("/dev/kvm")
        # Exclude a replaced node or a permissions/ACL change during this sample.
        if node == after and node.st_ctime_ns == after.st_ctime_ns:
            fields.update(details)
        else:
            fields["character"] = fields["symlink"] = None
    except OSError:
        fields["character"] = fields["symlink"] = None
    return fields


def node_key(node):
    return node.st_dev, node.st_ino, node.st_ctime_ns


def observe_device(*, version=True, expected_node=None):
    import fcntl

    try:
        fd = os.open("/dev/kvm", os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
    except OSError as error:
        if error.errno in (errno.ENOENT, errno.ENODEV, errno.ENXIO):
            return 2, "device-missing"
        if error.errno in (errno.EACCES, errno.EPERM):
            return 2, "open-denied"
        if error.errno == errno.ELOOP:
            return 2, "device-link"
        raise

    try:
        if not version:
            return 2, "baseline-opened"
        node = os.fstat(fd)
        if expected_node is not None and node_key(node) != node_key(expected_node):
            return 2, "device-changed"
        if not stat.S_ISCHR(node.st_mode):
            return 2, "device-type"
        try:
            # KVM_GET_API_VERSION is the single x86 Linux UAPI query used here.
            version = fcntl.ioctl(fd, 0xAE00, 0)
        except OSError as error:
            if error.errno in (errno.ENOTTY, errno.EOPNOTSUPP):
                return 2, "ioctl-unsupported"
            if error.errno in (errno.EACCES, errno.EPERM):
                return 2, "ioctl-denied"
            raise
        return (0, "version=12") if version == 12 else (2, "api-version")
    finally:
        os.close(fd)


ROLE_NAME = "pn-kvm-api"
REFERENCE = "/run/pn-kvm-api/reference"


def stock_metadata(member):
    return {
        "character": True, "symlink": False, "root_owned": True, "group_exists": True,
        "group_matches": True, "mode_0660": True, "sysfs_matches": True,
        "acl_absent": True, "caller_member": member,
    }


def bounded_read(path, limit=4096):
    with open(path, "rb") as source:
        value = source.read(limit + 1)
    if not value.strip() or len(value) > limit:
        raise ValueError("incomplete context")
    return value


JOB_CGROUP_FIELDS = ("cpu_available", "memory_available", "pids_available", "cpu_enabled",
                     "memory_enabled", "pids_enabled", "domain_nonroot", "observer_direct",
                     "other_direct_visible", "root_coordinate_ambiguous", "device_policy_verified")


def job_cgroup_location():
    """Accept only the unambiguous canonical unified mount on the hosted image."""
    namespace = os.stat("/proc/self/ns/cgroup")
    membership = bounded_read("/proc/self/cgroup")
    if (not membership.startswith(b"0::/") or not membership.endswith(b"\n")
            or len(membership.splitlines()) != 1):
        raise ValueError
    coordinate = membership[4:-1]
    parts = coordinate.split(b"/") if coordinate else []
    if len(parts) > 64 or any(p in (b"", b".", b"..") or b"\0" in p for p in parts):
        raise ValueError
    mounts = []
    table = bounded_read("/proc/self/mountinfo", 262144)
    if not table.endswith(b"\n"):
        raise ValueError
    for line in table.splitlines():
        left, right = line.split(b" - ", 1)
        fields = left.split()
        filesystem = right.split()
        if len(fields) < 6 or len(filesystem) != 3:
            raise ValueError
        point = fields[4]
        kind = filesystem[0]
        if point.startswith(b"/sys/fs/cgroup/"):
            raise ValueError
        if point == b"/sys/fs/cgroup" or kind == b"cgroup2":
            if (kind, fields[3], point) != (b"cgroup2", b"/", b"/sys/fs/cgroup"):
                raise ValueError
            mounts.append((fields[0], fields[2]))
    if len(mounts) != 1:
        raise ValueError
    mount_id, device = mounts[0]
    major, minor = device.split(b":")
    return parts, os.makedev(int(major), int(minor)), mount_id, namespace.st_dev, namespace.st_ino


def open_job_cgroup(parts, device, stack):
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_DIRECTORY
    directory = os.open("/", flags)
    stack.callback(os.close, directory)
    for name in (b"sys", b"fs", b"cgroup", *parts):
        directory = os.open(name, flags, dir_fd=directory)
        stack.callback(os.close, directory)
    if os.fstat(directory).st_dev != device:
        raise ValueError
    return directory


def job_cgroup_file(directory, name, device, limit=4096):
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    fd = os.open(name, flags, dir_fd=directory)
    try:
        source = os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise
    with source:
        node = os.fstat(fd)
        if node.st_dev != device or not stat.S_ISREG(node.st_mode):
            raise ValueError
        data = source.read(limit + 1)
    if len(data) > limit or (data and not data.endswith(b"\n")):
        raise ValueError
    return data


def job_domain_sample(directory, device):
    import re

    # cgroup.type is CFTYPE_NOT_ON_ROOT. Threaded domains have different
    # cgroup.procs semantics and cannot support this ordinary domain inference.
    if job_cgroup_file(directory, b"cgroup.type", device) != b"domain\n":
        raise ValueError
    controllers = []
    for file in (b"cgroup.controllers", b"cgroup.subtree_control"):
        tokens = job_cgroup_file(directory, file, device).split()
        if any(not re.fullmatch(rb"[a-z][a-z0-9_]*", token) for token in tokens):
            raise ValueError
        controllers.append(set(tokens))
    available, enabled = controllers
    # An occupied non-root domain cannot distribute memory to its children.
    # Seeing both conditions in this sample would mean the snapshot is stale.
    if not enabled <= available or b"memory" in enabled:
        raise ValueError
    pids = job_cgroup_file(directory, b"cgroup.procs", device, 65536).splitlines()
    own_pid = str(os.getpid()).encode("ascii")
    if own_pid not in pids or any(not re.fullmatch(rb"[1-9][0-9]*", pid) for pid in pids):
        raise ValueError
    fields = dict.fromkeys(JOB_CGROUP_FIELDS)
    for name in ("cpu", "memory", "pids"):
        fields[name + "_available"] = name.encode("ascii") in available
        fields[name + "_enabled"] = name.encode("ascii") in enabled
    fields.update(domain_nonroot=True, observer_direct=True,
                  other_direct_visible=any(pid != own_pid for pid in pids),
                  root_coordinate_ambiguous=False)
    return fields


def job_cgroup_metadata():
    """Advisory topology only. Device BPF authorization is never inferred."""
    from contextlib import ExitStack

    unknown = dict.fromkeys(JOB_CGROUP_FIELDS)
    try:
        with ExitStack() as stack:
            location = job_cgroup_location()
            parts, device = location[:2]
            directory = open_job_cgroup(parts, device, stack)
            if parts:
                fields = job_domain_sample(directory, device)
                if job_domain_sample(directory, device) != fields:
                    return unknown
            else:
                # A visible / is relative to the caller's cgroup namespace.
                fields = unknown | {"root_coordinate_ambiguous": True}
            if job_cgroup_location() != location:
                return unknown
            current = open_job_cgroup(parts, device, stack)
            if os.fstat(current).st_ino != os.fstat(directory).st_ino:
                return unknown
            return fields
    except Exception:
        # An optional observation cannot change the independent device API result.
        return unknown


def security_context():
    # This experiment is specific to the Ubuntu AppArmor image. Refuse a
    # different LSM stack until its per-task label interfaces are accounted for.
    active = bounded_read("/sys/kernel/security/lsm").strip().split(b",")
    supported = {b"capability", b"landlock", b"lockdown", b"yama", b"apparmor",
                 b"integrity", b"ima", b"evm", b"bpf"}
    if b"apparmor" not in active or not set(active) <= supported:
        raise ValueError("unsupported LSM stack")
    status = bounded_read("/proc/self/status", 65536).splitlines()
    values = []
    for field in (b"Seccomp:", b"Seccomp_filters:"):
        matches = [line[len(field):].strip() for line in status if line.startswith(field)]
        if len(matches) != 1 or not matches[0].isdigit():
            raise ValueError("incomplete seccomp status")
        values.append(int(matches[0]))
    mode, filters = values
    if mode not in (0, 1, 2) or (mode == 2) != (filters > 0):
        raise ValueError("inconsistent seccomp status")
    return (b",".join(active), bounded_read("/proc/self/attr/current"),
            bounded_read("/proc/self/attr/apparmor/current"), str(values).encode("ascii"))


def context_digest(node):
    import hashlib

    membership = bounded_read("/proc/self/cgroup")
    if (membership.count(b"\n") != 1 or not membership.startswith(b"0::/")
            or not membership.endswith(b"\n")):
        raise ValueError("unsupported cgroup")
    identities = []
    for name in ("cgroup", "ipc", "mnt", "net", "pid", "time", "user", "uts"):
        namespace = os.stat("/proc/self/ns/" + name)
        identities.append((namespace.st_dev, namespace.st_ino))
    identities.append(node_key(node))
    digest = hashlib.sha256()
    for field in (str(identities).encode("ascii"), membership, *security_context()):
        digest.update(len(field).to_bytes(4, "big"))
        digest.update(field)
    return digest.hexdigest()


def observed_context(node):
    try:
        return context_digest(node)
    except (OSError, ValueError):
        return None


def role_baseline():
    if device_metadata() != stock_metadata(False):
        return 2, "baseline-metadata"
    node = os.lstat("/dev/kvm")
    digest = observed_context(node)
    if digest is None:
        return 2, "context-unavailable"
    if observe_device(version=False) != (2, "open-denied"):
        return 2, "baseline-access"
    if node_key(os.lstat("/dev/kvm")) != node_key(node):
        return 2, "device-changed"
    return 0, digest


def role_credentials(expected_uid, expected_gid):
    import grp
    import pwd

    account = pwd.getpwnam(ROLE_NAME)
    group = grp.getgrnam(ROLE_NAME).gr_gid
    kvm_group = grp.getgrnam("kvm").gr_gid
    if (account.pw_uid != expected_uid or group != expected_gid
            or account.pw_uid == 0 or group == 0 or account.pw_gid != group
            or group == kvm_group or os.getgroups() != [kvm_group]):
        return False
    with open("/proc/self/status", encoding="ascii") as source:
        fields = dict(line.rstrip("\n").split(":", 1) for line in source if ":" in line)
    return (fields["Uid"].split() == [str(account.pw_uid)] * 4
            and fields["Gid"].split() == [str(group)] * 4
            and fields["NoNewPrivs"].strip() == "1"
            and all(int(fields[key], 16) == 0 for key in
                    ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb")))


def role_api():
    import re

    with open(REFERENCE, encoding="ascii") as source:
        reference = source.read(128)
    match = re.fullmatch(r"([0-9a-f]{64})\n([1-9][0-9]{0,9})\n([1-9][0-9]{0,9})\n", reference)
    if match is None:
        return 2, "reference"
    expected, uid, gid = match.groups()
    if not role_credentials(int(uid), int(gid)):
        return 2, "credentials"
    node = os.lstat("/dev/kvm")
    digest = observed_context(node)
    if digest is None:
        return 2, "context-unavailable"
    if digest != expected:
        return 2, "context-changed"
    if device_metadata() != stock_metadata(True):
        return 2, "device-metadata"
    return observe_device(expected_node=node)


def hosted_runner():
    return (sys.platform == "linux"
            and os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
            and os.environ.get("RUNNER_OS") == "Linux"
            and os.environ.get("RUNNER_ARCH") == "X64")


def close_inherited_fds():
    for name in os.listdir("/proc/self/fd"):
        fd = int(name)
        if fd > 2:
            try:
                os.close(fd)
            except OSError as error:
                # listdir's own directory descriptor was closed on return.
                if error.errno != errno.EBADF:
                    raise


def role_main(baseline):
    try:
        if os.getuid() == 0 or os.getuid() != os.geteuid():
            status, detail = 2, "runner-user"
        elif baseline and not hosted_runner():
            status, detail = 2, "runner-type"
        else:
            if baseline:
                status, detail = role_baseline()
            else:
                close_inherited_fds()
                status, detail = role_api()
    except Exception:
        status, detail = 3, "observer-runtime"
    if baseline and status == 0:
        # Private handoff to the lifecycle wrapper, never a workflow annotation.
        print(detail)
    else:
        marker = {0: "ACCESSIBLE", 2: "UNAVAILABLE", 3: "FAILED"}[status]
        level = "error" if status == 3 else "notice"
        print(f"::{level}::NATIVE_KVM_ROLE_API_{marker}", detail,
              file=sys.stderr if baseline else sys.stdout)
    return status


def main():
    if sys.argv[1:] in (["--role-baseline"], ["--role-api"]):
        return role_main(sys.argv[1] == "--role-baseline")
    if len(sys.argv) != 1:
        status, detail = 2, "arguments"
    elif not hosted_runner():
        status, detail = 2, "runner-type"
    elif os.getuid() == 0 or os.getuid() != os.geteuid():
        status, detail = 2, "runner-user"
    else:
        try:
            states = {True: "yes", False: "no", None: "unknown"}
            cgroup = job_cgroup_metadata()
            print("::notice::NATIVE_JOB_CGROUP_METADATA",
                  *(f"{key}={states[value]}" for key, value in cgroup.items()))
            metadata = device_metadata()
            print("::notice::NATIVE_KVM_DEVICE_METADATA",
                  *(f"{key}={states[value]}" for key, value in metadata.items()))
            status, detail = observe_device()
        except OSError:
            status, detail = 3, "device-io"
        except Exception:
            # Even interpreter/observer failures must not expose host data to CI.
            status, detail = 3, "observer-runtime"

    marker = {
        0: "::notice::NATIVE_KVM_API_ACCESSIBLE",
        2: "::notice::NATIVE_KVM_API_UNAVAILABLE",
        3: "::error::NATIVE_KVM_API_OBSERVER_FAILED",
    }[status]
    print(marker, detail)
    return status


if __name__ == "__main__":
    sys.exit(main())
