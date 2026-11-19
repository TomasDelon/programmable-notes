#![cfg(target_os = "linux")]
use native_documents::snapshots::{Input, Recovery};
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("pn-snapshot-{name}-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn store(&self) -> Recovery {
        Recovery::open(&self.0.join("recovery")).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn input(source: &str, parent: Option<String>) -> Input {
    Input {
        document_id: "a".repeat(32),
        name: "note.mdx".into(),
        baseline: None,
        parent,
        source: source.into(),
    }
}

#[test]
fn versions_survive_restart_and_stale_writers_cannot_replace_them() {
    let f = Fixture::new("versions");
    let first = f
        .store()
        .append(input("\u{feff}# First\r\nCafé\r\n", None))
        .unwrap();
    assert!(first.durable);
    let second = f
        .store()
        .append(input("# Second\n", Some(first.snapshot.id.clone())))
        .unwrap();
    assert_eq!(second.snapshot.metadata.generation, 2);
    assert!(f
        .store()
        .append(input("stale", Some(first.snapshot.id.clone())))
        .is_err());
    let store = f.store();
    let inventory = store.list().unwrap();
    assert!(inventory.errors.is_empty());
    assert_eq!(inventory.snapshots.len(), 2);
    assert_eq!(
        store.restore(&first.snapshot.file).unwrap(),
        "\u{feff}# First\r\nCafé\r\n"
    );
    assert_eq!(store.restore(&second.snapshot.file).unwrap(), "# Second\n");
}

#[test]
fn corrupt_head_is_reported_while_older_source_remains_recoverable() {
    let f = Fixture::new("corrupt");
    let first = f.store().append(input("original", None)).unwrap();
    let second = f
        .store()
        .append(input("newer", Some(first.snapshot.id.clone())))
        .unwrap();
    let path = f.0.join("recovery").join(&second.snapshot.file);
    let mut bytes = fs::read(&path).unwrap();
    *bytes.last_mut().unwrap() ^= 1;
    fs::write(&path, bytes).unwrap();
    let mut store = f.store();
    let inventory = store.list().unwrap();
    assert_eq!(inventory.errors.len(), 1);
    assert_eq!(store.restore(&first.snapshot.file).unwrap(), "original");
    assert!(store.restore(&second.snapshot.file).is_err());
    assert!(store
        .append(input("must not hide corruption", Some(first.snapshot.id)))
        .is_err());
}

#[test]
fn retention_is_bounded_and_latest_versions_are_exact() {
    let f = Fixture::new("retention");
    let mut parent = None;
    for n in 1..=12 {
        let written = f
            .store()
            .append(input(&format!("version {n}"), parent))
            .unwrap();
        assert!(written.durable);
        assert!(written.warning.is_none());
        parent = Some(written.snapshot.id);
    }
    let store = f.store();
    let inventory = store.list().unwrap();
    assert_eq!(
        inventory.snapshots.len(),
        native_documents::snapshots::MAX_VERSIONS
    );
    assert_eq!(
        inventory
            .snapshots
            .iter()
            .map(|s| s.metadata.generation)
            .collect::<Vec<_>>(),
        vec![12, 11, 10, 9, 8]
    );
    for s in inventory.snapshots {
        assert_eq!(
            store.restore(&s.file).unwrap(),
            format!("version {}", s.metadata.generation)
        );
    }
}

#[test]
fn cooperating_processes_are_locked_and_traversal_is_refused() {
    let f = Fixture::new("lock");
    let mut store = f.store();
    assert!(Recovery::open(&f.0.join("recovery")).is_err());
    assert!(store.restore("../original.mdx").is_err());
    assert!(store.remove("../original.mdx").is_err());
    let mut traversal = input("bad", None);
    traversal.name = "../note.mdx".into();
    assert!(store.append(traversal).is_err());
}

#[test]
fn interrupted_temporary_write_is_cleaned_without_touching_valid_snapshots() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("interrupted");
    let first = f.store().append(input("safe", None)).unwrap();
    let pending =
        f.0.join("recovery")
            .join(format!(".pending-{}", "b".repeat(32)));
    fs::write(&pending, b"truncated record").unwrap();
    fs::set_permissions(&pending, fs::Permissions::from_mode(0o600)).unwrap();
    let store = f.store();
    assert!(!pending.exists());
    assert_eq!(store.restore(&first.snapshot.file).unwrap(), "safe");
}

#[test]
fn symlinks_hardlinks_and_public_records_fail_closed() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let f = Fixture::new("links");
    let first = f.store().append(input("safe", None)).unwrap();
    let path = f.0.join("recovery").join(&first.snapshot.file);
    let alias = f.0.join("alias");
    fs::hard_link(&path, &alias).unwrap();
    assert!(f.store().restore(&first.snapshot.file).is_err());
    fs::remove_file(&alias).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(f.store().restore(&first.snapshot.file).is_err());
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    fs::rename(&path, &alias).unwrap();
    symlink(&alias, &path).unwrap();
    assert!(f.store().restore(&first.snapshot.file).is_err());
    assert!(f.store().remove(&first.snapshot.file).is_err());
    assert_eq!(fs::read(&alias).unwrap().last(), Some(&b'e'));
}

#[test]
fn full_quota_retains_every_previous_record() {
    let f = Fixture::new("quota");
    let mut stored = Vec::new();
    for n in 0..64 {
        let mut entry = input(&"x".repeat(500_000), None);
        entry.document_id = format!("{n:032x}");
        match f.store().append(entry) {
            Ok(w) => stored.push(w.snapshot),
            Err(e) => {
                assert!(e.contains("full"));
                break;
            }
        }
    }
    assert!(stored.len() >= 16 && stored.len() < 64);
    let store = f.store();
    assert_eq!(store.list().unwrap().snapshots.len(), stored.len());
    for snapshot in stored {
        assert_eq!(store.restore(&snapshot.file).unwrap().len(), 500_000);
    }
}

#[test]
fn migration_keeps_legacy_bytes_and_is_idempotent() {
    let f = Fixture::new("migration");
    native_documents::draft::recovery_draft(
        &f.0.join("recovery"),
        "keep",
        Some("\u{feff}# Legacy\r\n"),
    )
    .unwrap();
    let mut store = f.store();
    let first = store.migrate_legacy().unwrap().unwrap();
    let second = store.migrate_legacy().unwrap().unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(store.list().unwrap().snapshots.len(), 1);
    assert_eq!(store.restore(&first.file).unwrap(), "\u{feff}# Legacy\r\n");
    assert_eq!(
        fs::read_to_string(f.0.join("recovery/recovered.mdx")).unwrap(),
        "\u{feff}# Legacy\r\n"
    );
}

#[test]
fn failed_write_does_not_remove_prior_version_or_leave_pending_data() {
    let f = Fixture::new("write-failure");
    let prior = f
        .store()
        .append(input("last durable version", None))
        .unwrap();
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "write_failure_child", "--nocapture"])
        .env("PN_RECOVERY_FAILURE_ROOT", f.0.join("recovery"))
        .env("PN_RECOVERY_FAILURE_PARENT", &prior.snapshot.id)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let store = f.store();
    assert_eq!(store.list().unwrap().snapshots.len(), 1);
    assert_eq!(
        store.restore(&prior.snapshot.file).unwrap(),
        "last durable version"
    );
    assert!(fs::read_dir(f.0.join("recovery")).unwrap().all(|e| !e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".pending-")));
}

#[test]
fn write_failure_child() {
    let Some(path) = std::env::var_os("PN_RECOVERY_FAILURE_ROOT") else {
        return;
    };
    let mut store = Recovery::open(std::path::Path::new(&path)).unwrap();
    let limit = libc::rlimit {
        rlim_cur: 1,
        rlim_max: 1,
    };
    unsafe {
        libc::signal(libc::SIGXFSZ, libc::SIG_IGN);
        assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &limit), 0);
    }
    assert!(store
        .append(input(
            "new write must fail",
            Some(std::env::var("PN_RECOVERY_FAILURE_PARENT").unwrap())
        ))
        .is_err());
}

#[test]
fn concurrent_writers_never_create_two_heads() {
    use std::sync::Barrier;
    let f = Fixture::new("writers");
    let barrier = Barrier::new(2);
    let path = f.0.join("recovery");
    let results = std::thread::scope(|scope| {
        let attempt = |text: &str| {
            barrier.wait();
            Recovery::open(&path).and_then(|mut s| s.append(input(text, None)))
        };
        let a = scope.spawn(move || attempt("first"));
        let b = scope.spawn(move || attempt("second"));
        [a.join().unwrap().is_ok(), b.join().unwrap().is_ok()]
    });
    assert_eq!(results.into_iter().filter(|ok| *ok).count(), 1);
    assert_eq!(f.store().list().unwrap().snapshots.len(), 1);
}

/// Run only on a dedicated small disposable tmpfs, never a user's filesystem.
#[test]
#[ignore = "requires PN_RECOVERY_SMALL_FS on a disposable small tmpfs"]
fn real_enospc_preserves_previous_snapshot() {
    use std::io::Write;
    let root =
        PathBuf::from(std::env::var_os("PN_RECOVERY_SMALL_FS").expect("Dedicated tmpfs required"));
    let directory = root.join(format!("snapshot-enospc-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    let mut store = Recovery::open(&directory.join("recovery")).unwrap();
    let prior = store.append(input("durable before ENOSPC", None)).unwrap();
    let filler_path = directory.join("synthetic-filler");
    let mut filler = fs::File::create(&filler_path).unwrap();
    let failure = loop {
        if let Err(error) = filler.write_all(&[1u8; 4096]) {
            break error;
        }
    };
    assert_eq!(failure.raw_os_error(), Some(libc::ENOSPC));
    let failure = store
        .append(input(
            &"new recovery bytes".repeat(2000),
            Some(prior.snapshot.id.clone()),
        ))
        .unwrap_err();
    assert!(failure.contains("os error 28"), "{failure}");
    drop(filler);
    fs::remove_file(filler_path).unwrap();
    assert_eq!(
        store.restore(&prior.snapshot.file).unwrap(),
        "durable before ENOSPC"
    );
    assert_eq!(store.list().unwrap().snapshots.len(), 1);
    drop(store);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn legacy_interrupted_temp_does_not_block_migration() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("legacy-temp");
    native_documents::draft::recovery_draft(&f.0.join("recovery"), "keep", Some("legacy safe"))
        .unwrap();
    let temp =
        f.0.join("recovery")
            .join(format!(".pn-save-{}", "c".repeat(32)));
    fs::write(&temp, b"interrupted legacy write").unwrap();
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o600)).unwrap();
    let migrated = f.store().migrate_legacy().unwrap().unwrap();
    assert_eq!(f.store().restore(&migrated.file).unwrap(), "legacy safe");
    assert!(!temp.exists());
}

#[test]
fn repeated_interrupted_retention_is_reconciled_before_new_writes() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("retention-crash");
    let mut parent = None;
    let mut old = Vec::new();
    for n in 1..=5 {
        let written = f.store().append(input(&format!("A {n}"), parent)).unwrap();
        old.push((
            written.snapshot.file.clone(),
            fs::read(f.0.join("recovery").join(&written.snapshot.file)).unwrap(),
        ));
        parent = Some(written.snapshot.id);
    }
    for n in 0..59 {
        let mut other = input("other document", None);
        other.document_id = format!("{n:032x}");
        f.store().append(other).unwrap();
    }
    let sixth = f.store().append(input("A 6", parent)).unwrap();
    let restore_old = |index: usize| {
        let path = f.0.join("recovery").join(&old[index].0);
        fs::write(&path, &old[index].1).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).unwrap();
    };
    // Reconstruct a process death after durable publish, before retention unlink.
    restore_old(0);
    assert_eq!(f.store().list().unwrap().snapshots.len(), 64);
    f.store()
        .append(input("A 7", Some(sixth.snapshot.id)))
        .unwrap();
    restore_old(0);
    restore_old(1);
    let inventory = f.store().list().unwrap();
    assert!(inventory.errors.is_empty());
    assert_eq!(inventory.snapshots.len(), 64);
    assert_eq!(
        inventory
            .snapshots
            .iter()
            .find(|s| s.metadata.document_id == "a".repeat(32))
            .unwrap()
            .metadata
            .generation,
        7
    );
}

#[test]
fn inventory_uses_real_file_lengths_for_one_record_crash_headroom() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("byte-headroom");
    for n in 0..17 {
        let mut entry = input(
            &"x".repeat((native_documents::snapshots::MAX_BYTES - 15_000) / 17),
            None,
        );
        entry.document_id = format!("{n:032x}");
        f.store().append(entry).unwrap();
    }
    let other = Fixture::new("byte-headroom-extra");
    let extra = other
        .store()
        .append(input(&"z".repeat(500_000), None))
        .unwrap();
    let destination = f.0.join("recovery").join(&extra.snapshot.file);
    fs::copy(
        other.0.join("recovery").join(&extra.snapshot.file),
        &destination,
    )
    .unwrap();
    fs::set_permissions(destination, fs::Permissions::from_mode(0o600)).unwrap();
    let inventory = f.store().list().unwrap();
    assert!(inventory.errors.is_empty());
    assert!(!inventory.capacity_exceeded);
    assert_eq!(inventory.snapshots.len(), 18);
    assert_eq!(
        f.store().restore(&extra.snapshot.file).unwrap().len(),
        500_000
    );
}

#[test]
fn finished_writer_unlocks_even_while_a_forked_child_retains_descriptors() {
    let f = Fixture::new("inherited-lock");
    let mut store = f.store();
    let prior = store.append(input("durable before fork", None)).unwrap();
    let mut pipe = [0; 2];
    assert_eq!(
        unsafe { libc::pipe2(pipe.as_mut_ptr(), libc::O_CLOEXEC) },
        0
    );
    let pid = unsafe { libc::fork() };
    assert!(pid >= 0);
    if pid == 0 {
        // Only async-signal-safe calls are permitted after fork in this
        // multithreaded test process. No Rust allocation or destructor runs.
        unsafe {
            libc::close(pipe[1]);
            let mut byte = 0u8;
            libc::read(pipe[0], (&mut byte as *mut u8).cast(), 1);
            libc::_exit(0);
        }
    }
    unsafe {
        libc::close(pipe[0]);
    }
    drop(store);
    let reopened = Recovery::open(&f.0.join("recovery"));
    unsafe {
        let byte = 1u8;
        libc::write(pipe[1], (&byte as *const u8).cast(), 1);
        libc::close(pipe[1]);
    }
    let mut status = 0;
    loop {
        let result = unsafe { libc::waitpid(pid, &mut status, 0) };
        if result == pid {
            break;
        }
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::EINTR)
        );
    }
    assert!(libc::WIFEXITED(status));
    assert_eq!(libc::WEXITSTATUS(status), 0);
    let reopened = reopened
        .expect("A finished writer must release its lock before an inherited descriptor closes");
    assert_eq!(
        reopened.restore(&prior.snapshot.file).unwrap(),
        "durable before fork"
    );
}

#[test]
fn mixed_case_snapshot_names_round_trip_without_allowing_other_formats() {
    let f = Fixture::new("mixed-case-names");
    let mut value = input("\u{feff}# Exact café 😀\r\n", None);
    value.name = "Note.MdX".into();
    let written = f.store().append(value).unwrap();
    assert_eq!(written.snapshot.metadata.name, "Note.MdX");
    let mut store = f.store();
    let inventory = store.list().unwrap();
    assert!(inventory.errors.is_empty());
    assert_eq!(inventory.snapshots[0].metadata.name, "Note.MdX");
    assert_eq!(
        store.restore(&written.snapshot.file).unwrap(),
        "\u{feff}# Exact café 😀\r\n"
    );
    let mut invalid = input("not an executable source", None);
    invalid.document_id = "b".repeat(32);
    invalid.name = "blocked.EXE".into();
    assert!(store.append(invalid).is_err());
    assert_eq!(store.list().unwrap().snapshots.len(), 1);
}
