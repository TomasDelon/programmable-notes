#![cfg(target_os = "linux")]
use native_documents::{Error, Store, MAX_DOCUMENTS, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES};
use std::{
    fs,
    os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    path::PathBuf,
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut bytes = [0; 16];
        getrandom::fill(&mut bytes).unwrap();
        let path = std::env::temp_dir().join(format!(
            "pn-vault-{}",
            bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, source: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, source).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn folder_retains_selected_root_exact_bytes_case_and_existing_save_authority() {
    let f = Fixture::new();
    let source = "\u{feff}# Écriture\r\n<Widget />\r\n";
    let path = f.file("nested/Note.MDX", source);
    f.file("nested/modules/Widget.TsX", "export default () => null\n");
    f.file("README.txt", "not source");
    for excluded in [".git", "node_modules", ".programmable-notes"] {
        f.file(&format!("{excluded}/ignored.mdx"), [0xff]);
    }
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let inode = fs::metadata(&path).unwrap().ino();
    let mut store = Store::default();
    let docs = store.open_folder(&f.0).unwrap();
    assert_eq!(
        docs.iter()
            .map(|d| d.logical_path.as_str())
            .collect::<Vec<_>>(),
        ["nested/Note.MDX", "nested/modules/Widget.TsX"]
    );
    let doc = &docs[0];
    assert_eq!(doc.source, source);
    assert_eq!(doc.name, "Note.MDX");
    let saved = store.save(&doc.id, &doc.revision, "changed\r\n").unwrap();
    assert!(saved.durable);
    assert_ne!(saved.revision, doc.revision);
    assert_ne!(fs::metadata(&path).unwrap().ino(), inode);
    assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o640);
    assert_eq!(fs::read(&path).unwrap(), b"changed\r\n");
    assert!(matches!(
        store.save(&doc.id, &doc.revision, "stale"),
        Err(Error::StaleRevision)
    ));
    fs::write(&path, "external").unwrap();
    assert!(matches!(
        store.save(&doc.id, &saved.revision, "overwrite"),
        Err(Error::Conflict)
    ));
    assert_eq!(
        store.reopen(&doc.id, &saved.revision).unwrap().source,
        "external"
    );
}
#[test]
fn failed_folder_selection_does_not_publish_partial_grants_or_replace_existing() {
    let original = Fixture::new();
    let p = original.file("existing.mdx", "existing");
    let bad = Fixture::new();
    bad.file("a.mdx", "safe");
    bad.file("z.mdx", [0xff]);
    let mut store = Store::default();
    let doc = store.open(&[p]).unwrap().remove(0);
    assert!(store.open_folder(&bad.0).is_err());
    for i in 0..MAX_DOCUMENTS - 1 {
        original.file(&format!("more/{i}.mdx"), "ok");
    }
    let more = store.open_folder(&original.0.join("more")).unwrap();
    assert_eq!(more.len(), MAX_DOCUMENTS - 1);
    assert!(store
        .save(&doc.id, &doc.revision, "still authorized")
        .is_ok());
    assert!(store.open_folder(&original.0.join("more")).is_err());
}
#[test]
fn folder_rejects_symlinks_at_root_ancestor_file_and_directory_and_special_files() {
    let f = Fixture::new();
    let outside = Fixture::new();
    outside.file("secret.mdx", "secret");
    let root_link = f.0.join("link");
    symlink(&outside.0, &root_link).unwrap();
    assert!(Store::default().open_folder(&root_link).is_err());
    assert!(Store::default()
        .open_folder(&root_link.join("child"))
        .is_err());
    assert!(Store::default().open_folder(&f.0).is_err());
    fs::remove_file(&root_link).unwrap();
    symlink(outside.0.join("secret.mdx"), f.0.join("alias.txt")).unwrap();
    assert!(Store::default().open_folder(&f.0).is_err());
    fs::remove_file(f.0.join("alias.txt")).unwrap();
    let fifo = std::ffi::CString::new(f.0.join("pipe.txt").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    assert!(Store::default().open_folder(&f.0).is_err());
    assert_eq!(fs::read(outside.0.join("secret.mdx")).unwrap(), b"secret");
}
#[test]
fn folder_grants_stay_anchored_when_root_or_nested_parent_is_replaced() {
    let f = Fixture::new();
    let selected = f.0.join("selected");
    f.file("selected/nested/note.mdx", "authorized");
    let mut store = Store::default();
    let doc = store.open_folder(&selected).unwrap().remove(0);
    fs::rename(&selected, f.0.join("moved")).unwrap();
    f.file("selected/nested/note.mdx", "replacement");
    fs::rename(f.0.join("moved/nested"), f.0.join("moved/retained")).unwrap();
    f.file("moved/nested/note.mdx", "nested replacement");
    store
        .save(&doc.id, &doc.revision, "new authorized bytes")
        .unwrap();
    assert_eq!(
        fs::read(f.0.join("moved/retained/note.mdx")).unwrap(),
        b"new authorized bytes"
    );
    assert_eq!(
        fs::read(f.0.join("selected/nested/note.mdx")).unwrap(),
        b"replacement"
    );
    assert_eq!(
        fs::read(f.0.join("moved/nested/note.mdx")).unwrap(),
        b"nested replacement"
    );
}
#[test]
fn folder_limits_sources_bytes_depth_and_directory_entries() {
    let f = Fixture::new();
    for i in 0..=MAX_DOCUMENTS {
        f.file(&format!("{i}.mdx"), "x");
    }
    assert!(Store::default().open_folder(&f.0).is_err());
    let oversized = Fixture::new();
    oversized.file("big.mdx", vec![b'x'; MAX_SOURCE_BYTES + 1]);
    assert!(Store::default().open_folder(&oversized.0).is_err());
    let total = Fixture::new();
    for i in 0..MAX_TOTAL_BYTES / MAX_SOURCE_BYTES + 1 {
        total.file(&format!("{i}.mdx"), vec![b'x'; MAX_SOURCE_BYTES]);
    }
    assert!(Store::default().open_folder(&total.0).is_err());
    let deep = Fixture::new();
    deep.file(&format!("{}note.mdx", "d/".repeat(17)), "x");
    assert!(Store::default().open_folder(&deep.0).is_err());
    let entries = Fixture::new();
    for i in 0..4097 {
        entries.file(&format!("{i}.txt"), "");
    }
    assert!(Store::default().open_folder(&entries.0).is_err());
}
#[test]
fn folder_rejects_lexical_traversal_and_relative_roots_and_empty_folder_is_clean() {
    let f = Fixture::new();
    f.file("inner/note.mdx", "safe");
    for root in [
        PathBuf::from("relative"),
        f.0.join("inner/.."),
        f.0.join("inner/."),
    ] {
        assert!(Store::default().open_folder(&root).is_err());
    }
    let empty = Fixture::new();
    assert!(Store::default().open_folder(&empty.0).unwrap().is_empty());
}
#[test]
fn folder_failure_and_closed_success_release_all_directory_descriptors() {
    fn owned_fds(root: &std::path::Path) -> usize {
        fs::read_dir("/proc/self/fd")
            .unwrap()
            .filter_map(Result::ok)
            .filter_map(|entry| fs::read_link(entry.path()).ok())
            .filter(|path| path.starts_with(root))
            .count()
    }
    let bad = Fixture::new();
    bad.file("a.mdx", "safe");
    bad.file("z.mdx", [0xff]);
    let mut store = Store::default();
    for _ in 0..64 {
        assert!(store.open_folder(&bad.0).is_err());
    }
    assert_eq!(owned_fds(&bad.0), 0);
    fs::remove_file(bad.0.join("z.mdx")).unwrap();
    let docs = store.open_folder(&bad.0).unwrap();
    assert_eq!(owned_fds(&bad.0), docs.len());
    for doc in docs {
        store.close(&doc.id).unwrap();
    }
    assert_eq!(owned_fds(&bad.0), 0);
}
#[test]
fn folder_loads_all_six_formats_and_preserves_unrelated_store_byte_budget() {
    let f = Fixture::new();
    for extension in ["mdx", "md", "tsx", "ts", "jsx", "js"] {
        f.file(&format!("note.{extension}"), extension);
    }
    assert_eq!(Store::default().open_folder(&f.0).unwrap().len(), 6);
    let old = Fixture::new();
    let mut store = Store::default();
    let paths = (0..16)
        .map(|i| old.file(&format!("{i}.mdx"), vec![b'x'; MAX_SOURCE_BYTES]))
        .collect::<Vec<_>>();
    let original = store.open(&paths).unwrap();
    let more = Fixture::new();
    more.file("more.mdx", vec![b'x'; MAX_SOURCE_BYTES]);
    assert!(store.open_folder(&more.0).is_err());
    assert!(store
        .save(&original[0].id, &original[0].revision, "retained")
        .is_ok());
    assert_eq!(store.open_folder(&more.0).unwrap().len(), 1);
}
#[test]
fn folder_relative_path_bound_is_enforced_with_descriptor_relative_fixture() {
    use std::os::fd::{AsRawFd, FromRawFd};
    let f = Fixture::new();
    let mut parent = fs::File::open(&f.0).unwrap();
    let name = std::ffi::CString::new("x".repeat(255)).unwrap();
    for _ in 0..16 {
        assert_eq!(
            unsafe { libc::mkdirat(parent.as_raw_fd(), name.as_ptr(), 0o700) },
            0
        );
        let fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
            )
        };
        assert!(fd >= 0);
        parent = unsafe { fs::File::from_raw_fd(fd) };
    }
    let file = std::ffi::CString::new("too-long.mdx").unwrap();
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            file.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_CLOEXEC,
            0o600,
        )
    };
    assert!(fd >= 0);
    drop(unsafe { fs::File::from_raw_fd(fd) });
    let error = Store::default().open_folder(&f.0).unwrap_err();
    assert!(error.to_string().contains("4096 byte"), "{error}");
}
#[test]
fn replacement_symlink_cannot_redirect_a_folder_grant_save_or_reopen() {
    let f = Fixture::new();
    let path = f.file("note.mdx", "authorized");
    let outside = Fixture::new();
    let secret = outside.file("secret.mdx", "outside");
    let mut store = Store::default();
    let doc = store.open_folder(&f.0).unwrap().remove(0);
    fs::remove_file(&path).unwrap();
    symlink(&secret, &path).unwrap();
    assert!(matches!(
        store.save(&doc.id, &doc.revision, "bad"),
        Err(Error::Conflict)
    ));
    assert!(store.reopen(&doc.id, &doc.revision).is_err());
    assert_eq!(fs::read(&secret).unwrap(), b"outside");
}
