#![cfg(target_os = "linux")]
use native_documents::{Error, Observation, Store, MAX_SOURCE_BYTES};
use std::{
    fs,
    os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    path::PathBuf,
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "pn-observation-draft-{}",
            native_documents::new_vault_session_token().unwrap()
        ));
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        Self(root)
    }
    fn file(&self, name: &str, bytes: impl AsRef<[u8]>) -> PathBuf {
        let p = self.0.join(name);
        fs::write(&p, bytes).unwrap();
        fs::set_permissions(&p, fs::Permissions::from_mode(0o640)).unwrap();
        p
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn changed(result: Observation, baseline: &str, source: &str) -> String {
    match result {
        Observation::Changed {
            baseline_revision,
            revision,
            source: actual,
        } => {
            assert_eq!(baseline_revision, baseline);
            assert_eq!(actual, source);
            assert_ne!(revision, baseline);
            revision
        }
        other => panic!("Expected changed observation: {other:?}"),
    }
}
#[test]
fn unchanged_read_preserves_revision_bytes_inode_permissions_and_save_authority() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "\u{feff}A\r\nB\n");
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    let before = fs::metadata(&p).unwrap();
    for _ in 0..3 {
        assert!(
            matches!(s.observe(&d.id,&d.revision).unwrap(),Observation::Unchanged{revision} if revision==d.revision)
        );
    }
    let after = fs::metadata(&p).unwrap();
    assert_eq!(before.ino(), after.ino());
    assert_eq!(before.mode(), after.mode());
    assert_eq!(before.ctime_nsec(), after.ctime_nsec());
    assert_eq!(fs::read_to_string(&p).unwrap(), d.source);
    s.save(&d.id, &d.revision, "saved normally").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "saved normally");
}
#[test]
fn direct_write_is_exact_and_observation_does_not_rebase_original_save() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "old");
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    let external = "\u{feff}import X from './x'\r\n{/* Café 🌱 */}\n<Opaque p={{x:1}} />\r\n";
    fs::write(&p, external).unwrap();
    let revision = changed(
        s.observe(&d.id, &d.revision).unwrap(),
        &d.revision,
        external,
    );
    assert!(matches!(
        s.save(&d.id, &d.revision, "unsafe old baseline"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(&p).unwrap(), external);
    s.save(&d.id, &revision, &format!("{external}Local"))
        .unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), format!("{external}Local"));
}
#[test]
fn atomic_rename_observed_and_repeat_reuses_exact_candidate() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "old");
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    let new = f.file("incoming.mdx", "disk\r\n");
    fs::rename(new, &p).unwrap();
    let revision = changed(
        s.observe(&d.id, &d.revision).unwrap(),
        &d.revision,
        "disk\r\n",
    );
    assert!(
        matches!(s.observe(&d.id,&revision).unwrap(),Observation::Unchanged{revision:r} if r==revision)
    );
    let again = changed(
        s.observe(&d.id, &d.revision).unwrap(),
        &d.revision,
        "disk\r\n",
    );
    assert_eq!(revision, again);
}
#[test]
fn second_external_write_invalidates_old_observed_save_without_overwriting() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "base");
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    fs::write(&p, "disk1").unwrap();
    let first = changed(s.observe(&d.id, &d.revision).unwrap(), &d.revision, "disk1");
    fs::write(&p, "disk2").unwrap();
    assert!(matches!(
        s.save(&d.id, &first, "local"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(&p).unwrap(), "disk2");
    let second = changed(s.observe(&d.id, &first).unwrap(), &first, "disk2");
    s.save(&d.id, &second, "merged explicitly").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "merged explicitly");
}
#[test]
fn observation_tokens_are_bound_to_grant_and_retired_on_save_or_close() {
    let f = Fixture::new();
    let a = f.file("a.mdx", "A");
    let b = f.file("b.mdx", "B");
    let mut s = Store::default();
    let docs = s.open(&[a.clone(), b]).unwrap();
    let d = &docs[0];
    let other = &docs[1];
    fs::write(&a, "external").unwrap();
    let token = changed(
        s.observe(&d.id, &d.revision).unwrap(),
        &d.revision,
        "external",
    );
    assert!(matches!(
        s.observe("forged", &token),
        Err(Error::UnknownGrant)
    ));
    assert!(matches!(
        s.save(&other.id, &token, "cross grant"),
        Err(Error::StaleRevision)
    ));
    assert!(matches!(
        s.observe(&other.id, &token),
        Err(Error::StaleRevision)
    ));
    let saved = s.save(&d.id, &token, "saved").unwrap();
    assert!(matches!(
        s.observe(&d.id, &token),
        Err(Error::StaleRevision)
    ));
    assert!(matches!(
        s.observe(&d.id, &saved.revision).unwrap(),
        Observation::Unchanged { .. }
    ));
    s.close(&d.id).unwrap();
    assert!(matches!(
        s.observe(&d.id, &saved.revision),
        Err(Error::UnknownGrant)
    ));
}
#[test]
fn candidates_are_bounded_without_evicting_requested_baseline() {
    let f = Fixture::new();
    let p = f.file("note.mdx", "base");
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    fs::write(&p, "pinned").unwrap();
    let pinned = changed(
        s.observe(&d.id, &d.revision).unwrap(),
        &d.revision,
        "pinned",
    );
    let mut previous: Option<String> = None;
    for i in 0..10 {
        let text = format!("external{i}");
        fs::write(&p, &text).unwrap();
        let token = changed(s.observe(&d.id, &pinned).unwrap(), &pinned, &text);
        if let Some(old) = previous {
            assert!(matches!(s.observe(&d.id, &old), Err(Error::StaleRevision)));
        }
        previous = Some(token);
    }
}
#[test]
fn final_symlink_hardlink_fifo_invalid_encoding_oversize_and_unreadable_are_refused() {
    for kind in [
        "symlink",
        "hardlink",
        "fifo",
        "encoding",
        "oversize",
        "unreadable",
    ] {
        let f = Fixture::new();
        let p = f.file("note.mdx", "base");
        let outside = f.file("outside.mdx", "unselected");
        let mut s = Store::default();
        let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
        match kind {
            "symlink" => {
                fs::remove_file(&p).unwrap();
                symlink(&outside, &p).unwrap();
            }
            "hardlink" => {
                fs::remove_file(&p).unwrap();
                fs::hard_link(&outside, &p).unwrap();
            }
            "fifo" => {
                fs::remove_file(&p).unwrap();
                let c = std::ffi::CString::new(p.as_os_str().as_encoded_bytes()).unwrap();
                assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
            }
            "encoding" => fs::write(&p, [0xff]).unwrap(),
            "oversize" => fs::write(&p, vec![b'a'; MAX_SOURCE_BYTES + 1]).unwrap(),
            "unreadable" => fs::set_permissions(&p, fs::Permissions::from_mode(0o000)).unwrap(),
            _ => unreachable!(),
        }
        assert!(s.observe(&d.id, &d.revision).is_err(), "accepted {kind}");
        assert_eq!(fs::read_to_string(&outside).unwrap(), "unselected");
    }
}
#[test]
fn missing_path_and_replaced_ancestor_never_read_unselected_replacement_or_detached_original() {
    let f = Fixture::new();
    let dir = f.0.join("selected");
    fs::create_dir(&dir).unwrap();
    let p = dir.join("note.mdx");
    fs::write(&p, "base").unwrap();
    let mut s = Store::default();
    let d = s.open(std::slice::from_ref(&p)).unwrap().remove(0);
    fs::remove_file(&p).unwrap();
    assert!(s.observe(&d.id, &d.revision).is_err());
    fs::write(&p, "detached content").unwrap();
    let moved = f.0.join("moved");
    fs::rename(&dir, &moved).unwrap();
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join("note.mdx"), "unselected").unwrap();
    assert!(s.observe(&d.id, &d.revision).is_err());
    assert_eq!(
        fs::read_to_string(dir.join("note.mdx")).unwrap(),
        "unselected"
    );
    assert_eq!(
        fs::read_to_string(moved.join("note.mdx")).unwrap(),
        "detached content"
    );
}

#[test]
fn directory_watch_invalidates_direct_and_atomic_rename_writes_without_changing_baseline() {
    let f = Fixture::new();
    let path = f.file("note.mdx", "base");
    let mut store = Store::default();
    let document = store.open(std::slice::from_ref(&path)).unwrap().remove(0);
    let watch = store.watch(&document.id, &document.revision).unwrap();
    assert!(!store.poll_watch(&document.id, &watch).unwrap());
    fs::write(&path, "direct\r\n").unwrap();
    assert!(store.poll_watch(&document.id, &watch).unwrap());
    let first = changed(
        store.observe(&document.id, &document.revision).unwrap(),
        &document.revision,
        "direct\r\n",
    );
    let incoming = f.file("incoming.mdx", "atomic 🌱\n");
    fs::rename(incoming, &path).unwrap();
    assert!(store.poll_watch(&document.id, &watch).unwrap());
    changed(
        store.observe(&document.id, &first).unwrap(),
        &first,
        "atomic 🌱\n",
    );
    assert!(matches!(
        store.save(&document.id, &document.revision, "old writer"),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "atomic 🌱\n");
}
#[test]
fn directory_watch_ignores_unrelated_names_and_reports_target_deletion() {
    let f = Fixture::new();
    let path = f.file("note.mdx", "base");
    let mut store = Store::default();
    let document = store.open(std::slice::from_ref(&path)).unwrap().remove(0);
    let watch = store.watch(&document.id, &document.revision).unwrap();
    f.file("other.mdx", "unrelated");
    assert!(!store.poll_watch(&document.id, &watch).unwrap());
    fs::remove_file(&path).unwrap();
    assert!(store.poll_watch(&document.id, &watch).unwrap());
    assert!(store.observe(&document.id, &document.revision).is_err());
}
#[test]
fn directory_watch_requires_live_grant_revision_and_current_safe_path() {
    let f = Fixture::new();
    let path = f.file("note.mdx", "base");
    let mut store = Store::default();
    let document = store.open(std::slice::from_ref(&path)).unwrap().remove(0);
    assert!(store.watch("forged", &document.revision).is_err());
    assert!(store.watch(&document.id, "stale").is_err());
    fs::remove_file(&path).unwrap();
    symlink(f.file("outside.mdx", "unselected"), &path).unwrap();
    assert!(store.watch(&document.id, &document.revision).is_err());
    store.close(&document.id).unwrap();
    assert!(store.watch(&document.id, &document.revision).is_err());
}

#[test]
fn directory_self_move_is_a_hint_but_observation_refuses_detached_path() {
    let f = Fixture::new();
    let selected = f.0.join("selected");
    fs::create_dir(&selected).unwrap();
    let path = selected.join("note.mdx");
    fs::write(&path, "base").unwrap();
    let mut store = Store::default();
    let document = store.open(&[path]).unwrap().remove(0);
    let watch = store.watch(&document.id, &document.revision).unwrap();
    fs::rename(&selected, f.0.join("moved")).unwrap();
    assert!(store.poll_watch(&document.id, &watch).unwrap());
    assert!(store.observe(&document.id, &document.revision).is_err());
}

#[test]
fn watch_registration_is_idempotent_scoped_and_retired_without_reusable_tokens() {
    let f = Fixture::new();
    let a = f.file("a.mdx", "A");
    let b = f.file("b.mdx", "B");
    let mut store = Store::default();
    let documents = store.open(&[a.clone(), b]).unwrap();
    let document = &documents[0];
    let other = &documents[1];
    let watch = store.watch(&document.id, &document.revision).unwrap();
    for _ in 0..20 {
        assert_eq!(
            store.watch(&document.id, &document.revision).unwrap(),
            watch
        );
    }
    let other_watch = store.watch(&other.id, &other.revision).unwrap();
    assert_ne!(other_watch, watch);
    assert!(store.poll_watch(&other.id, &watch).is_err());
    assert!(store.unwatch(&other.id, &watch).is_err());
    store.unwatch(&document.id, &watch).unwrap();
    assert!(store.poll_watch(&document.id, &watch).is_err());
    let restarted = store.watch(&document.id, &document.revision).unwrap();
    assert_ne!(restarted, watch);
    assert!(store.unwatch(&document.id, &watch).is_err());
    fs::write(a, "next").unwrap();
    assert!(store.poll_watch(&document.id, &restarted).unwrap());
    store.close(&document.id).unwrap();
    assert!(store.poll_watch(&document.id, &restarted).is_err());
    assert!(store.unwatch(&document.id, &restarted).is_err());
    assert!(!store.poll_watch(&other.id, &other_watch).unwrap());
}
