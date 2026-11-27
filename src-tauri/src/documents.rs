//! Only this editor-side module turns native picker selections into file grants.
use crate::{
    editor_close::{
        Action as GuardAction, Busy as GuardBusy, Decision as GuardDecision, Gate as CloseGate,
        Phase as GuardPhase,
    },
    Host,
};
use native_documents::{Document, Saved, Store};
use preview_policy::authorize;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[derive(Default)]
pub struct Documents {
    store: Mutex<Store>,
    close_gate: Mutex<CloseGate>,
    #[cfg(target_os = "linux")]
    vault: Mutex<Option<Arc<VaultSession>>>,
    pub dirty: AtomicBool,
    pub client_busy: AtomicBool,
    renderer_stopped: AtomicBool,
    pub operations: AtomicUsize,
    dialog: AtomicBool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    vault_id: String,
    display_path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInventory {
    vault_id: String,
    entries: Vec<native_documents::InventoryEntry>,
}
#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AcquisitionRefusalCode {
    Rejected,
    Io,
    Conflict,
}
#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum VaultDocuments {
    Acquired {
        vault_id: String,
        documents: Vec<Document>,
    },
    Refused {
        vault_id: String,
        paths: Vec<String>,
        code: AcquisitionRefusalCode,
    },
}
#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum VaultCreated {
    Acquired {
        vault_id: String,
        document: Document,
    },
    Refused {
        vault_id: String,
        path: String,
        code: AcquisitionRefusalCode,
    },
}
#[cfg(target_os = "linux")]
fn acquisition_refusal(error: native_documents::Error) -> Result<AcquisitionRefusalCode, String> {
    match error {
        native_documents::Error::Rejected(_) => Ok(AcquisitionRefusalCode::Rejected),
        native_documents::Error::Io(_) => Ok(AcquisitionRefusalCode::Io),
        native_documents::Error::Conflict => Ok(AcquisitionRefusalCode::Conflict),
        error => Err(error.to_string()),
    }
}
#[cfg(target_os = "linux")]
fn vault_documents_outcome(
    vault_id: String,
    paths: Vec<String>,
    result: Result<Vec<Document>, native_documents::Error>,
) -> Result<VaultDocuments, String> {
    match result {
        Ok(documents) => Ok(VaultDocuments::Acquired {
            vault_id,
            documents,
        }),
        Err(error) => Ok(VaultDocuments::Refused {
            vault_id,
            paths,
            code: acquisition_refusal(error)?,
        }),
    }
}
#[cfg(target_os = "linux")]
fn vault_created_outcome(
    vault_id: String,
    path: String,
    result: Result<Document, native_documents::Error>,
) -> Result<VaultCreated, String> {
    match result {
        Ok(document) => Ok(VaultCreated::Acquired { vault_id, document }),
        Err(error) => Ok(VaultCreated::Refused {
            vault_id,
            path,
            code: acquisition_refusal(error)?,
        }),
    }
}
#[cfg(target_os = "linux")]
struct VaultSession {
    info: VaultInfo,
    vault: native_documents::Vault,
}
impl Documents {
    #[cfg(target_os = "linux")]
    fn activate_vault(
        &self,
        selected: Option<(native_documents::Vault, String)>,
    ) -> Result<Option<VaultInfo>, String> {
        let Some((vault, display_path)) = selected else {
            return Ok(None);
        };
        let info = VaultInfo {
            vault_id: native_documents::new_vault_session_token()
                .map_err(|error| error.to_string())?,
            display_path,
        };
        *self.vault.lock().map_err(|_| "Vault session unavailable")? =
            Some(Arc::new(VaultSession {
                info: info.clone(),
                vault,
            }));
        Ok(Some(info))
    }
    #[cfg(target_os = "linux")]
    fn capture_vault(&self, vault_id: &str) -> Result<Arc<VaultSession>, String> {
        self.vault
            .lock()
            .map_err(|_| "Vault session unavailable")?
            .as_ref()
            .filter(|session| session.info.vault_id == vault_id)
            .cloned()
            .ok_or_else(|| "Unknown or replaced vault session; select a vault again".into())
    }
    pub(crate) fn busy_for_install(&self) -> bool {
        self.close_gate
            .lock()
            .map_or(true, |gate| gate.busy_for_install())
            || self.dirty.load(Ordering::SeqCst)
            || self.client_busy.load(Ordering::SeqCst)
            || self.operations.load(Ordering::SeqCst) > 0
            || self.dialog.load(Ordering::SeqCst)
    }
    fn close_must_wait(&self) -> bool {
        self.operations.load(Ordering::SeqCst) > 0
            || (self.client_busy.load(Ordering::SeqCst)
                && !self.renderer_stopped.load(Ordering::SeqCst))
    }
    #[cfg(target_os = "linux")]
    fn renderer_stopped(&self) {
        if let Ok(mut gate) = self.close_gate.lock() {
            gate.renderer_stopped();
        }
        self.renderer_stopped.store(true, Ordering::SeqCst);
        self.client_busy.store(false, Ordering::SeqCst);
    }
}
struct Operation(Arc<Documents>);
impl Operation {
    fn new(docs: Arc<Documents>, installing: &AtomicBool) -> Result<Self, String> {
        // Installer sets its flag before inspecting operations. Sequential ordering
        // ensures either it sees this reservation or this reservation sees its flag.
        {
            let mut gate = docs
                .close_gate
                .lock()
                .map_err(|_| "Editor close gate unavailable")?;
            gate.reserve_authority()?;
            docs.operations.fetch_add(1, Ordering::SeqCst);
        }
        let operation = Self(docs);
        if installing.load(Ordering::SeqCst) {
            return Err("An update is installing; document operations are paused".into());
        }
        Ok(operation)
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.0.operations.fetch_sub(1, Ordering::SeqCst);
    }
}
fn operation(app: &AppHandle, docs: Arc<Documents>) -> Result<Operation, String> {
    let updates = app
        .try_state::<crate::updates::Updates>()
        .ok_or("Native update state unavailable; document operation refused")?;
    Operation::new(docs, &updates.installing)
}
pub(crate) struct Dialog(Arc<Documents>);
impl Dialog {
    pub(crate) fn acquire(docs: &Arc<Documents>) -> Result<Self, String> {
        let gate = docs
            .close_gate
            .lock()
            .map_err(|_| "Editor close gate unavailable")?;
        if gate.phase() == GuardPhase::Committing {
            return Err("Editor close commit is frozen; dialog refused".into());
        }
        if docs.dialog.swap(true, Ordering::SeqCst) {
            return Err("A native dialog is already open".into());
        }
        Ok(Self(docs.clone()))
    }
}
impl Drop for Dialog {
    fn drop(&mut self) {
        self.0.dialog.store(false, Ordering::SeqCst);
    }
}
fn editor(app: &AppHandle, window: &WebviewWindow, host: &Host) -> Result<Arc<Documents>, String> {
    authorize(window.label(), host.child)?;
    app.try_state::<Arc<Documents>>()
        .map(|d| d.inner().clone())
        .ok_or_else(|| "Native document state unavailable".into())
}
fn store(docs: &Documents) -> Result<std::sync::MutexGuard<'_, Store>, String> {
    docs.store
        .lock()
        .map_err(|_| "Document store unavailable; source retained".into())
}

/// OS authorization only: no renderer-supplied root path.
#[tauri::command]
pub async fn choose_vault(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
) -> Result<Option<VaultInfo>, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let _dialog = Dialog::acquire(&docs)?;
            let Some(selected) = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("Choose local vault")
                .blocking_pick_folder()
            else {
                return docs.activate_vault(None);
            };
            let path = selected
                .into_path()
                .map_err(|_| "Only local folders are supported")?;
            let vault = native_documents::Vault::select_authorized(&path)
                .map_err(|error| error.to_string())?;
            docs.activate_vault(Some((vault, path.to_string_lossy().into_owned())))
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (app, window, docs);
            Err("Native vaults currently require Linux".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn vault_inventory(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    vault_id: String,
) -> Result<VaultInventory, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    #[cfg(target_os = "linux")]
    let captured = docs.capture_vault(&vault_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            Ok(VaultInventory {
                vault_id: captured.info.vault_id.clone(),
                entries: captured
                    .vault
                    .inventory()
                    .map_err(|error| error.to_string())?,
            })
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (docs, vault_id);
            Err("Native vaults currently require Linux".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn open_vault_sources(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    vault_id: String,
    paths: Vec<String>,
) -> Result<VaultDocuments, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    #[cfg(target_os = "linux")]
    let captured = docs.capture_vault(&vault_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let result = store(&docs)?.open_vault(&captured.vault, &paths);
            vault_documents_outcome(captured.info.vault_id.clone(), paths, result)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (docs, vault_id, paths);
            Err("Native vaults currently require Linux".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_vault_source(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    vault_id: String,
    path: String,
    source: String,
) -> Result<VaultCreated, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    #[cfg(target_os = "linux")]
    let captured = docs.capture_vault(&vault_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let result = store(&docs)?.create_vault(&captured.vault, &path, &source);
            vault_created_outcome(captured.info.vault_id.clone(), path, result)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (docs, vault_id, path, source);
            Err("Native vaults currently require Linux".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn open_documents(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
) -> Result<Vec<Document>, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        let extensions = native_documents::source_extension_variants();
        let extension_refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
        let Some(selected) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Open documents and modules")
            .add_filter("MDX and source modules", &extension_refs)
            .blocking_pick_files()
        else {
            return Ok(Vec::new());
        };
        let paths = selected
            .into_iter()
            .map(|p| {
                p.into_path()
                    .map_err(|_| "Only local source files are supported".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let result = store(&docs)?.open(&paths).map_err(|e| e.to_string());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Only the trusted editor's OS dialog may grant a folder; no renderer path argument.
#[tauri::command]
pub async fn open_notes_folder(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
) -> Result<Vec<Document>, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        let Some(selected) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Open notes folder")
            .blocking_pick_folder()
        else {
            return Ok(Vec::new());
        };
        let path = selected
            .into_path()
            .map_err(|_| "Only local folders are supported".to_string())?;
        let result = store(&docs)?.open_folder(&path).map_err(|e| e.to_string());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_document(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    id: String,
    revision: String,
    source: String,
) -> Result<Saved, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let result = store(&docs)?
            .save(&id, &revision, &source)
            .map_err(|e| e.to_string());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_document_as(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    name: String,
    source: String,
) -> Result<Option<Document>, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    if source.len() > native_documents::MAX_SOURCE_BYTES {
        return Err("File exceeds 500 KB limit".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        let extensions = native_documents::source_extension_variants();
        let extension_refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
        let suggestion = std::path::Path::new(&name)
            .file_name().and_then(|n| n.to_str()).unwrap_or("note.mdx");
        let Some(selected) = app.dialog().file().set_parent(&window)
            .set_title("Save source as").set_file_name(suggestion)
            .add_filter("MDX and source modules", &extension_refs)
            .blocking_save_file() else { return Ok(None); };
        let path = selected.into_path().map_err(|_| "Only local source files are supported")?;
        #[cfg(target_os = "linux")]
        {
            let pending = store(&docs)?.prepare_save_as(&path).map_err(|e| e.to_string())?;
            if pending.exists() && !app.dialog()
                .message("Replace the selected file? Its current contents will be replaced by this source.")
                .title("Replace source file").parent(&window)
                .buttons(MessageDialogButtons::OkCancel).blocking_show() {
                return Ok(None);
            }
            let result = store(&docs)?.commit_save_as(pending, &source)
                .map(Some).map_err(|e| e.to_string());
            result
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = path;
            Err("Native document persistence currently requires Linux".into())
        }
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn reopen_document(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    id: String,
    revision: String,
) -> Result<Document, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let result = store(&docs)?
                .reopen(&id, &revision)
                .map_err(|e| e.to_string());
            result
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (id, revision);
            Err("Native document persistence currently requires Linux".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn close_document(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    id: String,
) -> Result<(), String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let result = store(&docs)?.close(&id).map_err(|e| e.to_string());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn confirm_discard(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
) -> Result<bool, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs.clone())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        Ok(app
            .dialog()
            .message("Discard unsaved changes to this source?")
            .title("Unsaved source")
            .parent(&window)
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn set_documents_dirty(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    dirty: bool,
    busy: bool,
) -> Result<(), String> {
    let docs = editor(&app, &window, &host)?;
    docs.dirty.store(dirty, Ordering::SeqCst);
    docs.client_busy.store(busy, Ordering::SeqCst);
    Ok(())
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorCloseState {
    version: u8,
    epoch: String,
    phase: &'static str,
    request: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EditorCloseAction {
    Cancel,
    Commit,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorCloseResolution {
    status: &'static str,
    epoch: String,
    request: String,
    reason: Option<&'static str>,
    state: EditorCloseState,
}
fn close_state(gate: &CloseGate) -> Result<EditorCloseState, String> {
    Ok(EditorCloseState {
        version: 1,
        epoch: gate
            .epoch()
            .ok_or("Editor close guard is not enabled")?
            .into(),
        phase: match gate.phase() {
            GuardPhase::Idle => "idle",
            GuardPhase::Requested => "requested",
            GuardPhase::Committing => "committing",
            GuardPhase::Uncertain => "uncertain",
        },
        request: gate.request().map(String::from),
    })
}
fn close_busy(app: &AppHandle, docs: &Documents, negotiating: bool) -> Result<GuardBusy, String> {
    let updates = app
        .try_state::<crate::updates::Updates>()
        .ok_or("Native update state unavailable; editor close refused")?;
    Ok(GuardBusy {
        operations: docs.operations.load(Ordering::SeqCst),
        dialog: docs.dialog.load(Ordering::SeqCst),
        installing: crate::editor_close::update_blocks_close(
            updates.installing.load(Ordering::SeqCst),
            updates.close_must_wait(),
            negotiating,
        ),
        renderer_stopped: docs.renderer_stopped.load(Ordering::SeqCst),
    })
}
#[tauri::command]
pub fn enable_editor_close_guard(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    version: u8,
) -> Result<EditorCloseState, String> {
    let docs = editor(&app, &window, &host)?;
    let mut gate = docs
        .close_gate
        .lock()
        .map_err(|_| "Editor close gate unavailable")?;
    let epoch = native_documents::new_vault_session_token()
        .map_err(|_| "Editor close entropy unavailable")?;
    gate.enable(version, epoch, close_busy(&app, &docs, true)?)?;
    close_state(&gate)
}
#[tauri::command]
pub fn editor_close_state(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    epoch: String,
) -> Result<EditorCloseState, String> {
    let docs = editor(&app, &window, &host)?;
    let gate = docs
        .close_gate
        .lock()
        .map_err(|_| "Editor close gate unavailable")?;
    gate.verify_epoch(&epoch)?;
    close_state(&gate)
}
#[tauri::command]
pub fn resolve_editor_close(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    epoch: String,
    request: String,
    action: EditorCloseAction,
) -> Result<EditorCloseResolution, String> {
    let docs = editor(&app, &window, &host)?;
    let mut gate = docs
        .close_gate
        .lock()
        .map_err(|_| "Editor close gate unavailable")?;
    gate.verify_epoch(&epoch)?;
    let commit = matches!(action, EditorCloseAction::Commit);
    let reason = gate
        .resolve(
            &epoch,
            &request,
            if commit {
                GuardAction::Commit
            } else {
                GuardAction::Cancel
            },
            close_busy(&app, &docs, false)?,
        )
        .err();
    let state = close_state(&gate)?;
    drop(gate);
    if reason.is_none() && commit {
        let native = window.clone();
        let held = docs.clone();
        // The permit is consumed by CloseRequested, never by destroying the window.
        if app
            .run_on_main_thread(move || {
                if native.close().is_err() {
                    if let Ok(mut gate) = held.close_gate.lock() {
                        gate.mark_uncertain();
                    }
                }
            })
            .is_err()
        {
            if let Ok(mut gate) = docs.close_gate.lock() {
                gate.mark_uncertain();
            }
            return Err("Native close dispatch is uncertain".into());
        }
    }
    Ok(EditorCloseResolution {
        status: if reason.is_some() {
            "refused"
        } else if commit {
            "committing"
        } else {
            "cancelled"
        },
        epoch,
        request,
        reason,
        state,
    })
}

/// Frontend work cannot continue after its renderer has terminated. Rust-side
/// operation counts and the last dirty-source state remain authoritative.
#[cfg(target_os = "linux")]
pub(crate) fn editor_renderer_stopped(app: &AppHandle) {
    if let Some(docs) = app.try_state::<Arc<Documents>>() {
        docs.renderer_stopped();
    }
}

pub fn close_requested(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != "editor" {
        return;
    }
    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let Some(state) = window.app_handle().try_state::<Arc<Documents>>() else {
        return;
    };
    let docs = state.inner().clone();
    {
        let Ok(mut gate) = docs.close_gate.lock() else {
            api.prevent_close();
            return;
        };
        let Ok(busy) = close_busy(window.app_handle(), &docs, false) else {
            api.prevent_close();
            return;
        };
        let request = if gate.guarded() && gate.phase() == GuardPhase::Idle {
            native_documents::new_vault_session_token().ok()
        } else {
            None
        };
        match gate.close(request, busy) {
            GuardDecision::Permit => return,
            GuardDecision::Prevent => {
                api.prevent_close();
                return;
            }
            GuardDecision::Legacy => {}
        }
    }
    let updating = window
        .app_handle()
        .try_state::<crate::updates::Updates>()
        .is_some_and(|updates| updates.close_must_wait());
    if docs.close_must_wait() || updating {
        api.prevent_close();
        let Ok(dialog) = Dialog::acquire(&docs) else {
            return;
        };
        window
            .app_handle()
            .dialog()
            .message(
                "A file or update operation is still running. Finish or cancel it before closing.",
            )
            .title("Operation in progress")
            .parent(window)
            .show(move |_| {
                let _dialog = dialog;
            });
        return;
    }
    if docs.dirty.load(Ordering::SeqCst) {
        api.prevent_close();
        let Ok(dialog) = Dialog::acquire(&docs) else {
            return;
        };
        let window = window.clone();
        window
            .app_handle()
            .dialog()
            .message("Discard unsaved changes and close Programmable Notes?")
            .title("Unsaved source")
            .parent(&window)
            .buttons(MessageDialogButtons::OkCancel)
            .show(move |confirmed| {
                let _dialog = dialog;
                if confirmed {
                    if let Ok(gate) = docs.close_gate.lock() {
                        if !gate.guarded() {
                            let _ = window.destroy();
                        }
                    }
                }
            });
    }
}

#[tauri::command]
pub async fn recovery_draft(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
    action: String,
    source: Option<String>,
    input: Option<serde_json::Value>,
    file: Option<String>,
) -> Result<serde_json::Value, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = operation(&app, docs)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let directory = root.join("recovery");
            if matches!(action.as_str(), "list" | "restore-version") {
                let recovery = native_documents::snapshots::Recovery::open_readonly(&directory)?;
                if action == "list" {
                    return match recovery {
                        Some(store) => serde_json::to_value(store.list()?).map_err(|e|e.to_string()),
                        None => Ok(serde_json::json!({"snapshots":[],"errors":[],"capacityExceeded":false})),
                    };
                }
                let store = recovery.ok_or("Recovery version is unavailable")?;
                let (snapshot, source) = store.read_version(&file.ok_or("Missing version identifier")?)?;
                return Ok(serde_json::json!({"name":snapshot.metadata.name,"source":source,"snapshot":snapshot}));
            }
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            if matches!(action.as_str(), "keep"|"restore"|"delete") {
                return serde_json::to_value(native_documents::draft::recovery_draft(&directory,&action,source.as_deref())?).map_err(|e|e.to_string());
            }
            let mut recovery = native_documents::snapshots::Recovery::open(&directory)?;
            let value = match action.as_str() {
                "append" => {
                    let input: native_documents::snapshots::Input = serde_json::from_value(input.ok_or("Missing snapshot input")?).map_err(|e|e.to_string())?;
                    serde_json::to_value(recovery.append(input)?)
                },
                "delete-version" => { recovery.remove(&file.ok_or("Missing version identifier")?)?; Ok(serde_json::Value::Null) },
                "migrate" => serde_json::to_value(recovery.migrate_legacy()?),
                _ => return Err("Unknown recovery action".into()),
            };
            value.map_err(|e:serde_json::Error|e.to_string())
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (app, action, source, input, file);
            Err("Native recovery currently requires Linux".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    struct VaultFixture(std::path::PathBuf);
    impl VaultFixture {
        fn new() -> Self {
            let root = std::path::PathBuf::from("/tmp").join(format!(
                "pn-native-vault-{}",
                native_documents::new_vault_session_token().unwrap()
            ));
            std::fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn selected(&self) -> (native_documents::Vault, String) {
            (
                native_documents::Vault::select_authorized(&self.0).unwrap(),
                self.0.display().to_string(),
            )
        }
    }
    impl Drop for VaultFixture {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }
    fn domain_refusals() -> Vec<(&'static str, native_documents::Error)> {
        vec![
            (
                "rejected",
                native_documents::Error::Rejected("private diagnostic"),
            ),
            (
                "io",
                native_documents::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "private diagnostic",
                )),
            ),
            ("conflict", native_documents::Error::Conflict),
        ]
    }

    #[test]
    fn typed_acquisition_refusals_serialize_only_original_scope_and_fixed_code() {
        for (code, error) in domain_refusals() {
            let response = vault_documents_outcome(
                "origin-vault".into(),
                vec!["notes/a.mdx".into(), "modules/B.TsX".into()],
                Err(error),
            )
            .unwrap();
            assert_eq!(
                serde_json::to_value(response).unwrap(),
                serde_json::json!({
                    "status": "refused", "vaultId": "origin-vault",
                    "paths": ["notes/a.mdx", "modules/B.TsX"], "code": code,
                })
            );
        }
        for (code, error) in domain_refusals() {
            let response =
                vault_created_outcome("origin-vault".into(), "notes/Note.MdX".into(), Err(error))
                    .unwrap();
            assert_eq!(
                serde_json::to_value(response).unwrap(),
                serde_json::json!({
                    "status": "refused", "vaultId": "origin-vault", "path": "notes/Note.MdX", "code": code,
                })
            );
        }
    }

    #[test]
    fn uncertainty_and_unknown_or_stale_grants_never_become_confirmed_refusals() {
        for error in [
            native_documents::Error::PublicationUncertain(std::io::Error::other(
                "private diagnostic",
            )),
            native_documents::Error::UnknownGrant,
            native_documents::Error::StaleRevision,
        ] {
            assert!(
                vault_documents_outcome("vault".into(), vec!["a.mdx".into()], Err(error)).is_err()
            );
        }
        for error in [
            native_documents::Error::PublicationUncertain(std::io::Error::other(
                "private diagnostic",
            )),
            native_documents::Error::UnknownGrant,
            native_documents::Error::StaleRevision,
        ] {
            assert!(vault_created_outcome("vault".into(), "a.mdx".into(), Err(error)).is_err());
        }
    }

    fn outcome_document() -> Document {
        Document {
            id: "private-grant".into(),
            revision: "disk-revision".into(),
            name: "Note.MdX".into(),
            logical_path: "notes/Note.MdX".into(),
            display_path: "/display-only/Note.MdX".into(),
            source: "\u{feff}Exact\r\n<Broken".into(),
            durability_warning: true,
        }
    }

    #[test]
    fn acquired_outcomes_preserve_exact_documents_and_durability_warnings() {
        let expected = serde_json::to_value(outcome_document()).unwrap();
        let opened = vault_documents_outcome(
            "origin-vault".into(),
            vec!["notes/Note.MdX".into()],
            Ok(vec![outcome_document()]),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(opened).unwrap(),
            serde_json::json!({
                "status": "acquired", "vaultId": "origin-vault", "documents": [expected.clone()],
            })
        );
        let created = vault_created_outcome(
            "origin-vault".into(),
            "notes/Note.MdX".into(),
            Ok(outcome_document()),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(created).unwrap(),
            serde_json::json!({
                "status": "acquired", "vaultId": "origin-vault", "document": expected,
            })
        );
    }

    #[test]
    fn actual_store_missing_open_and_collision_are_scoped_confirmed_refusals() {
        let fixture = VaultFixture::new();
        let (vault, _) = fixture.selected();
        let mut store = Store::default();
        let paths = vec!["missing.mdx".into()];
        let result = store.open_vault(&vault, &paths);
        let missing = vault_documents_outcome("origin-vault".into(), paths, result).unwrap();
        assert_eq!(
            serde_json::to_value(missing).unwrap(),
            serde_json::json!({
                "status": "refused", "vaultId": "origin-vault", "paths": ["missing.mdx"], "code": "io",
            })
        );
        let original = store
            .create_vault(&vault, "note.mdx", "original\r\n")
            .unwrap();
        let result = store.create_vault(&vault, "note.mdx", "must not overwrite");
        let collision =
            vault_created_outcome("origin-vault".into(), "note.mdx".into(), result).unwrap();
        assert_eq!(
            serde_json::to_value(collision).unwrap(),
            serde_json::json!({
                "status": "refused", "vaultId": "origin-vault", "path": "note.mdx", "code": "conflict",
            })
        );
        assert_eq!(
            std::fs::read(fixture.0.join("note.mdx")).unwrap(),
            b"original\r\n"
        );
        store
            .save(&original.id, &original.revision, "still authorized")
            .unwrap();
    }
    #[test]
    fn vault_cancellation_changes_nothing_and_replacement_preserves_captured_scope_and_grants() {
        let first = VaultFixture::new();
        let second = VaultFixture::new();
        std::fs::write(first.0.join("note.mdx"), "first").unwrap();
        std::fs::write(second.0.join("note.mdx"), "second").unwrap();
        let docs = Documents::default();
        assert!(docs.activate_vault(None).unwrap().is_none());
        assert!(docs.capture_vault("forged").is_err());
        let original = docs
            .activate_vault(Some(first.selected()))
            .unwrap()
            .unwrap();
        let captured = docs.capture_vault(&original.vault_id).unwrap();
        let opened = store(&docs)
            .unwrap()
            .open_vault(&captured.vault, &["note.mdx".into()])
            .unwrap()
            .remove(0);
        assert!(docs.activate_vault(None).unwrap().is_none());
        assert!(Arc::ptr_eq(
            &captured,
            &docs.capture_vault(&original.vault_id).unwrap()
        ));
        let replacement = docs
            .activate_vault(Some(second.selected()))
            .unwrap()
            .unwrap();
        assert_ne!(replacement.vault_id, original.vault_id);
        assert!(docs.capture_vault(&original.vault_id).is_err());
        assert!(docs.capture_vault("forged").is_err());
        assert_eq!(
            captured.vault.inventory().unwrap()[0].logical_path,
            "note.mdx"
        );
        let late = store(&docs)
            .unwrap()
            .create_vault(&captured.vault, "late.mdx", "old admitted operation")
            .unwrap();
        assert_eq!(
            std::fs::read(first.0.join("late.mdx")).unwrap(),
            b"old admitted operation"
        );
        assert!(!second.0.join("late.mdx").exists());
        store(&docs)
            .unwrap()
            .save(&opened.id, &opened.revision, "first saved after switch")
            .unwrap();
        assert_eq!(
            std::fs::read(first.0.join("note.mdx")).unwrap(),
            b"first saved after switch"
        );
        assert_eq!(std::fs::read(second.0.join("note.mdx")).unwrap(), b"second");
        store(&docs).unwrap().close(&late.id).unwrap();
    }
    #[test]
    fn captured_vault_operation_guards_survive_async_handoff_and_prevent_close_or_update() {
        let fixture = VaultFixture::new();
        let docs = Arc::new(Documents::default());
        let selected = docs
            .activate_vault(Some(fixture.selected()))
            .unwrap()
            .unwrap();
        let captured = docs.capture_vault(&selected.vault_id).unwrap();
        let operation = Operation::new(docs.clone(), &AtomicBool::new(false)).unwrap();
        let (started, wait_started) = std::sync::mpsc::channel();
        let (finish, wait_finish) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _operation = operation;
            started.send(()).unwrap();
            wait_finish
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            captured.vault.inventory().unwrap()
        });
        wait_started
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(docs.close_must_wait());
        assert!(docs.busy_for_install());
        finish.send(()).unwrap();
        assert!(worker.join().unwrap().is_empty());
        assert!(!docs.close_must_wait());
        assert!(!docs.busy_for_install());
    }
    #[test]
    fn negotiated_close_shares_operation_and_dialog_admission() {
        let docs = Arc::new(Documents::default());
        docs.close_gate
            .lock()
            .unwrap()
            .enable(1, "epoch".into(), GuardBusy::default())
            .unwrap();
        let operation = Operation::new(docs.clone(), &AtomicBool::new(false)).unwrap();
        let dialog = Dialog::acquire(&docs).unwrap();
        {
            let mut gate = docs.close_gate.lock().unwrap();
            assert_eq!(
                gate.close(Some("request".into()), GuardBusy::default()),
                GuardDecision::Prevent
            );
            assert!(gate
                .resolve(
                    "epoch",
                    "request",
                    GuardAction::Commit,
                    GuardBusy {
                        operations: docs.operations.load(Ordering::SeqCst),
                        dialog: docs.dialog.load(Ordering::SeqCst),
                        ..GuardBusy::default()
                    }
                )
                .is_err());
        }
        drop(dialog);
        drop(operation);
        docs.close_gate
            .lock()
            .unwrap()
            .resolve(
                "epoch",
                "request",
                GuardAction::Commit,
                GuardBusy::default(),
            )
            .unwrap();
        assert!(Operation::new(docs.clone(), &AtomicBool::new(false)).is_err());
        assert!(Dialog::acquire(&docs).is_err());
        assert_eq!(docs.operations.load(Ordering::SeqCst), 0);
        assert!(docs.busy_for_install());
    }
    #[test]
    fn installed_update_latch_allows_guarded_close_but_refuses_new_operations() {
        let docs = Arc::new(Documents::default());
        let updates = crate::updates::Updates::default();
        {
            let mut gate = docs.close_gate.lock().unwrap();
            gate.enable(1, "epoch".into(), GuardBusy::default())
                .unwrap();
            gate.close(Some("request".into()), GuardBusy::default());
        }
        // The returned updater future has released busy, keeping only its latch.
        updates.installing.store(true, Ordering::SeqCst);
        assert!(!updates.close_must_wait());
        assert!(Operation::new(docs.clone(), &updates.installing).is_err());
        let busy = GuardBusy {
            installing: crate::editor_close::update_blocks_close(
                updates.installing.load(Ordering::SeqCst),
                updates.close_must_wait(),
                false,
            ),
            ..GuardBusy::default()
        };
        let mut gate = docs.close_gate.lock().unwrap();
        gate.resolve("epoch", "request", GuardAction::Commit, busy)
            .unwrap();
        assert_eq!(gate.close(None, busy), GuardDecision::Permit);
    }
    #[test]
    fn native_operation_and_final_commit_cannot_both_win_admission() {
        for _ in 0..32 {
            let docs = Arc::new(Documents::default());
            {
                let mut gate = docs.close_gate.lock().unwrap();
                gate.enable(1, "epoch".into(), GuardBusy::default())
                    .unwrap();
                gate.close(Some("request".into()), GuardBusy::default());
            }
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let worker_docs = docs.clone();
            let worker_barrier = barrier.clone();
            let worker = std::thread::spawn(move || {
                worker_barrier.wait();
                Operation::new(worker_docs, &AtomicBool::new(false))
            });
            barrier.wait();
            let committed = {
                let mut gate = docs.close_gate.lock().unwrap();
                gate.resolve(
                    "epoch",
                    "request",
                    GuardAction::Commit,
                    GuardBusy {
                        operations: docs.operations.load(Ordering::SeqCst),
                        ..GuardBusy::default()
                    },
                )
                .is_ok()
            };
            let operation = worker.join().unwrap();
            assert_ne!(committed, operation.is_ok());
            drop(operation);
            assert_eq!(docs.operations.load(Ordering::SeqCst), 0);
        }
    }
    #[test]
    fn stopped_guard_retains_native_protection_and_warned_recovery_dialog() {
        let docs = Arc::new(Documents::default());
        {
            let mut gate = docs.close_gate.lock().unwrap();
            gate.enable(1, "epoch".into(), GuardBusy::default())
                .unwrap();
            gate.close(Some("request".into()), GuardBusy::default());
            gate.resolve(
                "epoch",
                "request",
                GuardAction::Commit,
                GuardBusy::default(),
            )
            .unwrap();
        }
        docs.renderer_stopped();
        assert_eq!(
            docs.close_gate.lock().unwrap().phase(),
            GuardPhase::Uncertain
        );
        assert!(docs.busy_for_install());
        assert!(Operation::new(docs.clone(), &AtomicBool::new(false)).is_err());
        let notice = Dialog::acquire(&docs)
            .expect("The existing warned force-quit notice remains available");
        assert_eq!(
            docs.close_gate
                .lock()
                .unwrap()
                .close(None, GuardBusy::default()),
            GuardDecision::Prevent
        );
        drop(notice);
    }
    #[test]
    fn poisoned_native_close_gate_refuses_admission_and_installation() {
        let docs = Arc::new(Documents::default());
        let held = docs.clone();
        assert!(std::thread::spawn(move || {
            let _gate = held.close_gate.lock().unwrap();
            panic!("synthetic poison");
        })
        .join()
        .is_err());
        assert!(docs.busy_for_install());
        assert!(Operation::new(docs.clone(), &AtomicBool::new(false)).is_err());
        assert!(Dialog::acquire(&docs).is_err());
        assert_eq!(docs.operations.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn install_flag_refuses_new_operations_and_releases_reservation() {
        let docs = Arc::new(Documents::default());
        assert!(!docs.busy_for_install());
        let installing = AtomicBool::new(true);
        assert!(Operation::new(docs.clone(), &installing).is_err());
        assert_eq!(docs.operations.load(Ordering::SeqCst), 0);
        installing.store(false, Ordering::SeqCst);
        let operation = Operation::new(docs.clone(), &installing).unwrap();
        assert!(docs.busy_for_install());
        drop(operation);
        assert!(!docs.busy_for_install());
        docs.dirty.store(true, Ordering::SeqCst);
        assert!(docs.busy_for_install());
        docs.dirty.store(false, Ordering::SeqCst);
        let dialog = Dialog::acquire(&docs).unwrap();
        assert!(docs.busy_for_install());
        drop(dialog);
        docs.client_busy.store(true, Ordering::SeqCst);
        assert!(docs.busy_for_install());
    }
    #[test]
    fn renderer_failure_invalidates_only_frontend_hints_not_native_operations_or_dirty_state() {
        let docs = Arc::new(Documents::default());
        docs.dirty.store(true, Ordering::SeqCst);
        docs.client_busy.store(true, Ordering::SeqCst);
        assert!(
            docs.close_must_wait(),
            "Healthy frontend work must protect closing"
        );
        let operation = Operation::new(docs.clone(), &AtomicBool::new(false)).unwrap();
        docs.renderer_stopped();
        docs.client_busy.store(true, Ordering::SeqCst); // A queued stale IPC hint.
        assert!(
            docs.close_must_wait(),
            "A live Rust operation still protects closing"
        );
        drop(operation);
        assert!(
            !docs.close_must_wait(),
            "A dead frontend cannot finish its stale work"
        );
        assert!(
            docs.dirty.load(Ordering::SeqCst),
            "Dirty confirmation remains required"
        );
    }
}
