#![cfg(all(target_os = "linux", target_arch = "x86_64"))]
//! Real SIGKILL at syscall boundaries, without production failpoints or mocks.
use native_documents::snapshots::{Input, Recovery};
use std::{
    fs,
    os::unix::process::ExitStatusExt,
    path::PathBuf,
    process::{Child, Command, Stdio},
};

struct Fixture(PathBuf);
impl Fixture {
    fn new(stage: &str) -> Self {
        let path =
            std::env::temp_dir().join(format!("pn-recovery-crash-{stage}-{}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn directory(&self) -> PathBuf {
        self.0.join("recovery")
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
struct OwnedChild(Child, bool);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if !self.1 {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}
fn input(source: String, parent: Option<String>) -> Input {
    Input {
        document_id: "a".repeat(32),
        name: "note.mdx".into(),
        baseline: None,
        parent,
        source,
    }
}
fn wait(pid: libc::pid_t) -> i32 {
    let mut status = 0;
    loop {
        let result = unsafe { libc::waitpid(pid, &mut status, 0) };
        if result == pid {
            return status;
        }
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::EINTR)
        );
    }
}
fn trace(request: libc::c_uint, pid: libc::pid_t, data: *mut libc::c_void) {
    let result = unsafe { libc::ptrace(request, pid, std::ptr::null_mut::<libc::c_void>(), data) };
    assert_ne!(result, -1, "ptrace: {}", std::io::Error::last_os_error());
}

#[test]
#[ignore = "requires a disposable Linux x86_64 environment permitting own-child ptrace"]
fn process_crashes_preserve_durable_recovery_at_each_publication_stage() {
    for stage in ["write", "synced", "published", "durable"] {
        let fixture = Fixture::new(stage);
        let directory = fixture.directory();
        let mut parent = None;
        let mut previous = None;
        for n in 1..=5 {
            let result = Recovery::open(&directory)
                .unwrap()
                .append(input(format!("# Prior {n}\r\nCafé 😀\r\n"), parent))
                .unwrap();
            assert!(result.durable);
            parent = Some(result.snapshot.id.clone());
            previous = Some(result.snapshot);
        }
        let previous = previous.unwrap();
        let child = Command::new(
            std::env::var_os("PN_CRASH_WRITER_BINARY")
                .expect("Build and provide the main-thread validation writer"),
        )
        .env("PN_CRASH_ROOT", &directory)
        .env("PN_CRASH_PARENT", parent.unwrap())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
        let mut child = OwnedChild(child, false);
        let pid: libc::pid_t = child.0.id().try_into().unwrap();
        let status = wait(pid);
        child.1 = libc::WIFEXITED(status) || libc::WIFSIGNALED(status);
        assert!(libc::WIFSTOPPED(status));
        assert_eq!(libc::WSTOPSIG(status), libc::SIGSTOP);
        trace(
            libc::PTRACE_SETOPTIONS,
            pid,
            (libc::PTRACE_O_TRACESYSGOOD | libc::PTRACE_O_EXITKILL) as usize as *mut libc::c_void,
        );
        let mut reached = false;
        for _ in 0..5000 {
            trace(libc::PTRACE_SYSCALL, pid, std::ptr::null_mut());
            let status = wait(pid);
            child.1 = libc::WIFEXITED(status) || libc::WIFSIGNALED(status);
            assert!(
                !libc::WIFEXITED(status) && !libc::WIFSIGNALED(status),
                "writer exited before {stage}"
            );
            if !libc::WIFSTOPPED(status) || libc::WSTOPSIG(status) != (libc::SIGTRAP | 0x80) {
                continue;
            }
            let mut registers: libc::user_regs_struct = unsafe { std::mem::zeroed() };
            trace(
                libc::PTRACE_GETREGS,
                pid,
                (&mut registers as *mut libc::user_regs_struct).cast(),
            );
            let syscall = registers.orig_rax as i64;
            let result = registers.rax as i64;
            // On x86_64 entry stops return -ENOSYS; only successful exit stops count.
            if result < 0 {
                continue;
            }
            let fd = fs::read_link(format!("/proc/{pid}/fd/{}", registers.rdi)).ok();
            let pending = fd
                .as_ref()
                .and_then(|p| p.file_name())
                .is_some_and(|n| n.to_string_lossy().starts_with(".pending-"));
            reached = match stage {
                "write" => syscall == libc::SYS_write && result > 0 && pending,
                "synced" => syscall == libc::SYS_fsync && result == 0 && pending,
                "published" => syscall == libc::SYS_renameat2 && result == 0,
                "durable" => {
                    syscall == libc::SYS_fsync
                        && result == 0
                        && fd.as_deref() == Some(directory.as_path())
                }
                _ => false,
            };
            if reached {
                break;
            }
        }
        assert!(reached, "publication stage not reached: {stage}");
        child.0.kill().unwrap();
        let status = child.0.wait().unwrap();
        child.1 = true;
        assert_eq!(status.signal(), Some(libc::SIGKILL));
        let store = Recovery::open(&directory).unwrap();
        let inventory = store.list().unwrap();
        assert!(inventory.errors.is_empty());
        assert_eq!(inventory.snapshots.len(), 5);
        assert_eq!(
            store.restore(&previous.file).unwrap(),
            "# Prior 5\r\nCafé 😀\r\n"
        );
        let head = &inventory.snapshots[0];
        if matches!(stage, "published" | "durable") {
            assert_eq!(head.metadata.generation, 6);
            assert_eq!(store.restore(&head.file).unwrap(), "x".repeat(500_000));
        } else {
            assert_eq!(head.metadata.generation, 5);
        }
        assert!(fs::read_dir(&directory).unwrap().all(|e| !e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".pending-")));
        println!("REAL_PROCESS_CRASH_PASS stage={stage} prior_version_retained=true incomplete_records_exposed=false");
    }
}
