#![cfg(all(target_os = "linux", target_arch = "x86_64"))]
//! Real process interruption of public Store::save; no production failpoints.
use native_documents::Store;
use sha2::{Digest, Sha256};
use std::{
    fs,
    os::unix::{fs::PermissionsExt, process::ExitStatusExt},
    path::PathBuf,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Fixture(PathBuf);
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
fn stopped(pid: libc::pid_t) -> i32 {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let mut status = 0;
        let result = unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) };
        if result == pid {
            assert!(
                Instant::now() < deadline,
                "Owned writer stop arrived after its deadline"
            );
            return status;
        }
        if result < 0 {
            assert_eq!(
                std::io::Error::last_os_error().raw_os_error(),
                Some(libc::EINTR)
            );
        }
        assert!(
            Instant::now() < deadline,
            "owned writer failed to reach its next trace stop"
        );
        thread::sleep(Duration::from_millis(1));
    }
}
fn trace(request: libc::c_uint, pid: libc::pid_t, data: *mut libc::c_void) {
    let result = unsafe { libc::ptrace(request, pid, std::ptr::null_mut::<libc::c_void>(), data) };
    assert_ne!(result, -1, "ptrace: {}", std::io::Error::last_os_error());
}
fn child_name(pid: libc::pid_t, address: u64) -> String {
    let mut bytes = Vec::new();
    for offset in (0..256).step_by(std::mem::size_of::<libc::c_long>()) {
        unsafe {
            *libc::__errno_location() = 0;
        }
        let word = unsafe {
            libc::ptrace(
                libc::PTRACE_PEEKDATA,
                pid,
                (address as usize + offset) as *mut libc::c_void,
                std::ptr::null_mut::<libc::c_void>(),
            )
        };
        assert!(
            word != -1 || unsafe { *libc::__errno_location() } == 0,
            "Cannot read owned writer syscall name: {}",
            std::io::Error::last_os_error()
        );
        for byte in word.to_ne_bytes() {
            if byte == 0 {
                return String::from_utf8(bytes).unwrap();
            }
            bytes.push(byte);
        }
    }
    panic!("Owned writer syscall name exceeded bounded fixture name length");
}
fn next_source() -> String {
    format!(
        "\u{feff}import React from 'react'\r\n\r\n{{/* opaque */}}\n\n# New Café 😀\r\n{}\n",
        "Literal text. ".repeat(16000)
    )
}

#[test]
#[ignore = "requires disposable Linux x86_64 own-child ptrace and explicit validation writer"]
fn actual_save_crashes_preserve_complete_document_and_permissions() {
    for stage in ["write", "synced", "published", "durable"] {
        let root = std::env::temp_dir().join(format!(
            "pn-document-save-crash-{stage}-{}",
            std::process::id()
        ));
        fs::create_dir(&root).unwrap();
        let fixture = Fixture(root);
        fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o700)).unwrap();
        let file = fixture.0.join("note.mdx");
        let sibling = fixture.0.join("untouched.mdx");
        let original = "\u{feff}# Prior Café 😀\r\n\r\n{/* keep JSX */}\nOriginal text.\r\n";
        fs::write(&file, original).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        fs::write(&sibling, b"untouched\r\n\n").unwrap();
        let writer = std::env::var_os("PN_SAVE_CRASH_WRITER_BINARY")
            .expect("Build and explicitly provide document-save-crash-writer");
        let expected_executable =
            fs::canonicalize(&writer).unwrap_or_else(|_| PathBuf::from(writer.clone()));
        let child = Command::new(writer)
            .env("PN_DOCUMENT_SAVE_CRASH_ROOT", &fixture.0)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let mut child = OwnedChild(child, false);
        let pid: libc::pid_t = child.0.id().try_into().unwrap();
        let status = stopped(pid);
        child.1 = libc::WIFEXITED(status) || libc::WIFSIGNALED(status);
        if libc::WIFEXITED(status) && libc::WEXITSTATUS(status) == 2 {
            panic!("NOT RUN: own-child ptrace prerequisite rejected; Save crash acceptance not executed");
        }
        assert!(libc::WIFSTOPPED(status));
        assert_eq!(libc::WSTOPSIG(status), libc::SIGSTOP);
        let executable = fs::read_link(format!("/proc/{pid}/exe")).unwrap();
        assert_eq!(executable, expected_executable);
        let executable_sha256: String =
            Sha256::digest(fs::read(format!("/proc/{pid}/exe")).unwrap())
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
        let stat = fs::read_to_string(format!("/proc/{pid}/stat")).unwrap();
        let start_tick = stat
            .rsplit(") ")
            .next()
            .unwrap()
            .split_whitespace()
            .nth(19)
            .unwrap()
            .to_owned();

        trace(
            libc::PTRACE_SETOPTIONS,
            pid,
            (libc::PTRACE_O_TRACESYSGOOD | libc::PTRACE_O_EXITKILL) as usize as *mut libc::c_void,
        );
        let mut reached = false;
        let mut observed_syscall = -1;
        let mut observed_return = -1;
        let mut observed_fd = None;
        let mut observed_names = None;
        let deadline = Instant::now() + Duration::from_secs(15);
        for _ in 0..5000 {
            assert!(
                Instant::now() < deadline,
                "publication observation exceeded bound"
            );
            trace(libc::PTRACE_SYSCALL, pid, std::ptr::null_mut());
            let status = stopped(pid);
            assert!(
                Instant::now() < deadline,
                "Trace stop completed after its stage deadline"
            );
            child.1 = libc::WIFEXITED(status) || libc::WIFSIGNALED(status);
            assert!(!child.1, "writer exited before {stage}");
            if !libc::WIFSTOPPED(status) || libc::WSTOPSIG(status) != (libc::SIGTRAP | 0x80) {
                continue;
            }
            let mut regs: libc::user_regs_struct = unsafe { std::mem::zeroed() };
            trace(
                libc::PTRACE_GETREGS,
                pid,
                (&mut regs as *mut libc::user_regs_struct).cast(),
            );
            let result = regs.rax as i64;
            // Linux x86_64 syscall-entry stops expose rax=-ENOSYS. Only
            // nonnegative successful exit stops can match publication stages.
            if result < 0 {
                continue;
            }
            let syscall = regs.orig_rax as i64;
            let fd = fs::read_link(format!("/proc/{pid}/fd/{}", regs.rdi)).ok();
            let publication = if [libc::SYS_renameat, libc::SYS_renameat2].contains(&syscall) {
                let destination_fd = fs::read_link(format!("/proc/{pid}/fd/{}", regs.rdx)).unwrap();
                let old_name = child_name(pid, regs.rsi);
                let new_name = child_name(pid, regs.r10);
                println!("DOCUMENT_SAVE_RENAME_OBSERVATION syscall={syscall} result={result} source_fd={fd:?} destination_fd={destination_fd:?} source_name={old_name:?} destination_name={new_name:?}");
                let matches = result == 0
                    && fd.as_deref() == Some(fixture.0.as_path())
                    && destination_fd == fixture.0
                    && old_name.strip_prefix(".pn-save-").is_some_and(|name| {
                        name.len() == 32 && name.bytes().all(|byte| byte.is_ascii_hexdigit())
                    })
                    && new_name == "note.mdx"
                    && (syscall != libc::SYS_renameat2 || regs.r8 == 0);
                if matches {
                    observed_names = Some((old_name, new_name));
                }
                matches
            } else {
                false
            };
            let temporary = fd.as_ref().is_some_and(|path| {
                path.parent() == Some(fixture.0.as_path())
                    && path
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .starts_with(".pn-save-")
            });
            reached = match stage {
                "write" => syscall == libc::SYS_write && result > 0 && temporary,
                "synced" => syscall == libc::SYS_fsync && result == 0 && temporary,
                // glibc implements renameat2(flags=0) with renameat on this
                // validated Linux. Both are atomic; names and both FDs match.
                "published" => publication,
                "durable" => {
                    observed_names.is_some()
                        && syscall == libc::SYS_fsync
                        && result == 0
                        && fd.as_deref() == Some(fixture.0.as_path())
                }
                _ => false,
            };
            if reached {
                observed_syscall = syscall;
                observed_return = result;
                observed_fd = fd;
                break;
            }
        }
        assert!(reached, "actual publication stage not observed: {stage}");
        child.0.kill().unwrap();
        let status = child.0.wait().unwrap();
        child.1 = true;
        assert_eq!(status.signal(), Some(libc::SIGKILL));
        let next = next_source();
        let expected = if matches!(stage, "published" | "durable") {
            &next
        } else {
            original
        };
        assert_eq!(fs::read(&file).unwrap(), expected.as_bytes());
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o640
        );
        assert_eq!(fs::read(&sibling).unwrap(), b"untouched\r\n\n");
        let orphan_count = fs::read_dir(&fixture.0)
            .unwrap()
            .filter(|entry| {
                entry
                    .as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".pn-save-")
            })
            .count();
        assert_eq!(
            orphan_count,
            usize::from(matches!(stage, "write" | "synced"))
        );
        let mut reopened = Store::default();
        let document = reopened.open(&[file.clone()]).unwrap().remove(0);
        assert_eq!(document.source, expected);
        let recovered = format!("{expected}\nExplicit subsequent save.\r\n");
        assert!(
            reopened
                .save(&document.id, &document.revision, &recovered)
                .unwrap()
                .durable
        );
        assert_eq!(fs::read(&file).unwrap(), recovered.as_bytes());
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o640
        );
        assert_eq!(fs::read(&sibling).unwrap(), b"untouched\r\n\n");
        println!("REAL_DOCUMENT_SAVE_CRASH_PASS stage={stage} writer_pid={pid} start_tick={start_tick} executable={executable:?} executable_sha256={executable_sha256} observed_syscall={observed_syscall} syscall_return={observed_return} matched_fd={observed_fd:?} publication_names={observed_names:?} signal=SIGKILL complete_bytes=true mode=0640 sibling_unchanged=true reopened_and_saved=true orphan_temporaries={orphan_count}");
    }
}
