#![cfg(target_os = "linux")]
//! Real disk-full acceptance on an explicitly supplied disposable small tmpfs.
use native_documents::{Error, Store};
use std::{
    fs::{self, File},
    io::Write,
    os::unix::{
        ffi::OsStrExt,
        fs::{MetadataExt, PermissionsExt},
    },
    path::PathBuf,
};

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn dedicated_tmpfs(mountinfo: &[u8], root: &std::path::Path) -> bool {
    // Kernel mountinfo escapes these four bytes in mount paths.
    let mut encoded = Vec::new();
    for byte in root.as_os_str().as_bytes() {
        match *byte {
            b' ' => encoded.extend_from_slice(b"\\040"),
            b'\t' => encoded.extend_from_slice(b"\\011"),
            b'\n' => encoded.extend_from_slice(b"\\012"),
            b'\\' => encoded.extend_from_slice(b"\\134"),
            value => encoded.push(value),
        }
    }
    let matches: Vec<_> = mountinfo
        .split(|b| *b == b'\n')
        .map(|line| line.split(|b| *b == b' ').collect::<Vec<_>>())
        .filter(|fields| fields.get(4).is_some_and(|value| *value == encoded))
        .collect();
    // Refuse subtree bind mounts and ambiguous stacked mounts before filling.
    matches.len() == 1
        && matches[0].get(3) == Some(&b"/".as_slice())
        && matches[0]
            .iter()
            .position(|field| *field == b"-")
            .is_some_and(|separator| matches[0].get(separator + 1) == Some(&b"tmpfs".as_slice()))
}

#[test]
fn mount_guard_rejects_shared_subtrees_and_ambiguous_mounts() {
    let root = std::path::Path::new("/tmp/pn-test");
    let dedicated = b"42 1 0:41 / /tmp/pn-test rw - tmpfs tmpfs rw,size=2048k\n";
    let subtree = b"43 1 0:41 /subtree /tmp/pn-test rw - tmpfs tmpfs rw,size=2048k\n";
    assert!(dedicated_tmpfs(dedicated, root));
    assert!(!dedicated_tmpfs(subtree, root));
    assert!(!dedicated_tmpfs(
        &[dedicated.as_slice(), subtree.as_slice()].concat(),
        root
    ));
    assert!(!dedicated_tmpfs(b"", root));
    assert!(!dedicated_tmpfs(
        b"42 1 0:41 / /tmp/pn-test rw - ext4 /dev/test rw\n",
        root
    ));
    assert!(dedicated_tmpfs(
        b"42 1 0:41 / /tmp/pn-test\\040space rw - tmpfs tmpfs rw\n",
        std::path::Path::new("/tmp/pn-test space")
    ));
}

#[test]
#[ignore = "requires PN_DOCUMENT_SMALL_FS on a dedicated disposable 2 MB tmpfs"]
fn real_enospc_preserves_original_save_and_grant() {
    let root = PathBuf::from(
        std::env::var_os("PN_DOCUMENT_SMALL_FS")
            .expect("Explicit disposable small tmpfs required; never use personal storage"),
    );
    assert_eq!(root.canonicalize().unwrap(), root);
    let metadata = root.metadata().unwrap();
    assert_eq!(metadata.uid(), unsafe { libc::geteuid() });
    assert_eq!(metadata.mode() & 0o077, 0, "Private mount required");
    assert_ne!(
        metadata.dev(),
        root.parent().unwrap().metadata().unwrap().dev(),
        "Pass the dedicated mountpoint itself"
    );
    assert_eq!(
        fs::read_dir(&root).unwrap().count(),
        0,
        "Dedicated mount must be empty"
    );
    let path = std::ffi::CString::new(root.as_os_str().as_bytes()).unwrap();
    let mut info: libc::statfs = unsafe { std::mem::zeroed() };
    assert_eq!(unsafe { libc::statfs(path.as_ptr(), &mut info) }, 0);
    assert_eq!(info.f_type, libc::TMPFS_MAGIC, "Dedicated tmpfs required");
    let capacity = info.f_blocks * info.f_bsize as u64;
    assert!(
        (1024 * 1024..=4 * 1024 * 1024).contains(&capacity),
        "Use a dedicated 1–4 MB tmpfs; shared /dev/shm is not accepted"
    );
    assert!(
        dedicated_tmpfs(&fs::read("/proc/self/mountinfo").unwrap(), &root),
        "Refuse shared subtree or ambiguous mount; create a fresh dedicated tmpfs"
    );
    let directory = root.join(format!("pn-document-enospc-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    let fixture = Fixture(directory);
    fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o700)).unwrap();
    let file = fixture.0.join("note.mdx");
    let sibling = fixture.0.join("untouched.mdx");
    let original =
        "\u{feff}import React from 'react'\r\n\r\n{/* opaque */}\n# Original Café 😀\r\n";
    fs::write(&file, original).unwrap();
    fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
    fs::write(&sibling, b"untouched\r\n").unwrap();
    let mut store = Store::default();
    let document = store.open(&[file.clone()]).unwrap().remove(0);

    // Fill only the explicitly supplied tiny disposable filesystem, then leave
    // a little room before attempting Save. The oracle proves ENOSPC, not the
    // exact kernel write offset at which it occurs.
    let filler_path = fixture.0.join("filler");
    let mut filler = File::create(&filler_path).unwrap();
    let block = [0x61; 64 * 1024];
    let failure = loop {
        match filler.write_all(&block) {
            Ok(()) => assert!(filler.metadata().unwrap().len() <= capacity),
            Err(error) => break error,
        }
    };
    assert_eq!(failure.raw_os_error(), Some(libc::ENOSPC));
    let size = filler.metadata().unwrap().len();
    assert!(size > 128 * 1024);
    filler.set_len(size - 64 * 1024).unwrap();
    filler.sync_all().unwrap();
    let next = format!("{original}\n{}\r\n", "Literal café 😀 text. ".repeat(12000));
    assert!(next.len() < 500_000 && next.len() > 128 * 1024);
    let result = store.save(&document.id, &document.revision, &next);
    match result {
        Err(Error::Io(error)) => assert_eq!(error.raw_os_error(), Some(libc::ENOSPC)),
        other => panic!("Expected actual Save ENOSPC, got {other:?}"),
    }
    assert_eq!(fs::read(&file).unwrap(), original.as_bytes());
    assert_eq!(
        fs::metadata(&file).unwrap().permissions().mode() & 0o777,
        0o640
    );
    assert_eq!(fs::read(&sibling).unwrap(), b"untouched\r\n");
    assert_eq!(
        fs::read_dir(&fixture.0).unwrap().count(),
        3,
        "No failed Save temporary may remain"
    );

    // A failed Save must not invalidate the existing revision/grant. Reuse it
    // after releasing space, then verify with a fresh independent Store.
    drop(filler);
    fs::remove_file(&filler_path).unwrap();
    let saved = store.save(&document.id, &document.revision, &next).unwrap();
    assert!(saved.durable && !saved.revision.is_empty());
    assert_ne!(saved.revision, document.revision);
    let reopened = Store::default().open(&[file.clone()]).unwrap().remove(0);
    assert_eq!(reopened.source.as_bytes(), next.as_bytes());
    assert_eq!(
        fs::metadata(&file).unwrap().permissions().mode() & 0o777,
        0o640
    );
    assert_eq!(fs::read(&sibling).unwrap(), b"untouched\r\n");
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 2);
    println!("REAL_DOCUMENT_SAVE_ENOSPC_PASS actual_errno=ENOSPC original_exact=true mode=0640 sibling_unchanged=true no_orphan=true same_grant_retry=true fresh_reopen_exact=true");
}
