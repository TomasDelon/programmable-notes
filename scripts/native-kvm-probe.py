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


def observe_device():
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
        if not stat.S_ISCHR(os.fstat(fd).st_mode):
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


def main():
    if len(sys.argv) != 1:
        status, detail = 2, "arguments"
    elif (
        sys.platform != "linux"
        or os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted"
        or os.environ.get("RUNNER_OS") != "Linux"
        or os.environ.get("RUNNER_ARCH") != "X64"
    ):
        status, detail = 2, "runner-type"
    elif os.getuid() == 0 or os.getuid() != os.geteuid():
        status, detail = 2, "runner-user"
    else:
        try:
            states = {True: "yes", False: "no", None: "unknown"}
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
