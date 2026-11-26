//! External synthetic integration harness; never linked into the desktop app.
#[cfg(target_os = "linux")]
fn main() {
    use native_documents::{Store, Vault};
    use serde::Deserialize;
    use std::{
        io::{self, BufRead, Write},
        os::unix::fs::MetadataExt,
        path::{Path, PathBuf},
    };
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct SaveRequest {
        document_id: String,
        expected_disk_revision: String,
        source: String,
    }
    #[derive(Deserialize)]
    #[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
    enum ControlRequest {
        Close {
            #[serde(rename = "documentId")]
            document_id: String,
        },
        Open {},
    }
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Request {
        Save(SaveRequest),
        Control(ControlRequest),
    }
    let root = PathBuf::from(
        std::env::var_os("PN_AUTOSAVE_TEST_ROOT").expect("Synthetic fixture required"),
    );
    assert_eq!(root.parent(), Some(Path::new("/tmp")));
    assert!(root
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("pn-autosave-")));
    assert_eq!(root.canonicalize().unwrap(), root);
    let metadata = root.metadata().unwrap();
    assert!(metadata.is_dir());
    assert_eq!(metadata.uid(), unsafe { libc::geteuid() });
    assert_eq!(metadata.mode() & 0o777, 0o700);
    let vault = Vault::select_authorized(&root).unwrap();
    let mut store = Store::default();
    let document = store.open(&[root.join("note.mdx")]).unwrap().remove(0);
    println!("{}", serde_json::to_string(&document).unwrap());
    io::stdout().flush().unwrap();
    // Bound encoded requests before deserialization, including escaped source.
    let mut input = io::stdin().lock();
    for _ in 0..128 {
        let mut bytes = Vec::new();
        loop {
            let available = input.fill_buf().unwrap();
            if available.is_empty() {
                assert!(bytes.is_empty(), "Truncated request");
                return;
            }
            let count = available
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(available.len(), |index| index + 1);
            assert!(bytes.len() + count <= 3_100_000, "Request too large");
            let complete = available[count - 1] == b'\n';
            bytes.extend_from_slice(&available[..count]);
            input.consume(count);
            if complete {
                break;
            }
        }
        let response = match serde_json::from_slice::<Request>(&bytes) {
            Ok(request) => {
                let result = match request {
                    Request::Save(request) => store.save(
                        &request.document_id,
                        &request.expected_disk_revision,
                        &request.source,
                    ).map(|saved| serde_json::json!({
                        "ok": true, "diskRevision": saved.revision, "durable": saved.durable,
                    })),
                    Request::Control(ControlRequest::Close { document_id }) => store.close(&document_id)
                        .map(|()| serde_json::json!({"ok": true})),
                    // Fixed synthetic fixture only; never accept an open path.
                    Request::Control(ControlRequest::Open {}) => store.open_vault(&vault, &["note.mdx".into()])
                        .map(|mut documents| serde_json::json!({"ok": true, "document": documents.remove(0)})),
                };
                result.unwrap_or_else(
                    |error| serde_json::json!({"ok": false, "error": error.to_string()}),
                )
            }
            Err(error) => serde_json::json!({"ok": false, "error": error.to_string()}),
        };
        println!("{response}");
        io::stdout().flush().unwrap();
    }
    panic!("Synthetic request budget exceeded");
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("NOT RUN: Linux is required");
    std::process::exit(2);
}
