//! External validation writer; never linked into the desktop application.
#[cfg(target_os = "linux")]
fn main() {
    use native_documents::snapshots::{Input, Recovery};
    use std::path::PathBuf;
    let root = PathBuf::from(
        std::env::var_os("PN_CRASH_ROOT").expect("Synthetic crash-test directory required"),
    );
    assert_eq!(root.file_name().unwrap(), "recovery");
    assert!(
        root.parent()
            .and_then(|p| p.file_name())
            .is_some_and(|name| name.to_string_lossy().starts_with("pn-recovery-crash-")),
        "Never run this helper on personal recovery storage"
    );
    let parent = std::env::var("PN_CRASH_PARENT").unwrap();
    let result = unsafe {
        libc::ptrace(
            libc::PTRACE_TRACEME,
            0,
            std::ptr::null_mut::<libc::c_void>(),
            std::ptr::null_mut::<libc::c_void>(),
        )
    };
    assert_ne!(
        result,
        -1,
        "Own-child tracing unavailable: {}",
        std::io::Error::last_os_error()
    );
    assert_eq!(unsafe { libc::raise(libc::SIGSTOP) }, 0);
    let written = Recovery::open(&root).unwrap().append(Input {
        document_id: "a".repeat(32),
        name: "note.mdx".into(),
        baseline: None,
        parent: Some(parent),
        source: "x".repeat(500_000),
    });
    if std::env::var_os("PN_REPORT_SYNC_RESULT").is_some() {
        println!(
            "{}",
            match written {
                Ok(written) => serde_json::json!({"ok": true, "written": written}),
                Err(error) => serde_json::json!({"ok": false, "error": error}),
            }
        );
        return;
    }
    written.unwrap();
    panic!("The parent should kill this process at the selected syscall boundary");
}
#[cfg(not(target_os = "linux"))]
fn main() {
    panic!("This validation helper requires Linux");
}
