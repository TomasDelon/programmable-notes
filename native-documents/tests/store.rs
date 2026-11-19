#![cfg(target_os = "linux")]
use native_documents::{Error, Store, MAX_DOCUMENTS, MAX_SOURCE_BYTES};
use std::{
    fs,
    os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    path::PathBuf,
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let mut id = [0u8; 16];
        getrandom::fill(&mut id).unwrap();
        let dir = std::env::temp_dir().join(format!(
            "pn-documents-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        fs::create_dir(&dir).unwrap();
        Self(dir)
    }
    fn file(&self, name: &str, text: impl AsRef<[u8]>) -> PathBuf {
        let p = self.0.join(name);
        fs::write(&p, text).unwrap();
        p
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn opened_document_saves_atomically_and_reopens_exact_utf8_crlf() {
    let f = Fixture::new();
    let source = "# Écriture\r\n\r\n<Counter />\r\n";
    let path = f.file("note.mdx", source);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let inode = fs::metadata(&path).unwrap().ino();
    let mut store = Store::default();
    let d = store.open(&[path.clone()]).unwrap().remove(0);
    assert_eq!(d.source, source);
    assert_eq!(d.logical_path, "note.mdx");
    let next = format!("{source}suite\r\n");
    let saved = store.save(&d.id, &d.revision, &next).unwrap();
    assert!(saved.durable);
    assert_ne!(saved.revision, d.revision);
    assert_eq!(fs::read_to_string(&path).unwrap(), next);
    assert_ne!(fs::metadata(&path).unwrap().ino(), inode);
    assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o640);
    store.close(&d.id).unwrap();
    assert!(matches!(
        store.save(&d.id, &saved.revision, "bad"),
        Err(Error::UnknownGrant)
    ));
    assert_eq!(store.open(&[path]).unwrap()[0].source, next);
}
#[test]
fn forged_tokens_stale_revisions_and_external_changes_do_not_overwrite() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "original");
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    assert!(matches!(
        s.save("forged", &d.revision, "bad"),
        Err(Error::UnknownGrant)
    ));
    assert!(matches!(
        s.save(&d.id, "stale", "bad"),
        Err(Error::StaleRevision)
    ));
    fs::write(&p, "external edit").unwrap();
    assert!(matches!(
        s.save(&d.id, &d.revision, "bad"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(p).unwrap(), "external edit");
}
#[test]
fn refuses_symlinks_fifo_invalid_utf8_oversize_and_unlisted_extensions() {
    let f = Fixture::new();
    let p = f.file("real.mdx", "safe");
    let link = f.0.join("link.mdx");
    symlink(&p, &link).unwrap();
    let invalid = f.file("invalid.mdx", [0xff, 0xfe]);
    let big = f.file("big.mdx", vec![b'a'; MAX_SOURCE_BYTES + 1]);
    let unlisted = f.file("script.sh", "exit 0");
    let fifo = f.0.join("fifo.mdx");
    let name = std::ffi::CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
    for path in [link, invalid, big, unlisted, fifo] {
        assert!(Store::default().open(&[path]).is_err());
    }
}
#[test]
fn disk_replacement_symlink_cannot_redirect_a_save() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "old");
    let outside = f.file("unselected.mdx", "secret");
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    fs::remove_file(&p).unwrap();
    symlink(&outside, &p).unwrap();
    assert!(s.save(&d.id, &d.revision, "bad").is_err());
    assert_eq!(fs::read_to_string(outside).unwrap(), "secret");
}
#[test]
fn parent_rename_keeps_saves_in_the_authorized_directory() {
    let f = Fixture::new();
    let original = f.0.join("selected");
    fs::create_dir(&original).unwrap();
    let p = original.join("note.mdx");
    fs::write(&p, "old").unwrap();
    let mut s = Store::default();
    let d = s.open(&[p]).unwrap().remove(0);
    let moved = f.0.join("moved");
    fs::rename(&original, &moved).unwrap();
    fs::create_dir(&original).unwrap();
    fs::write(original.join("note.mdx"), "unselected replacement").unwrap();
    s.save(&d.id, &d.revision, "new").unwrap();
    assert_eq!(fs::read_to_string(moved.join("note.mdx")).unwrap(), "new");
    assert_eq!(
        fs::read_to_string(original.join("note.mdx")).unwrap(),
        "unselected replacement"
    );
}
#[test]
fn read_only_failure_retains_original_and_does_not_leave_temp_files() {
    let f = Fixture::new();
    let p = f.file("readonly.mdx", "old");
    fs::set_permissions(&p, fs::Permissions::from_mode(0o400)).unwrap();
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    assert!(s.save(&d.id, &d.revision, "new").is_err());
    assert_eq!(fs::read_to_string(p).unwrap(), "old");
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
}
#[test]
fn save_as_new_file_grants_only_its_selected_target() {
    let f = Fixture::new();
    let p = f.0.join("new.mdx");
    let mut s = Store::default();
    let d = s.save_as(&p, "first").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "first");
    s.save(&d.id, &d.revision, "second").unwrap();
    assert_eq!(fs::read_to_string(p).unwrap(), "second");
}
#[test]
fn open_batch_is_transactional_and_limits_grants() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "ok");
    let mut s = Store::default();
    assert!(s.open(&[p.clone(), f.0.join("missing.mdx")]).is_err());
    let paths = vec![p.clone(); MAX_DOCUMENTS];
    assert_eq!(s.open(&paths).unwrap().len(), MAX_DOCUMENTS);
    assert!(s.open(&[p]).is_err());
}
#[test]
fn explicit_selected_module_paths_share_a_logical_root_without_loading_neighbors() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "import C from './widgets/C.tsx'\n\n<C/>");
    fs::create_dir(f.0.join("widgets")).unwrap();
    let c = f.file("widgets/C.tsx", "export default()=>null");
    f.file("secret.mdx", "never load");
    let docs = Store::default().open(&[p, c]).unwrap();
    assert_eq!(docs.len(), 2);
    assert_eq!(docs[0].logical_path, "note.mdx");
    assert_eq!(docs[1].logical_path, "widgets/C.tsx");
}
#[test]
fn save_as_selection_does_not_clobber_a_later_created_file() {
    let f = Fixture::new();
    let p = f.0.join("raced.mdx");
    let mut s = Store::default();
    let pending = s.prepare_save_as(&p).unwrap();
    assert!(!pending.exists());
    fs::write(&p, "created after selection").unwrap();
    assert!(matches!(
        s.commit_save_as(pending, "bad"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(p).unwrap(), "created after selection");
}
#[test]
fn confirmed_save_as_conflicts_if_target_changes_while_dialog_is_open() {
    let f = Fixture::new();
    let p = f.file("existing.mdx", "old");
    let mut s = Store::default();
    let pending = s.prepare_save_as(&p).unwrap();
    assert!(pending.exists());
    fs::write(&p, "external").unwrap();
    assert!(matches!(
        s.commit_save_as(pending, "bad"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(p).unwrap(), "external");
}
#[test]
fn atomic_save_preserves_extended_attributes() {
    let f = Fixture::new();
    let p = f.file("metadata.mdx", "old");
    let raw = std::ffi::CString::new(p.as_os_str().as_encoded_bytes()).unwrap();
    let name = c"user.programmable_notes_test";
    let value = b"authorized metadata";
    assert_eq!(
        unsafe {
            libc::setxattr(
                raw.as_ptr(),
                name.as_ptr(),
                value.as_ptr().cast(),
                value.len(),
                0,
            )
        },
        0
    );
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    s.save(&d.id, &d.revision, "new").unwrap();
    let mut bytes = [0u8; 64];
    let n = unsafe {
        libc::getxattr(
            raw.as_ptr(),
            name.as_ptr(),
            bytes.as_mut_ptr().cast(),
            bytes.len(),
        )
    };
    assert!(n >= 0);
    assert_eq!(&bytes[..n as usize], value);
}
#[test]
fn concurrent_readers_observe_only_complete_old_or_new_source() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let f = Fixture::new();
    let old = "o".repeat(400_000);
    let new = "n".repeat(400_000);
    let p = f.file("large.mdx", &old);
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    let done = Arc::new(AtomicBool::new(false));
    let stopped = done.clone();
    let read_path = p.clone();
    let before = old.clone();
    let after = new.clone();
    let reader = std::thread::spawn(move || {
        let mut reads = 0;
        while !stopped.load(Ordering::Relaxed) {
            let text = fs::read_to_string(&read_path).unwrap();
            assert!(text == before || text == after, "Observed partial file");
            reads += 1;
        }
        reads
    });
    s.save(&d.id, &d.revision, &new).unwrap();
    done.store(true, Ordering::Relaxed);
    assert!(reader.join().unwrap() > 0);
    assert_eq!(fs::read_to_string(p).unwrap(), new);
}
#[test]
fn aggregate_source_bytes_and_multibyte_save_size_are_bounded() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "a".repeat(MAX_SOURCE_BYTES));
    let mut s = Store::default();
    assert!(s.open(&vec![p.clone(); 18]).is_err());
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    assert!(s
        .save(&d.id, &d.revision, &"é".repeat(MAX_SOURCE_BYTES / 2 + 1))
        .is_err());
    assert_eq!(fs::metadata(p).unwrap().len(), MAX_SOURCE_BYTES as u64);
}
#[test]
fn save_as_rejects_non_utf8_filename_before_any_commit() {
    use std::os::unix::ffi::OsStringExt;
    let f = Fixture::new();
    let name = std::ffi::OsString::from_vec(vec![0xff, b'.', b'm', b'd', b'x']);
    let p = f.0.join(name);
    assert!(Store::default().save_as(&p, "must not commit").is_err());
    assert!(!p.exists());
}
#[test]
fn invalid_logical_name_does_not_leak_partial_batch_grants() {
    use std::os::unix::ffi::OsStringExt;
    let f = Fixture::new();
    let p = f.file("ok.mdx", "old");
    let bad_dir = f.0.join(std::ffi::OsString::from_vec(vec![0xff]));
    fs::create_dir(&bad_dir).unwrap();
    let bad = bad_dir.join("second.mdx");
    fs::write(&bad, "text").unwrap();
    let mut s = Store::default();
    assert!(s.open(&[p.clone(), bad]).is_err());
    assert_eq!(
        s.open(&vec![p; MAX_DOCUMENTS]).unwrap().len(),
        MAX_DOCUMENTS
    );
}
#[test]
fn explicit_reopen_refreshes_conflicted_source_and_revision() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "old");
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    fs::write(&p, "external").unwrap();
    assert!(matches!(
        s.save(&d.id, &d.revision, "unsaved"),
        Err(Error::Conflict)
    ));
    let reopened = s.reopen(&d.id, &d.revision).unwrap();
    assert_eq!(reopened.source, "external");
    assert_ne!(reopened.revision, d.revision);
    s.save(&d.id, &reopened.revision, "edited after reopen")
        .unwrap();
    assert_eq!(fs::read_to_string(p).unwrap(), "edited after reopen");
}
#[test]
fn saving_selected_hardlink_does_not_modify_an_unselected_alias() {
    let f = Fixture::new();
    let p = f.file("selected.mdx", "old");
    let alias = f.0.join("unselected.mdx");
    fs::hard_link(&p, &alias).unwrap();
    let mut s = Store::default();
    let d = s.open(&[p.clone()]).unwrap().remove(0);
    s.save(&d.id, &d.revision, "new").unwrap();
    assert_eq!(fs::read_to_string(p).unwrap(), "new");
    assert_eq!(fs::read_to_string(alias).unwrap(), "old");
}

#[test]
fn mixed_case_source_extensions_preserve_distinct_paths_and_exact_bytes() {
    let f = Fixture::new();
    let upper = f.file("Note.MdX", "\u{feff}# Upper\r\nCafé 😀\r\n");
    let lower = f.file("Note.mdx", "# Lower\n");
    let module = f.file("Widget.TSX", "export const x: number = 1;\r\n");
    fs::set_permissions(&upper, fs::Permissions::from_mode(0o640)).unwrap();
    let mut store = Store::default();
    let documents = store.open(&[upper.clone(), lower.clone(), module]).unwrap();
    let first = documents.iter().find(|d| d.name == "Note.MdX").unwrap();
    assert_eq!(first.logical_path, "Note.MdX");
    assert_eq!(first.source, "\u{feff}# Upper\r\nCafé 😀\r\n");
    let saved = store
        .save(&first.id, &first.revision, "\u{feff}# Changed\r\n")
        .unwrap();
    assert_eq!(
        fs::read(&upper).unwrap(),
        "\u{feff}# Changed\r\n".as_bytes()
    );
    assert_eq!(fs::read(&lower).unwrap(), b"# Lower\n");
    assert_eq!(fs::metadata(&upper).unwrap().mode() & 0o777, 0o640);
    assert_eq!(
        store.reopen(&first.id, &saved.revision).unwrap().name,
        "Note.MdX"
    );
    let executable = f.file("blocked.EXE", "valid UTF8 is not an allowed source format");
    assert!(store.open(&[executable.clone()]).is_err());
    assert_eq!(
        fs::read_to_string(executable).unwrap(),
        "valid UTF8 is not an allowed source format"
    );
}

#[test]
fn picker_filters_only_accept_existing_source_formats_with_ascii_case_variants() {
    let variants = native_documents::source_extension_variants();
    for required in ["mdx", "MdX", "MDX", "md", "MD", "TsX", "TS", "JsX", "JS"] {
        assert!(variants.iter().any(|extension| extension == required));
    }
    for extension in &variants {
        assert!(["mdx", "md", "tsx", "ts", "jsx", "js"]
            .contains(&extension.to_ascii_lowercase().as_str()));
        assert!(extension.bytes().all(|byte| byte.is_ascii_alphabetic()));
    }
    assert!(!variants
        .iter()
        .any(|extension| extension == "exe" || extension == "*"));
}
