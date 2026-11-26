"""Observe KVM API access from an ordinary account on the standard x64 Linux job."""

import errno
import os
import stat
import sys


def observe_device():
    import fcntl

    try:
        fd = os.open("/dev/kvm", os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
    except OSError as error:
        if error.errno in (errno.ENOENT, errno.ENODEV, errno.ENXIO):
            return 2, "device-missing"
        if error.errno in (errno.EACCES, errno.EPERM):
            return 2, "device-denied"
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
                return 2, "device-denied"
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
