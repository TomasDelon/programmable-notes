//! External synthetic validation writer, never linked into the desktop app.
#[cfg(target_os = "linux")]
fn main() {
    use native_documents::{Error, Store};
    use std::{os::unix::fs::MetadataExt, path::PathBuf};
    let root = PathBuf::from(
        std::env::var_os("PN_DOCUMENT_SAVE_CRASH_ROOT")
            .expect("Explicit synthetic Save crash-test directory required"),
    );
    assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
    assert!(
        root.file_name().is_some_and(|name| name
            .to_string_lossy()
            .starts_with("pn-document-save-crash-")),
        "Never run this writer on personal documents"
    );
    assert_eq!(
        root.canonicalize().unwrap(),
        root,
        "Synthetic directory must not be a symlink"
    );
    let metadata = root.metadata().unwrap();
    assert_eq!(metadata.uid(), unsafe { libc::geteuid() });
    assert_eq!(
        metadata.mode() & 0o077,
        0,
        "Synthetic directory must be private"
    );
    let mut store = Store::default();
    let document = store.open(&[root.join("note.mdx")]).unwrap().remove(0);
    let traced = unsafe {
        libc::ptrace(
            libc::PTRACE_TRACEME,
            0,
            std::ptr::null_mut::<libc::c_void>(),
            std::ptr::null_mut::<libc::c_void>(),
        )
    };
    if traced == -1 {
        eprintln!(
            "NOT RUN: own-child ptrace prerequisite unavailable: {}",
            std::io::Error::last_os_error()
        );
        std::process::exit(2);
    }
    assert_eq!(unsafe { libc::raise(libc::SIGSTOP) }, 0);
    let source = format!(
        "\u{feff}import React from 'react'\r\n\r\n{{/* opaque */}}\n\n# New Café 😀\r\n{}\n",
        "Literal text. ".repeat(16000)
    );
    let result = store.save(&document.id, &document.revision, &source);
    // External harness mode only; this example is never linked into the app.
    if std::env::var_os("PN_SAVE_REPORT_RESULT").is_some_and(|value| value == "1") {
        let report = match result {
            Ok(saved) => serde_json::json!({
                "ok": true, "saved": saved, "previousRevision": document.revision,
            }),
            Err(error) => {
                let io_error_code = match &error {
                    Error::Io(value) => value.raw_os_error(),
                    _ => None,
                };
                serde_json::json!({
                    "ok": false, "error": error.to_string(), "ioErrorCode": io_error_code,
                })
            }
        };
        println!("{report}");
        return;
    }
    result.unwrap();
    panic!("The parent must interrupt this writer at the selected actual Save syscall boundary");
}
#[cfg(not(target_os = "linux"))]
fn main() {
    panic!("This external validation writer requires Linux");
}
