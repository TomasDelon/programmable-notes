#![cfg(target_os = "linux")]
use native_documents::{Error, Store, Vault, MAX_SOURCE_BYTES};
use std::{
    fs,
    io::{ErrorKind, Read},
    os::{
        fd::FromRawFd,
        unix::fs::{symlink, PermissionsExt},
    },
    path::{Path, PathBuf},
    sync::{Arc, Barrier},
    thread,
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut id = [0; 16];
        getrandom::fill(&mut id).unwrap();
        let path = PathBuf::from("/tmp").join(format!(
            "pn-vault-create-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, path: &str, bytes: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn fds(root: &Path) -> usize {
    fs::read_dir("/proc/self/fd")
        .unwrap()
        .filter_map(Result::ok)
        .filter_map(|entry| fs::read_link(entry.path()).ok())
        .filter(|path| path.starts_with(root))
        .count()
}
struct Watch(fs::File);
impl Watch {
    fn new(path: &Path, mask: u32) -> Self {
        let fd = unsafe { libc::inotify_init1(libc::IN_CLOEXEC | libc::IN_NONBLOCK) };
        assert!(fd >= 0);
        let file = unsafe { fs::File::from_raw_fd(fd) };
        let name = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
        assert!(unsafe { libc::inotify_add_watch(fd, name.as_ptr(), mask) } >= 0);
        Self(file)
    }
    fn empty(&mut self) {
        assert_eq!(
            self.0.read(&mut [0; 4096]).unwrap_err().kind(),
            ErrorKind::WouldBlock
        );
    }
    fn observed(&mut self) {
        assert!(self.0.read(&mut [0; 4096]).unwrap() > 0);
    }
}
fn entries(path: &Path) -> Vec<String> {
    let mut names = fs::read_dir(path)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect::<Vec<_>>();
    names.sort();
    names
}

// Catches losing exact source/logical path, wrong new-file mode or missing follow-up authority.
#[test]
fn creates_nested_exact_source_with_private_mode_and_save_reopen_cas() {
    let f = Fixture::new();
    fs::create_dir(f.0.join("notes")).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let raw = "\u{feff}import React from 'react'\r\n{/* opaque 😀 */}\n<Component x={{v:'É'}} />\r\n$unfinished\n<Broken";
    let doc = store.create_vault(&vault, "notes/Note.MdX", raw).unwrap();
    assert_eq!(doc.logical_path, "notes/Note.MdX");
    assert_eq!(doc.name, "Note.MdX");
    assert_eq!(doc.source, raw);
    assert!(!doc.id.is_empty());
    assert!(!doc.revision.is_empty());
    assert!(!doc.durability_warning);
    let path = f.0.join("notes/Note.MdX");
    assert_eq!(fs::read(&path).unwrap(), raw.as_bytes());
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let next = format!("{raw}\r\nnext");
    let saved = store.save(&doc.id, &doc.revision, &next).unwrap();
    assert!(saved.durable);
    assert!(matches!(
        store.save(&doc.id, &doc.revision, "stale"),
        Err(Error::StaleRevision)
    ));
    let reopened = store.reopen(&doc.id, &saved.revision).unwrap();
    assert_eq!(reopened.source, next);
    assert_eq!(reopened.logical_path, "notes/Note.MdX");
    store.close(&doc.id).unwrap();
    assert_eq!(fds(&f.0), 1);
    assert_eq!(entries(&f.0.join("notes")), ["Note.MdX"]);
}

// Catches existing-leaf reads, replacement or temporary-file leaks on collisions.
#[test]
fn collisions_never_open_existing_payloads_or_replace_any_destination_type() {
    let f = Fixture::new();
    let outside = Fixture::new();
    let existing = f.file("existing.mdx", [0xff, 0xfe]);
    fs::set_permissions(&existing, fs::Permissions::from_mode(0o640)).unwrap();
    let secret = outside.file("secret.mdx", "outside");
    symlink(&secret, f.0.join("link.mdx")).unwrap();
    fs::create_dir(f.0.join("directory.mdx")).unwrap();
    let pipe = std::ffi::CString::new(f.0.join("pipe.mdx").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(pipe.as_ptr(), 0o600) }, 0);
    let mut existing_watch = Watch::new(&existing, libc::IN_OPEN | libc::IN_ACCESS);
    let mut outside_watch = Watch::new(&secret, libc::IN_OPEN | libc::IN_ACCESS);
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    for name in ["existing.mdx", "link.mdx", "directory.mdx", "pipe.mdx"] {
        assert!(store
            .create_vault(&vault, name, "must not overwrite")
            .is_err());
        assert_eq!(fds(&f.0), 1);
        assert_eq!(fds(&outside.0), 0);
    }
    existing_watch.empty();
    outside_watch.empty();
    assert_eq!(
        fs::metadata(&existing).unwrap().permissions().mode() & 0o777,
        0o640
    );
    assert!(fs::symlink_metadata(f.0.join("link.mdx"))
        .unwrap()
        .file_type()
        .is_symlink());
    assert!(fs::metadata(f.0.join("directory.mdx")).unwrap().is_dir());
    assert_eq!(fs::read(existing).unwrap(), [0xff, 0xfe]);
    existing_watch.observed();
    assert_eq!(fs::read(secret).unwrap(), b"outside");
    outside_watch.observed();
    assert_eq!(
        entries(&f.0),
        ["directory.mdx", "existing.mdx", "link.mdx", "pipe.mdx"]
    );
}

// Catches any parent I/O/publication before input and loaded-budget rejection.
#[test]
fn invalid_paths_source_and_exhausted_capacity_cannot_write() {
    let f = Fixture::new();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let mut watch = Watch::new(
        &f.0,
        libc::IN_CREATE | libc::IN_MOVED_TO | libc::IN_OPEN | libc::IN_ACCESS,
    );
    for path in [
        "",
        "/note.mdx",
        "../note.mdx",
        "a/../note.mdx",
        "a//note.mdx",
        "./note.mdx",
        "a/./note.mdx",
        "a\\note.mdx",
        "a\0.mdx",
        ".git/note.mdx",
        "node_modules/a.js",
        ".programmable-notes/a.md",
        "x/.git/a.mdx",
        "note.mdx/",
        "note.txt",
    ] {
        assert!(
            store.create_vault(&vault, path, "safe").is_err(),
            "{path:?}"
        );
        watch.empty();
    }
    for path in [
        format!("{}note.mdx", "a/".repeat(17)),
        format!("{}.mdx", "a".repeat(4096)),
    ] {
        assert!(store.create_vault(&vault, &path, "safe").is_err());
        watch.empty();
    }
    assert!(store
        .create_vault(
            &vault,
            "oversized.mdx",
            &"é".repeat(MAX_SOURCE_BYTES / 2 + 1)
        )
        .is_err());
    watch.empty();
    for n in 0..32 {
        store
            .create_vault(&vault, &format!("{n}.mdx"), "created")
            .unwrap();
    }
    // Drain actual successful creation events before testing exhausted capacity.
    while watch.0.read(&mut [0; 4096]).is_ok() {}
    assert!(store.create_vault(&vault, "overflow.mdx", "safe").is_err());
    watch.empty();
    assert!(!f.0.join("overflow.mdx").exists());
}

// Catches re-resolving stale display paths and following symlink parents.
#[test]
fn root_and_ancestor_replacement_keep_creation_inside_retained_scope() {
    let f = Fixture::new();
    let outside = Fixture::new();
    fs::create_dir_all(f.0.join("ancestor/selected/notes")).unwrap();
    fs::create_dir(outside.0.join("notes")).unwrap();
    let selected = f.0.join("ancestor/selected");
    let vault = Vault::select_authorized(&selected).unwrap();
    fs::rename(&selected, f.0.join("ancestor/retained")).unwrap();
    symlink(&outside.0, &selected).unwrap();
    fs::rename(f.0.join("ancestor"), f.0.join("moved")).unwrap();
    symlink(&outside.0, f.0.join("ancestor")).unwrap();
    let mut store = Store::default();
    let doc = store
        .create_vault(&vault, "notes/note.md", "authorized")
        .unwrap();
    assert_eq!(
        doc.display_path,
        selected.join("notes/note.md").to_str().unwrap()
    );
    assert_eq!(
        fs::read(f.0.join("moved/retained/notes/note.md")).unwrap(),
        b"authorized"
    );
    assert!(!outside.0.join("notes/note.md").exists());
    symlink(&outside.0, f.0.join("moved/retained/link")).unwrap();
    assert!(store
        .create_vault(&vault, "link/escape.mdx", "bad")
        .is_err());
    assert!(store
        .create_vault(&vault, "missing/note.mdx", "bad")
        .is_err());
    assert!(!f.0.join("moved/retained/missing").exists());
    drop(vault);
    store
        .save(&doc.id, &doc.revision, "still authorized")
        .unwrap();
    assert_eq!(
        fs::read(f.0.join("moved/retained/notes/note.md")).unwrap(),
        b"still authorized"
    );
}

// Catches granting failed creations or leaving ordinary failed-write artifacts.
#[test]
fn readonly_parent_failure_retains_existing_grants_and_leaves_no_temporary() {
    assert_ne!(
        unsafe { libc::geteuid() },
        0,
        "Unprivileged permission evidence required"
    );
    let f = Fixture::new();
    fs::create_dir(f.0.join("locked")).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let original = store
        .create_vault(&vault, "original.mdx", "original")
        .unwrap();
    fs::set_permissions(f.0.join("locked"), fs::Permissions::from_mode(0o500)).unwrap();
    for _ in 0..16 {
        assert!(store
            .create_vault(&vault, "locked/note.mdx", "retained source")
            .is_err());
    }
    assert!(entries(&f.0.join("locked")).is_empty());
    assert_eq!(fds(&f.0), 2);
    fs::set_permissions(f.0.join("locked"), fs::Permissions::from_mode(0o700)).unwrap();
    store
        .save(&original.id, &original.revision, "existing still usable")
        .unwrap();
    for n in 0..31 {
        store
            .create_vault(&vault, &format!("locked/{n}.mdx"), "ok")
            .unwrap();
    }
    assert!(store.create_vault(&vault, "extra.mdx", "capacity").is_err());
}

// Catches aggregate byte exhaustion publishing a file or consuming a grant.
#[test]
fn aggregate_budget_failure_does_not_publish_and_can_retry_after_releasing_bytes() {
    let f = Fixture::new();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let source = "x".repeat(MAX_SOURCE_BYTES);
    let mut docs = Vec::new();
    for n in 0..16 {
        docs.push(
            store
                .create_vault(&vault, &format!("{n}.mdx"), &source)
                .unwrap(),
        );
    }
    assert!(store.create_vault(&vault, "last.mdx", &source).is_err());
    assert!(!f.0.join("last.mdx").exists());
    assert_eq!(entries(&f.0).len(), 16);
    store
        .save(&docs[0].id, &docs[0].revision, "smaller")
        .unwrap();
    assert_eq!(
        store
            .create_vault(&vault, "last.mdx", &source)
            .unwrap()
            .source,
        source
    );
}

// Catches dropping no-replace protection when independent creators compete.
#[test]
fn competing_creators_have_one_exact_winner_and_no_temporary_leftovers() {
    let f = Fixture::new();
    let barrier = Arc::new(Barrier::new(2));
    let workers = ["first\r\n😀", "second\nÉ"].map(|source| {
        let root = f.0.clone();
        let barrier = barrier.clone();
        thread::spawn(move || {
            let vault = Vault::select_authorized(&root).unwrap();
            let mut store = Store::default();
            barrier.wait();
            let result = store.create_vault(&vault, "note.mdx", source);
            (source, result)
        })
    });
    let results = workers.map(|worker| worker.join().unwrap());
    assert_eq!(
        results.iter().filter(|(_, result)| result.is_ok()).count(),
        1
    );
    let winner = results.iter().find(|(_, result)| result.is_ok()).unwrap();
    assert_eq!(fs::read(f.0.join("note.mdx")).unwrap(), winner.0.as_bytes());
    assert!(results
        .iter()
        .filter_map(|(_, result)| result.as_ref().err())
        .all(|error| matches!(error, Error::Conflict)));
    assert_eq!(entries(&f.0), ["note.mdx"]);
    assert_eq!(fds(&f.0), 0);
}
