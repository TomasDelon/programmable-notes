use native_updates::{
    check_size, ensure_clean, validate_release, verify_signed_package, MAX_PACKAGE_BYTES,
};
fn manifest(version: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({"version":version,"platforms":{"linux-x86_64-deb":{"url":"https://programmable-notes.pages.dev/desktop/linux-amd64/fixture.deb","signature":include_str!("fixtures/package.sig").trim()}}})).unwrap()
}
#[test]
fn accepts_only_newer_fixed_origin_debian_release() {
    let release = validate_release(&manifest("1.2.3"), "1.2.2")
        .unwrap()
        .unwrap();
    assert_eq!(release.version, "1.2.3");
    for current in ["1.2.3", "1.2.4", "2.0.0"] {
        assert!(validate_release(&manifest("1.2.3"), current)
            .unwrap()
            .is_none());
    }
}
#[test]
fn rejects_foreign_redirect_targets_non_debian_and_oversize_metadata() {
    let text = String::from_utf8(manifest("1.2.3")).unwrap();
    for bad in [
        text.replace("programmable-notes.pages.dev", "attacker.invalid"),
        text.replace("fixture.deb", "fixture.AppImage"),
        text.replace("linux-x86_64-deb", "linux-aarch64-deb"),
        text.replace("fixture.deb", "fixture.deb?secret=value"),
    ] {
        assert!(validate_release(bad.as_bytes(), "1.2.2").is_err());
    }
    assert!(validate_release(&vec![b' '; 65537], "1.2.2").is_err());
}
#[test]
fn verifies_real_version_bound_signature_and_rejects_tamper_replay_and_size() {
    let mut release = validate_release(&manifest("1.2.3"), "1.2.2")
        .unwrap()
        .unwrap();
    let data = include_bytes!("fixtures/package.fixture");
    let key = include_str!("fixtures/public-key.txt").trim();
    verify_signed_package(data, &release, key).unwrap();
    let mut changed = data.to_vec();
    changed.push(0);
    assert!(verify_signed_package(&changed, &release, key).is_err());
    release.version = "9.9.9".into();
    assert!(verify_signed_package(data, &release, key).is_err());
    assert!(verify_signed_package(data, &release, "wrong public key").is_err());
    assert!(check_size(0, MAX_PACKAGE_BYTES).is_ok());
    assert!(check_size(MAX_PACKAGE_BYTES, 1).is_err());
}
#[test]
fn pending_work_and_preview_callers_cannot_authorize_installation() {
    assert!(ensure_clean(false, false, 0).is_ok());
    for (dirty, busy, operations) in [(true, false, 0), (false, true, 0), (false, false, 1)] {
        assert!(ensure_clean(dirty, busy, operations).is_err());
    }
    assert!(native_updates::authorize("editor", false).is_ok());
    for (label, child) in [("preview", false), ("editor", true), ("preview", true)] {
        assert!(native_updates::authorize(label, child).is_err());
    }
}

#[test]
fn installed_debian_revisions_use_package_manager_ordering() {
    // SemVer treats -1 as a prerelease; Debian treats it as a newer revision.
    assert!(native_updates::ensure_newer_installed("1.2.3", "1.2.3-1").is_err());
    assert!(native_updates::ensure_newer_installed("1.2.3", "1:1.2.2").is_err());
    assert!(native_updates::ensure_newer_installed("1.2.3", "1.2.3~rc1").is_ok());
    assert!(native_updates::ensure_newer_installed("1.2.4", "1.2.3-9").is_ok());
}

#[test]
fn system_installer_completion_requires_confirmed_success() {
    use native_updates::{installation_outcome, Installation};
    assert_eq!(installation_outcome(1).unwrap(), Installation::Installed);
    assert_eq!(installation_outcome(3).unwrap(), Installation::Cancelled);
    assert_eq!(installation_outcome(9).unwrap(), Installation::Cancelled);
    for code in [0, 2, 4, 5, 6, 7, 8, 10, 11, u32::MAX] {
        assert!(installation_outcome(code).is_err());
    }
}
#[test]
fn package_size_bounds_include_integer_overflow() {
    assert!(check_size(MAX_PACKAGE_BYTES, 0).is_ok());
    assert!(check_size(MAX_PACKAGE_BYTES, 1).is_err());
    assert!(check_size(usize::MAX, 1).is_err());
}

#[test]
fn legacy_valid_signature_without_bound_version_and_wrong_signing_key_are_rejected() {
    let mut release = validate_release(&manifest("1.2.3"), "1.2.2")
        .unwrap()
        .unwrap();
    let data = include_bytes!("fixtures/package.fixture");
    let other_key = include_str!("fixtures/legacy-public-key.txt").trim();
    assert!(verify_signed_package(data, &release, other_key).is_err());
    release.signature = include_str!("fixtures/legacy-package.sig").trim().into();
    let error = verify_signed_package(data, &release, other_key).unwrap_err();
    assert!(
        error.contains("bind the announced version"),
        "Legacy signature must pass cryptographic verification before version binding is rejected"
    );
}

#[test]
fn on_disk_version_prevents_a_stale_running_app_from_downgrading() {
    use native_updates::ensure_newer_installed;
    assert!(ensure_newer_installed("1.2.3", "1.2.2").is_ok());
    assert!(ensure_newer_installed("1.2.3", "1.2.3").is_err());
    assert!(ensure_newer_installed("1.2.3", "1.2.4").is_err());
    assert!(ensure_newer_installed("1.2.3", "invalid").is_err());
}
