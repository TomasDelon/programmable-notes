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
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut id = [0; 16];
        getrandom::fill(&mut id).unwrap();
        let root = PathBuf::from("/tmp").join(format!(
            "pn-vault-open-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn file(&self, name: &str, bytes: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(name);
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
    fn new(path: &Path) -> Self {
        let fd = unsafe { libc::inotify_init1(libc::IN_CLOEXEC | libc::IN_NONBLOCK) };
        assert!(fd >= 0, "inotify prerequisite unavailable");
        let file = unsafe { fs::File::from_raw_fd(fd) };
        let name = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
        assert!(
            unsafe { libc::inotify_add_watch(fd, name.as_ptr(), libc::IN_OPEN | libc::IN_ACCESS) }
                >= 0
        );
        let mut result = Self(file);
        result.empty();
        result
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
fn open(
    store: &mut Store,
    vault: &Vault,
    paths: &[&str],
) -> Result<Vec<native_documents::Document>, Error> {
    store.open_vault(
        vault,
        &paths
            .iter()
            .map(|path| path.to_string())
            .collect::<Vec<_>>(),
    )
}

// Catches eager inventory scans or source reads outside the selected paths.
#[test]
fn opens_only_selected_source_among_one_hundred_without_touching_siblings() {
    let f = Fixture::new();
    let raw =
        "\u{feff}import React from 'react'\r\n{/* opaque 😀 */}\n<Component x={{v:'É'}} />\r\n";
    for n in 0..100 {
        f.file(&format!("{n:03}.mdx"), raw);
    }
    fs::set_permissions(f.0.join("000.mdx"), fs::Permissions::from_mode(0o640)).unwrap();
    let unreadable = f.file("unreadable.mdx", [0xff]);
    fs::set_permissions(unreadable, fs::Permissions::from_mode(0)).unwrap();
    symlink("absent", f.0.join("unrelated-link")).unwrap();
    let mut sibling = Watch::new(&f.0.join("099.mdx"));
    let vault = Vault::select_authorized(&f.0).unwrap();
    assert!(
        vault.inventory().is_err(),
        "Fixture distinguishes a whole-vault scan"
    );
    let mut store = Store::default();
    let doc = open(&mut store, &vault, &["000.mdx"]).unwrap().remove(0);
    assert_eq!(doc.source, raw);
    assert_eq!(doc.logical_path, "000.mdx");
    sibling.empty();
    fs::read(f.0.join("099.mdx")).unwrap();
    sibling.observed();
    let next = format!("{raw}$unfinished\r\n<Broken\n");
    let saved = store.save(&doc.id, &doc.revision, &next).unwrap();
    assert!(saved.durable);
    assert_eq!(fs::read(f.0.join("000.mdx")).unwrap(), next.as_bytes());
    assert_eq!(
        fs::metadata(f.0.join("000.mdx"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o640
    );
    assert!(matches!(
        store.save(&doc.id, &doc.revision, "stale"),
        Err(Error::StaleRevision)
    ));
    assert_eq!(store.reopen(&doc.id, &saved.revision).unwrap().source, next);
}

// Catches validation after I/O, normalization of invalid paths, or duplicate grants.
#[test]
fn validates_entire_batch_before_reading_any_source() {
    let f = Fixture::new();
    let note = f.file("valid.mdx", "valid");
    let mut watch = Watch::new(&note);
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    for invalid in [
        "",
        "/valid.mdx",
        "../valid.mdx",
        "a/../valid.mdx",
        "./valid.mdx",
        "a/./valid.mdx",
        "a//valid.mdx",
        "valid.mdx/",
        "a\\valid.mdx",
        "bad\0.mdx",
        ".git/a.mdx",
        "node_modules/a.ts",
        ".programmable-notes/a.js",
        "a/.git/a.mdx",
        "unknown.txt",
    ] {
        assert!(
            open(&mut store, &vault, &["valid.mdx", invalid]).is_err(),
            "{invalid:?}"
        );
        watch.empty();
        assert_eq!(fds(&f.0), 1);
    }
    assert!(open(&mut store, &vault, &["valid.mdx", "valid.mdx"]).is_err());
    watch.empty();
    assert!(open(
        &mut store,
        &vault,
        &["valid.mdx", &format!("{}a.mdx", "x".repeat(4096))]
    )
    .is_err());
    watch.empty();
    assert!(open(
        &mut store,
        &vault,
        &["valid.mdx", &format!("{}a.mdx", "d/".repeat(17))]
    )
    .is_err());
    watch.empty();
    fs::read(note).unwrap();
    watch.observed();
}

// Catches symlink following and FIFO/device access instead of pinned classification.
#[test]
fn refuses_symlink_ancestors_leaves_and_special_sources_without_outside_reads() {
    let f = Fixture::new();
    let outside = Fixture::new();
    let secret = outside.file("secret.mdx", "outside");
    let mut watch = Watch::new(&secret);
    symlink(&outside.0, f.0.join("alias")).unwrap();
    symlink(&secret, f.0.join("leaf.mdx")).unwrap();
    let fifo = std::ffi::CString::new(f.0.join("pipe.mdx").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    fs::create_dir(f.0.join("directory.mdx")).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    for path in ["alias/secret.mdx", "leaf.mdx", "pipe.mdx", "directory.mdx"] {
        assert!(open(&mut store, &vault, &[path]).is_err());
        assert_eq!(fds(&f.0), 1);
        assert_eq!(fds(&outside.0), 0);
    }
    watch.empty();
    fs::read(secret).unwrap();
    watch.observed();
}

// Catches path-derived authority after root/ancestor replacement and grant lifetime mistakes.
#[test]
fn renamed_root_and_ancestor_keep_open_and_save_in_original_scope_after_vault_drop() {
    let f = Fixture::new();
    f.file("ancestor/selected/nested/note.mdx", "authorized");
    let old_root = f.0.join("ancestor/selected");
    let vault = Vault::select_authorized(&old_root).unwrap();
    fs::rename(&old_root, f.0.join("ancestor/retained")).unwrap();
    f.file("ancestor/selected/nested/note.mdx", "replacement");
    let mut store = Store::default();
    let first = open(&mut store, &vault, &["nested/note.mdx"])
        .unwrap()
        .remove(0);
    assert_eq!(first.source, "authorized");
    assert_eq!(
        first.display_path,
        old_root.join("nested/note.mdx").to_str().unwrap()
    );
    store.close(&first.id).unwrap();
    fs::rename(f.0.join("ancestor"), f.0.join("moved-ancestor")).unwrap();
    symlink(f.0.join("moved-ancestor/selected"), f.0.join("ancestor")).unwrap();
    let doc = open(&mut store, &vault, &["nested/note.mdx"])
        .unwrap()
        .remove(0);
    assert_eq!(doc.source, "authorized");
    drop(vault);
    let saved = store
        .save(&doc.id, &doc.revision, "new authorized bytes")
        .unwrap();
    assert!(saved.durable);
    assert_eq!(
        fs::read(f.0.join("moved-ancestor/retained/nested/note.mdx")).unwrap(),
        b"new authorized bytes"
    );
    assert_eq!(
        fs::read(f.0.join("moved-ancestor/selected/nested/note.mdx")).unwrap(),
        b"replacement"
    );
    store.close(&doc.id).unwrap();
    assert_eq!(fds(&f.0), 0);
}

// Catches re-resolving the original root through a replacement symlink at open time.
#[test]
fn replaced_root_symlink_cannot_redirect_lazy_open_or_save() {
    let f = Fixture::new();
    let outside = Fixture::new();
    f.file("selected/note.mdx", "authorized");
    outside.file("note.mdx", "outside");
    let vault = Vault::select_authorized(&f.0.join("selected")).unwrap();
    fs::rename(f.0.join("selected"), f.0.join("retained")).unwrap();
    symlink(&outside.0, f.0.join("selected")).unwrap();
    let mut store = Store::default();
    let doc = open(&mut store, &vault, &["note.mdx"]).unwrap().remove(0);
    assert_eq!(doc.source, "authorized");
    store
        .save(&doc.id, &doc.revision, "changed authorized")
        .unwrap();
    assert_eq!(
        fs::read(f.0.join("retained/note.mdx")).unwrap(),
        b"changed authorized"
    );
    assert_eq!(fs::read(outside.0.join("note.mdx")).unwrap(), b"outside");
}

// Catches format folding, subtree blacklist expansion, or rejecting supported boundary depth.
#[test]
fn preserves_case_formats_and_accepts_sixteen_directories() {
    let f = Fixture::new();
    let names = [
        "a.MdX",
        "b.mD",
        "c.TsX",
        "d.TS",
        "e.JsX",
        "f.JS",
        ".git.mdx",
        ".GIT/source.mdx",
    ];
    for name in names {
        f.file(name, name);
    }
    let deep = format!("{}note.mdx", "d/".repeat(16));
    f.file(&deep, "depth boundary");
    let vault = Vault::select_authorized(&f.0).unwrap();
    let docs = open(&mut Store::default(), &vault, &names).unwrap();
    assert_eq!(
        docs.iter()
            .map(|d| d.logical_path.as_str())
            .collect::<Vec<_>>(),
        names
    );
    assert!(docs.iter().all(|doc| doc.source == doc.logical_path));
    assert_eq!(
        open(&mut Store::default(), &vault, &[&deep]).unwrap()[0].source,
        "depth boundary"
    );
}

// Catches partial publication and descriptor leaks from late source failures.
#[test]
fn failed_batch_publishes_no_grants_and_retains_existing_capacity_and_permissions() {
    assert_ne!(
        unsafe { libc::geteuid() },
        0,
        "Permission evidence requires unprivileged user"
    );
    let f = Fixture::new();
    for n in 0..32 {
        f.file(&format!("{n}.mdx"), "source");
    }
    f.file("invalid.mdx", [0xff]);
    let big = f.file("big.mdx", []);
    fs::File::options()
        .write(true)
        .open(big)
        .unwrap()
        .set_len((MAX_SOURCE_BYTES + 1) as u64)
        .unwrap();
    let locked = f.file("locked.mdx", "private");
    fs::set_permissions(locked, fs::Permissions::from_mode(0)).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    for bad in ["invalid.mdx", "big.mdx", "locked.mdx", "missing.mdx"] {
        for _ in 0..8 {
            assert!(open(&mut store, &vault, &["0.mdx", bad]).is_err());
        }
        assert_eq!(fds(&f.0), 1);
    }
    let paths = (0..32).map(|n| format!("{n}.mdx")).collect::<Vec<_>>();
    let docs = store.open_vault(&vault, &paths).unwrap();
    assert_eq!(docs.len(), 32);
    assert!(open(&mut store, &vault, &["0.mdx"]).is_err());
    for doc in docs {
        store.close(&doc.id).unwrap();
    }
    assert_eq!(fds(&f.0), 1);
}

// Catches aggregate budget changes or nontransactional capacity accounting.
#[test]
fn aggregate_budget_and_existing_grants_are_preserved_on_failure() {
    let f = Fixture::new();
    for n in 0..17 {
        f.file(&format!("{n}.mdx"), vec![b'x'; MAX_SOURCE_BYTES]);
    }
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let all = (0..17).map(|n| format!("{n}.mdx")).collect::<Vec<_>>();
    assert!(store.open_vault(&vault, &all).is_err());
    assert_eq!(fds(&f.0), 1);
    let docs = store.open_vault(&vault, &all[..16]).unwrap();
    assert!(open(&mut store, &vault, &["16.mdx"]).is_err());
    store
        .save(&docs[0].id, &docs[0].revision, "released byte budget")
        .unwrap();
    assert_eq!(open(&mut store, &vault, &["16.mdx"]).unwrap().len(), 1);
}

// Catches overwriting external replacements or trusting old inventory data as CAS.
#[test]
fn external_replacement_conflicts_and_explicit_reopen_refreshes_baseline() {
    let f = Fixture::new();
    let path = f.file("note.mdx", "initial");
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let doc = open(&mut store, &vault, &["note.mdx"]).unwrap().remove(0);
    let replacement = f.file("replacement.mdx", "external");
    fs::rename(replacement, &path).unwrap();
    assert!(matches!(
        store.save(&doc.id, &doc.revision, "unsafe"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"external");
    let reopened = store.reopen(&doc.id, &doc.revision).unwrap();
    assert_ne!(reopened.revision, doc.revision);
    store
        .save(&reopened.id, &reopened.revision, "explicit baseline")
        .unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"explicit baseline");
}
