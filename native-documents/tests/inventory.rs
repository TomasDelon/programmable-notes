#![cfg(target_os = "linux")]
use native_documents::{Store, Vault, MAX_DOCUMENTS};
use std::{
    fs,
    os::unix::{
        ffi::OsStringExt,
        fs::{symlink, PermissionsExt},
    },
    path::{Path, PathBuf},
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut id = [0; 16];
        getrandom::fill(&mut id).unwrap();
        let root = PathBuf::from("/tmp").join(format!(
            "pn-inventory-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn file(&self, relative: &str, bytes: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(relative);
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

// Catches inventory accidentally reusing bounded eager source collection.
#[test]
fn inventory_lists_one_hundred_notes_without_consuming_document_capacity() {
    let f = Fixture::new();
    for index in 0..100 {
        f.file(&format!("notes/{index:03}.mdx"), "\u{feff}Écriture\r\n");
    }
    let vault = Vault::select_authorized(&f.0).unwrap();
    let entries = vault.inventory().unwrap();
    assert_eq!(entries.len(), 100);
    assert_eq!(entries[0].logical_path, "notes/000.mdx");
    assert_eq!(entries[99].logical_path, "notes/099.mdx");
    assert!(entries.iter().all(|entry| entry.bytes == 14));
    assert_eq!(fds(&f.0), 1, "Only the vault root capability remains open");
    let mut store = Store::default();
    let paths = (0..MAX_DOCUMENTS)
        .map(|index| f.0.join(format!("notes/{index:03}.mdx")))
        .collect::<Vec<_>>();
    let docs = store.open(&paths).unwrap();
    assert_eq!(docs.len(), 32);
    assert!(store.open(&[f.0.join("notes/099.mdx")]).is_err());
    assert!(Store::default().open_folder(&f.0).is_err());
}

// Catches payload decoding/reads and size budgets leaking into metadata inventory.
#[test]
fn inventory_lists_unreadable_invalid_and_large_sources_without_reading_payloads() {
    assert_ne!(
        unsafe { libc::geteuid() },
        0,
        "Run permission evidence unprivileged"
    );
    let f = Fixture::new();
    let unreadable = f.file("a-unreadable.mdx", "private");
    fs::set_permissions(&unreadable, fs::Permissions::from_mode(0)).unwrap();
    let invalid = f.file("b-invalid.MD", [0xff, 0xfe]);
    let big = f.file("c-big.tsx", []);
    fs::File::options()
        .write(true)
        .open(&big)
        .unwrap()
        .set_len(9 * 1024 * 1024)
        .unwrap();
    let entries = Vault::select_authorized(&f.0).unwrap().inventory().unwrap();
    assert_eq!(
        entries
            .iter()
            .map(|entry| (entry.logical_path.as_str(), entry.bytes))
            .collect::<Vec<_>>(),
        [
            ("a-unreadable.mdx", 7),
            ("b-invalid.MD", 2),
            ("c-big.tsx", 9 * 1024 * 1024),
        ]
    );
    for path in [unreadable, invalid, big] {
        assert!(Store::default().open(&[path]).is_err());
    }
}

// Catches folding paths, adding formats or traversing excluded content.
#[test]
fn inventory_preserves_all_format_cases_and_skips_only_real_excluded_directories() {
    let f = Fixture::new();
    for name in ["a.MdX", "b.mD", "c.TsX", "d.TS", "e.JsX", "f.JS"] {
        f.file(name, "x");
    }
    f.file("normal/.git.mdx", "x");
    f.file("README.txt", "ignored");
    for excluded in [".git", "node_modules", ".programmable-notes"] {
        f.file(&format!("{excluded}/invalid.mdx"), [0xff]);
    }
    let paths = Vault::select_authorized(&f.0)
        .unwrap()
        .inventory()
        .unwrap()
        .into_iter()
        .map(|entry| entry.logical_path)
        .collect::<Vec<_>>();
    assert_eq!(
        paths,
        [
            "a.MdX",
            "b.mD",
            "c.TsX",
            "d.TS",
            "e.JsX",
            "f.JS",
            "normal/.git.mdx"
        ]
    );
}

// Catches root pathname reuse instead of using the authorized descriptor.
#[test]
fn inventory_root_capability_survives_rename_and_path_replacement() {
    let f = Fixture::new();
    f.file("selected/nested/authorized.mdx", "original");
    let vault = Vault::select_authorized(&f.0.join("selected")).unwrap();
    fs::rename(f.0.join("selected"), f.0.join("retained")).unwrap();
    f.file("selected/replacement.mdx", "replacement");
    let entries = vault.inventory().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].logical_path, "nested/authorized.mdx");
    assert_eq!(entries[0].bytes, 8);
    assert_eq!(fds(&f.0), 1);
    drop(vault);
    assert_eq!(fds(&f.0), 0);
}

// Catches a retained capability being reopened through its former root or ancestor.
#[test]
fn inventory_survives_symlink_root_replacement_and_ancestor_replacement() {
    let f = Fixture::new();
    let outside = Fixture::new();
    outside.file("unrelated.mdx", "outside");
    f.file("ancestor/selected/authorized.mdx", "authorized");
    let vault = Vault::select_authorized(&f.0.join("ancestor/selected")).unwrap();
    fs::rename(f.0.join("ancestor/selected"), f.0.join("ancestor/moved")).unwrap();
    symlink(&outside.0, f.0.join("ancestor/selected")).unwrap();
    let entries = vault.inventory().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].logical_path, "authorized.mdx");
    fs::rename(f.0.join("ancestor"), f.0.join("retained-ancestor")).unwrap();
    f.file("ancestor/moved/replacement.mdx", "replacement");
    let entries = vault.inventory().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].logical_path, "authorized.mdx");
    assert_eq!(fds(&f.0), 1);
    assert_eq!(fds(&outside.0), 0);
    drop(vault);
    assert_eq!(fds(&f.0), 0);
}

// Catches no-follow checks applied only to the final selected component.
#[test]
fn inventory_rejects_symlink_roots_ancestors_entries_and_special_files() {
    let f = Fixture::new();
    let outside = Fixture::new();
    outside.file("child/secret.mdx", "outside");
    symlink(&outside.0, f.0.join("alias")).unwrap();
    assert!(Vault::select_authorized(&f.0.join("alias")).is_err());
    assert!(Vault::select_authorized(&f.0.join("alias/child")).is_err());
    assert_eq!(fds(&f.0), 0, "Failed selection must release ancestor fds");
    assert_eq!(fds(&outside.0), 0, "No outside authority may remain");
    let vault = Vault::select_authorized(&f.0).unwrap();
    assert!(vault.inventory().is_err());
    fs::remove_file(f.0.join("alias")).unwrap();
    for name in [
        "alias.txt",
        "alias.mdx",
        ".git",
        "node_modules",
        ".programmable-notes",
    ] {
        symlink(&outside.0, f.0.join(name)).unwrap();
        assert!(
            vault.inventory().is_err(),
            "Symlink {name} must not be skipped"
        );
        fs::remove_file(f.0.join(name)).unwrap();
    }
    let fifo = std::ffi::CString::new(f.0.join("pipe.txt").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    assert!(vault.inventory().is_err());
    assert_eq!(
        fs::read(outside.0.join("child/secret.mdx")).unwrap(),
        b"outside"
    );
}

// Catches normalization granting authority and lossy source path serialization.
#[test]
fn inventory_rejects_relative_traversal_and_non_utf8_source_paths() {
    let f = Fixture::new();
    f.file("inner/note.mdx", "safe");
    for root in [
        PathBuf::from("relative"),
        f.0.join("inner/.."),
        f.0.join("inner/."),
    ] {
        assert!(Vault::select_authorized(&root).is_err());
    }
    fs::write(
        f.0.join(std::ffi::OsString::from_vec(b"invalid-\xff.mdx".to_vec())),
        "x",
    )
    .unwrap();
    assert!(Vault::select_authorized(&f.0).unwrap().inventory().is_err());
}

// Catches temporary descriptor leaks on both successful and failing scans.
#[test]
fn inventory_repeated_scans_release_every_temporary_descriptor() {
    let f = Fixture::new();
    f.file("nested/note.mdx", "source");
    let vault = Vault::select_authorized(&f.0).unwrap();
    for _ in 0..32 {
        assert_eq!(vault.inventory().unwrap().len(), 1);
    }
    symlink(f.0.join("nested"), f.0.join("z-link")).unwrap();
    for _ in 0..32 {
        assert!(vault.inventory().is_err());
    }
    assert_eq!(fds(&f.0), 1);
    drop(vault);
    assert_eq!(fds(&f.0), 0);
}

// Catches traversal budgets removed while separating loaded-source budgets.
#[test]
fn inventory_preserves_entry_and_depth_bounds_and_empty_folder_behavior() {
    let f = Fixture::new();
    let vault = Vault::select_authorized(&f.0).unwrap();
    assert!(vault.inventory().unwrap().is_empty());
    for index in 0..4096 {
        f.file(&format!("{index:04}.txt"), "");
    }
    assert!(vault.inventory().unwrap().is_empty());
    f.file("4096.txt", "");
    assert!(vault.inventory().is_err());
    let deep = Fixture::new();
    deep.file(&format!("{}note.mdx", "d/".repeat(16)), "x");
    let vault = Vault::select_authorized(&deep.0).unwrap();
    assert_eq!(vault.inventory().unwrap().len(), 1);
    deep.file(&format!("{}note.mdx", "d/".repeat(17)), "x");
    assert!(vault.inventory().is_err());
}

// Catches payload opens even under root, where chmod000 is not a read barrier.
#[test]
fn inventory_does_not_open_or_access_source_payload_inodes() {
    use std::{
        io::{ErrorKind, Read},
        os::fd::FromRawFd,
    };
    let f = Fixture::new();
    let path = f.file("note.mdx", "must remain unopened");
    let fd = unsafe { libc::inotify_init1(libc::IN_NONBLOCK | libc::IN_CLOEXEC) };
    assert!(
        fd >= 0,
        "inotify required: {}",
        std::io::Error::last_os_error()
    );
    let mut events = unsafe { fs::File::from_raw_fd(fd) };
    let name = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
    assert!(
        unsafe { libc::inotify_add_watch(fd, name.as_ptr(), libc::IN_OPEN | libc::IN_ACCESS) } >= 0
    );
    let mut buffer = [0; 4096];
    while events.read(&mut buffer).is_ok() {}
    assert_eq!(
        Vault::select_authorized(&f.0)
            .unwrap()
            .inventory()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        events.read(&mut buffer).unwrap_err().kind(),
        ErrorKind::WouldBlock,
        "Inventory must only use O_PATH/fstat on note inodes"
    );
    assert_eq!(fs::read(&path).unwrap(), b"must remain unopened");
    assert!(
        events.read(&mut buffer).unwrap() > 0,
        "Positive control must detect real payload reads"
    );
}

// Catches loss of descriptor-relative long-path protection without PATH_MAX errors.
#[test]
fn inventory_rejects_relative_paths_beyond_4096_bytes() {
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
    let name = std::ffi::CString::new("too-long.mdx").unwrap();
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_CLOEXEC,
            0o600,
        )
    };
    assert!(fd >= 0);
    drop(unsafe { fs::File::from_raw_fd(fd) });
    assert!(Vault::select_authorized(&f.0)
        .unwrap()
        .inventory()
        .unwrap_err()
        .to_string()
        .contains("4096 byte"));
}
