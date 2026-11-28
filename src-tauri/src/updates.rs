//! Editor-only desktop updates. No generic path, shell, HTTP or password IPC.
use crate::{documents::Documents, Host};
use native_updates::{Installation, Release};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates {
    pub installing: AtomicBool,
    busy: AtomicBool,
    pending: Mutex<Option<native_updates::Ticket<Pending>>>,
}
impl Updates {
    /// Wait only for the active installation future, not its post-install latch:
    /// Installed/Unconfirmed outcomes must permit ordinary close and reopen.
    pub(crate) fn close_must_wait(&self) -> bool {
        self.installing.load(Ordering::SeqCst) && self.busy.load(Ordering::SeqCst)
    }
}
struct Pending {
    release: Release,
    verified_update: Update,
}
struct Flag<'a> {
    flag: &'a AtomicBool,
    keep: bool,
}
impl<'a> Flag<'a> {
    fn acquire(flag: &'a AtomicBool) -> Result<Self, String> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A desktop update operation is already running.".to_string())?;
        Ok(Self { flag, keep: false })
    }
}
impl Drop for Flag<'_> {
    fn drop(&mut self) {
        if !self.keep {
            self.flag.store(false, Ordering::SeqCst);
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    installed_version: String,
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    available_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'static str>,
}
#[derive(Serialize)]
pub struct InstallStatus {
    state: &'static str,
    message: &'static str,
}

/// Register only in the editor process. No updater plugin IPC permissions are needed.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    tauri_plugin_updater::Builder::new()
        .pubkey(option_env!("PN_UPDATE_PUBLIC_KEY").unwrap_or_default())
        .target("linux-x86_64-deb")
        .build()
}
fn configured_key() -> Option<&'static str> {
    option_env!("PN_UPDATE_PUBLIC_KEY")
        .map(str::trim)
        .filter(|key| !key.is_empty())
}
fn documents(app: &AppHandle) -> Result<Arc<Documents>, String> {
    app.try_state::<Arc<Documents>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "Native document state is unavailable.".into())
}
fn clean(docs: &Documents) -> Result<(), String> {
    native_updates::ensure_clean(
        docs.dirty.load(Ordering::SeqCst),
        docs.client_busy.load(Ordering::SeqCst) || docs.busy_for_install(),
        docs.operations.load(Ordering::SeqCst),
    )
}
fn supported_installation() -> bool {
    cfg!(all(
        target_os = "linux",
        target_arch = "x86_64",
        feature = "custom-protocol"
    )) && std::env::current_exe()
        .is_ok_and(|path| path == std::path::Path::new("/usr/bin/programmable-notes"))
        && std::env::var_os("APPIMAGE").is_none()
}
#[tauri::command]
pub async fn desktop_update_check(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    updates: tauri::State<'_, Updates>,
) -> Result<UpdateStatus, String> {
    native_updates::authorize(window.label(), host.child)?;
    let _busy = Flag::acquire(&updates.busy)?;
    if updates.installing.load(Ordering::SeqCst) {
        return Err(
            "Close and reopen the application to finish the previous system update.".into(),
        );
    }
    *updates
        .pending
        .lock()
        .map_err(|_| "Desktop update state is unavailable.")? = None;
    let mut status = UpdateStatus {
        installed_version: app.package_info().version.to_string(),
        state: "disabled",
        available_version: None,
        id: None,
        message: None,
    };
    if configured_key().is_none() {
        status.message =
            Some("The signed desktop update channel is not configured in this testing build.");
        return Ok(status);
    }
    if !supported_installation() {
        status.message =
            Some("Automatic updates require the installed Linux amd64 Debian package.");
        return Ok(status);
    }
    let bytes = native_updates::fetch_manifest().await?;
    let Some(release) = native_updates::validate_release(&bytes, &status.installed_version)? else {
        status.state = "current";
        return Ok(status);
    };
    // The official updater restores bounded metadata with mandatory signed-version
    // enforcement. It does not download/install here or expose its stock installer.
    let updater = app
        .updater_builder()
        .target("linux-x86_64-deb")
        .endpoints(vec![native_updates::ENDPOINT
            .parse()
            .expect("constant endpoint")])
        .map_err(|_| "The desktop update channel is invalid.")?
        .build()
        .map_err(|_| "The signed desktop updater is unavailable.")?;
    let manifest = serde_json::from_slice(&bytes).map_err(|_| "Update metadata is invalid.")?;
    let update = updater
        .restore_update(manifest)
        .map_err(|_| "The update metadata is not a supported newer release.")?
        .ok_or("No newer desktop release is available.")?;
    if update.version != release.version
        || update.download_url.as_str() != release.url
        || update.signature != release.signature
    {
        return Err("Update metadata has inconsistent package identity.".into());
    }
    status.state = "available";
    status.available_version = Some(release.version.clone());
    let ticket = native_updates::Ticket::issue(Pending {
        release,
        verified_update: update,
    });
    status.id = Some(ticket.id().to_owned());
    *updates
        .pending
        .lock()
        .map_err(|_| "Desktop update state is unavailable.")? = Some(ticket);
    Ok(status)
}
#[tauri::command]
pub async fn desktop_update_install(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    updates: tauri::State<'_, Updates>,
    id: String,
) -> Result<InstallStatus, String> {
    native_updates::authorize(window.label(), host.child)?;
    let mut installing = Flag::acquire(&updates.installing)?;
    let _busy = Flag::acquire(&updates.busy)?;
    let docs = documents(&app)?;
    clean(&docs)?;
    let key = configured_key().ok_or("The signed desktop update channel is not configured.")?;
    if !supported_installation() {
        return Err("This installation does not support Debian desktop updates.".into());
    }
    let pending = {
        let mut ticket = updates
            .pending
            .lock()
            .map_err(|_| "Desktop update state is unavailable.")?;
        native_updates::consume_ticket(&mut *ticket, &id)?
    };
    let bytes = native_updates::download(&pending.release).await?;
    pending
        .verified_update
        .verify(&bytes)
        .map_err(|_| "The update signature or signed version did not verify.")?;
    native_updates::verify_signed_package(&bytes, &pending.release, key)?;
    clean(&docs)?;
    let supervisor = host.supervisor.clone();
    tauri::async_runtime::spawn_blocking(move || {
        supervisor
            .lock()
            .map_err(|_| "Preview supervisor is unavailable.".to_string())?
            .stop()
            .map_err(|_| "Stop the document preview before installing the update.".to_string())
    })
    .await
    .map_err(|_| "Document preview shutdown was interrupted.")??;
    clean(&docs)?;
    match native_updates::install_with_packagekit(bytes, pending.release.version).await? {
        Installation::Installed => {
            // The on-disk package changed. Prevent new operations from mixing the
            // old renderer with a new preview executable until ordinary close/reopen.
            installing.keep = true;
            Ok(InstallStatus {
                state: "installed",
                message: "Update installed. Close and reopen Programmable Notes.",
            })
        }
        Installation::Cancelled => Ok(InstallStatus {
            state: "cancelled",
            message: "Installation cancelled. Your running application remains open.",
        }),
        Installation::Unconfirmed => {
            // Never permit another install while a privileged transaction may remain.
            installing.keep = true;
            Ok(InstallStatus{state:"unconfirmed",message:"The system installer has not confirmed completion. Keep this app open and inspect the system installer before restarting; another update will not be started."})
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shipped_updater_configuration_deserializes_with_strict_inactive_channel() {
        let app: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let config: tauri_plugin_updater::Config =
            serde_json::from_value(app["plugins"]["updater"].clone()).unwrap();
        // Builder.pubkey overrides only after deserialization. An omitted field
        // would abort startup even when no update channel is activated.
        assert!(config.pubkey.is_empty());
        assert!(config.require_signed_version);
        assert!(!config.allow_downgrades);
        assert!(!config.dangerous_insecure_transport_protocol);
        assert!(!config.dangerous_accept_invalid_certs);
        assert!(!config.dangerous_accept_invalid_hostnames);
        assert_eq!(config.endpoints.len(), 1);
        assert_eq!(config.endpoints[0].as_str(), native_updates::ENDPOINT);
    }

    #[test]
    fn checking_does_not_block_close_but_active_installation_does() {
        let updates = Updates::default();
        assert!(!updates.close_must_wait());
        let checking = Flag::acquire(&updates.busy).unwrap();
        assert!(!updates.close_must_wait());
        drop(checking);
        let installing = Flag::acquire(&updates.installing).unwrap();
        let busy = Flag::acquire(&updates.busy).unwrap();
        assert!(updates.close_must_wait());
        drop(busy);
        drop(installing);
        assert!(!updates.close_must_wait());
        assert!(!updates.installing.load(Ordering::SeqCst));
    }

    #[test]
    fn guarded_close_waits_for_active_update_not_its_returned_latch() {
        use crate::editor_close::{update_blocks_close, Action, Busy, Decision, Gate};
        let updates = Updates::default();
        let mut gate = Gate::default();
        gate.enable(1, "epoch".into(), Busy::default()).unwrap();
        gate.close(Some("request".into()), Busy::default());
        let mut installing = Flag::acquire(&updates.installing).unwrap();
        let active = Flag::acquire(&updates.busy).unwrap();
        let conditions = || Busy {
            installing: update_blocks_close(
                updates.installing.load(Ordering::SeqCst),
                updates.close_must_wait(),
                false,
            ),
            ..Busy::default()
        };
        assert!(gate
            .resolve("epoch", "request", Action::Commit, conditions())
            .is_err());
        installing.keep = true;
        drop(active);
        drop(installing);
        assert!(updates.installing.load(Ordering::SeqCst));
        assert!(Flag::acquire(&updates.installing).is_err());
        assert!(update_blocks_close(true, updates.close_must_wait(), true));
        gate.resolve("epoch", "request", Action::Commit, conditions())
            .unwrap();
        assert_eq!(gate.close(None, conditions()), Decision::Permit);
    }
    #[test]
    fn returned_installed_or_unconfirmed_outcome_allows_close_without_new_install() {
        let updates = Updates::default();
        let mut installing = Flag::acquire(&updates.installing).unwrap();
        let busy = Flag::acquire(&updates.busy).unwrap();
        assert!(updates.close_must_wait());
        // Both outcomes preserve the installation latch but release the active
        // future's busy guard, allowing the user to close and reopen normally.
        installing.keep = true;
        drop(busy);
        drop(installing);
        assert!(!updates.close_must_wait());
        assert!(updates.installing.load(Ordering::SeqCst));
        assert!(Flag::acquire(&updates.installing).is_err());
    }
}
