#![cfg(target_os = "linux")]
use native_documents::{Error, Store, Vault, MAX_DOCUMENTS};
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
            "pn-vault-directory-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
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
        let path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
        assert!(unsafe { libc::inotify_add_watch(fd, path.as_ptr(), mask) } >= 0);
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

#[test]
fn creates_real_exact_private_directories_with_existing_parents_only() {
    let f = Fixture::new();
    let vault = Vault::select_authorized(&f.0).unwrap();
    for path in [
        "Notes",
        "Notes/Étude 😀.md",
        "node_modules_extra",
        ".gitignore",
    ] {
        let created = vault.create_directory(path).unwrap();
        assert_eq!(created.logical_path, path);
        assert!(!created.durability_warning);
        let directory = f.0.join(path);
        let metadata = fs::symlink_metadata(&directory).unwrap();
        assert!(metadata.is_dir());
        assert_eq!(metadata.permissions().mode() & 0o777, 0o700);
        assert!(fs::read_dir(directory).unwrap().next().is_none());
    }
    assert!(vault.create_directory("missing/child").is_err());
    assert!(!f.0.join("missing").exists());
    drop(vault);
    assert!(f.0.join("Notes/Étude 😀.md").is_dir());
    assert_eq!(fds(&f.0), 0);
}

#[test]
fn every_existing_target_conflicts_without_opening_existing_payloads() {
    let f = Fixture::new();
    let outside = Fixture::new();
    fs::write(f.0.join("file"), b"\xef\xbb\xbfexact\r\nopaque\0bytes").unwrap();
    fs::write(outside.0.join("payload"), b"outside unchanged").unwrap();
    fs::create_dir(f.0.join("directory")).unwrap();
    symlink(outside.0.join("payload"), f.0.join("link")).unwrap();
    symlink(outside.0.join("missing"), f.0.join("broken")).unwrap();
    let fifo = std::ffi::CString::new(f.0.join("fifo").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut file_watch = Watch::new(&f.0.join("file"), libc::IN_OPEN | libc::IN_ACCESS);
    let mut outside_watch = Watch::new(&outside.0.join("payload"), libc::IN_OPEN | libc::IN_ACCESS);
    let mut directory_watch = Watch::new(&f.0.join("directory"), libc::IN_OPEN | libc::IN_ACCESS);
    file_watch.empty();
    outside_watch.empty();
    directory_watch.empty();
    for path in ["file", "directory", "link", "broken", "fifo"] {
        assert!(matches!(vault.create_directory(path), Err(Error::Conflict)));
    }
    file_watch.empty();
    outside_watch.empty();
    directory_watch.empty();
    assert_eq!(
        fs::read(f.0.join("file")).unwrap(),
        b"\xef\xbb\xbfexact\r\nopaque\0bytes"
    );
    assert_eq!(
        fs::read(outside.0.join("payload")).unwrap(),
        b"outside unchanged"
    );
    file_watch.observed(); // Positive controls for the no-open/access witnesses.
    outside_watch.observed();
    fs::read_dir(f.0.join("directory")).unwrap();
    directory_watch.observed();
    assert_eq!(fds(&f.0), 1);
}

#[test]
fn invalid_relative_paths_reject_before_any_directory_open_or_creation() {
    let f = Fixture::new();
    fs::create_dir(f.0.join("existing")).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut watch = Watch::new(&f.0, libc::IN_OPEN | libc::IN_CREATE);
    watch.empty();
    let mut paths: Vec<String> = [
        "",
        "/absolute",
        ".",
        "..",
        "existing/../escape",
        "existing/./child",
        "existing//child",
        "existing/",
        "bad\\name",
        "bad\0name",
        ".git",
        "node_modules",
        ".programmable-notes",
        "existing/.git/child",
        "node_modules/child",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    paths.extend([
        "x".repeat(4097),
        "é".repeat(2049),
        (0..17).map(|_| "d").collect::<Vec<_>>().join("/"),
    ]);
    for path in paths {
        assert!(
            matches!(vault.create_directory(&path), Err(Error::Rejected(_))),
            "{path:?}"
        );
        watch.empty();
    }
    assert_eq!(fds(&f.0), 1);
    assert!(fs::read_dir(f.0.join("existing")).unwrap().next().is_none());
}

#[test]
fn special_and_symlink_parents_cannot_redirect_or_block_creation() {
    let f = Fixture::new();
    let outside = Fixture::new();
    fs::write(f.0.join("file"), b"not a parent").unwrap();
    symlink(&outside.0, f.0.join("link")).unwrap();
    let fifo = std::ffi::CString::new(f.0.join("fifo").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    let vault = Vault::select_authorized(&f.0).unwrap();
    for parent in ["file", "link", "fifo", "missing"] {
        assert!(vault.create_directory(&format!("{parent}/child")).is_err());
    }
    assert!(fs::read_dir(&outside.0).unwrap().next().is_none());
    assert!(!f.0.join("missing").exists());
    assert_eq!(fds(&f.0), 1);
}

#[test]
fn root_and_ancestor_renames_and_symlink_replacements_keep_original_capability() {
    let f = Fixture::new();
    let outside = Fixture::new();
    fs::create_dir_all(f.0.join("ancestor/selected/parent")).unwrap();
    let vault = Vault::select_authorized(&f.0.join("ancestor/selected")).unwrap();
    fs::rename(f.0.join("ancestor/selected"), f.0.join("ancestor/retained")).unwrap();
    symlink(&outside.0, f.0.join("ancestor/selected")).unwrap();
    vault.create_directory("parent/first").unwrap();
    fs::rename(f.0.join("ancestor"), f.0.join("moved")).unwrap();
    fs::create_dir(f.0.join("ancestor")).unwrap();
    symlink(&outside.0, f.0.join("ancestor/selected")).unwrap();
    vault.create_directory("parent/second").unwrap();
    assert!(f.0.join("moved/retained/parent/first").is_dir());
    assert!(f.0.join("moved/retained/parent/second").is_dir());
    assert!(fs::read_dir(&outside.0).unwrap().next().is_none());
    drop(vault);
    assert_eq!(fds(&f.0), 0);
}

#[test]
fn concurrent_creators_have_exactly_one_winner() {
    let f = Fixture::new();
    let vault = Arc::new(Vault::select_authorized(&f.0).unwrap());
    let barrier = Arc::new(Barrier::new(12));
    let workers: Vec<_> = (0..12)
        .map(|_| {
            let vault = vault.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                vault.create_directory("winner")
            })
        })
        .collect();
    let results: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert!(results
        .iter()
        .filter_map(|result| result.as_ref().err())
        .all(|error| matches!(error, Error::Conflict)));
    assert!(f.0.join("winner").is_dir());
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
    assert_eq!(fds(&f.0), 1);
}

#[test]
fn directory_depth_and_source_policy_are_independent_without_consuming_grants() {
    let f = Fixture::new();
    let vault = Vault::select_authorized(&f.0).unwrap();
    let mut store = Store::default();
    let mut documents = Vec::new();
    for index in 0..MAX_DOCUMENTS {
        documents.push(
            store
                .create_vault(&vault, &format!("{index}.mdx"), "exact\r\n")
                .unwrap(),
        );
    }
    let mut path = String::new();
    for index in 0..16 {
        if !path.is_empty() {
            path.push('/');
        }
        path.push_str(&format!("d{index}"));
        vault.create_directory(&path).unwrap();
    }
    assert!(matches!(
        vault.create_directory(&format!("{path}/too-deep")),
        Err(Error::Rejected(_))
    ));
    assert!(!f.0.join(&path).join("too-deep").exists());
    store.close(&documents[0].id).unwrap();
    let document = store
        .create_vault(&vault, &format!("{path}/Note.MdX"), "\u{feff}opaque\r\n")
        .unwrap();
    assert_eq!(document.logical_path, format!("{path}/Note.MdX"));
    assert!(matches!(
        store.create_vault(&vault, "unsupported.txt", "x"),
        Err(Error::Rejected(_))
    ));
    let saved = store
        .save(
            &documents[1].id,
            &documents[1].revision,
            "unchanged authority",
        )
        .unwrap();
    assert_ne!(saved.revision, documents[1].revision);
}

#[test]
fn real_permission_and_mkdir_failures_are_honest_and_leak_no_descriptors() {
    assert_ne!(
        unsafe { libc::geteuid() },
        0,
        "Unprivileged permission evidence required"
    );
    let f = Fixture::new();
    fs::create_dir(f.0.join("locked")).unwrap();
    let vault = Vault::select_authorized(&f.0).unwrap();
    fs::set_permissions(f.0.join("locked"), fs::Permissions::from_mode(0o500)).unwrap();
    for _ in 0..12 {
        assert!(
            matches!(vault.create_directory("locked/denied"), Err(Error::PublicationUncertain(error)) if error.raw_os_error() == Some(libc::EACCES))
        );
    }
    assert!(fs::read_dir(f.0.join("locked")).unwrap().next().is_none());
    fs::set_permissions(f.0.join("locked"), fs::Permissions::from_mode(0o700)).unwrap();
    assert!(
        matches!(vault.create_directory(&"x".repeat(300)), Err(Error::PublicationUncertain(error)) if error.raw_os_error() == Some(libc::ENAMETOOLONG))
    );
    assert_eq!(fds(&f.0), 1);
    vault.create_directory("usable-after-failure").unwrap();
}
