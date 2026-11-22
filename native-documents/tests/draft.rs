#![cfg(target_os = "linux")]

use native_documents::draft::recovery_draft;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
};

#[test]
fn recovery_uses_one_private_copy_and_never_replaces_an_existing_draft() {
    let root = std::env::temp_dir().join(format!("pn-recovery-{}", std::process::id()));
    fs::create_dir(&root).unwrap();
    let directory = root.join("draft");
    let original = root.join("original.mdx");
    fs::write(&original, "original").unwrap();
    let source = "\u{feff}# Draft\r\n\r\nCafé\r\n";
    assert_eq!(recovery_draft(&directory, "restore", None).unwrap(), None);
    recovery_draft(&directory, "keep", Some(source)).unwrap();
    assert_eq!(
        fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert!(recovery_draft(&directory, "keep", Some("replacement")).is_err());
    assert_eq!(
        recovery_draft(&directory, "restore", None)
            .unwrap()
            .as_deref(),
        Some(source)
    );
    recovery_draft(&directory, "delete", None).unwrap();
    symlink(&original, directory.join("recovered.mdx")).unwrap();
    assert!(recovery_draft(&directory, "restore", None).is_err());
    assert!(recovery_draft(&directory, "keep", Some("replacement")).is_err());
    assert_eq!(fs::read_to_string(original).unwrap(), "original");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn concurrent_snapshots_never_replace_the_winner() {
    use std::sync::Barrier;
    let root = std::env::temp_dir().join(format!("pn-draft-race-{}", std::process::id()));
    fs::create_dir(&root).unwrap();
    let directory = root.join("draft");
    let barrier = Barrier::new(2);
    let (first, second) = std::thread::scope(|scope| {
        let attempt = |text| {
            barrier.wait();
            recovery_draft(&directory, "keep", Some(text))
        };
        let first = scope.spawn(move || attempt("first"));
        let second = scope.spawn(move || attempt("second"));
        (first.join().unwrap(), second.join().unwrap())
    });
    let winner = match (first, second) {
        (Ok(_), Err(_)) => "first",
        (Err(_), Ok(_)) => "second",
        _ => panic!("exactly one concurrent snapshot must succeed"),
    };
    assert_eq!(
        recovery_draft(&directory, "restore", None)
            .unwrap()
            .as_deref(),
        Some(winner)
    );
    fs::remove_dir_all(root).unwrap();
}
