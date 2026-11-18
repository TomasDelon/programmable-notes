//! Only this editor-side module turns native picker selections into file grants.
use crate::Host;
use native_documents::{Document, Saved, Store};
use preview_policy::authorize;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[derive(Default)]
pub struct Documents {
    store: Mutex<Store>,
    pub dirty: AtomicBool,
    pub client_busy: AtomicBool,
    pub operations: AtomicUsize,
    dialog: AtomicBool,
}
struct Operation(Arc<Documents>);
impl Operation {
    fn new(docs: Arc<Documents>) -> Self {
        docs.operations.fetch_add(1, Ordering::SeqCst);
        Self(docs)
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.0.operations.fetch_sub(1, Ordering::SeqCst);
    }
}
struct Dialog(Arc<Documents>);
impl Dialog {
    fn acquire(docs: &Arc<Documents>) -> Result<Self, String> {
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
#[tauri::command]
pub async fn open_documents(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<'_, Host>,
) -> Result<Vec<Document>, String> {
    let docs = editor(&app, &window, &host)?;
    let operation = Operation::new(docs.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        let Some(selected) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Open documents and modules")
            .add_filter(
                "MDX and source modules",
                &["mdx", "md", "tsx", "ts", "jsx", "js"],
            )
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
    let operation = Operation::new(docs.clone());
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
    let operation = Operation::new(docs.clone());
    if source.len() > native_documents::MAX_SOURCE_BYTES {
        return Err("File exceeds 500 KB limit".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let _dialog = Dialog::acquire(&docs)?;
        let suggestion = std::path::Path::new(&name)
            .file_name().and_then(|n| n.to_str()).unwrap_or("note.mdx");
        let Some(selected) = app.dialog().file().set_parent(&window)
            .set_title("Save source as").set_file_name(suggestion)
            .add_filter("MDX and source modules", &["mdx", "md", "tsx", "ts", "jsx", "js"])
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
    let operation = Operation::new(docs.clone());
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
    tauri::async_runtime::spawn_blocking(move || {
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
    tauri::async_runtime::spawn_blocking(move || {
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
    if docs.operations.load(Ordering::SeqCst) > 0 || docs.client_busy.load(Ordering::SeqCst) {
        api.prevent_close();
        let Ok(dialog) = Dialog::acquire(&docs) else {
            return;
        };
        window
            .app_handle()
            .dialog()
            .message("A file operation is still running. Finish or cancel it before closing.")
            .title("File operation in progress")
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
                    let _ = window.destroy();
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
    let operation = Operation::new(docs);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        #[cfg(target_os = "linux")]
        {
            let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let directory = root.join("recovery");
            if matches!(action.as_str(), "keep"|"restore"|"delete") {
                return serde_json::to_value(native_documents::draft::recovery_draft(&directory,&action,source.as_deref())?).map_err(|e|e.to_string());
            }
            let mut recovery = native_documents::snapshots::Recovery::open(&directory)?;
            let value = match action.as_str() {
                "list" => serde_json::to_value(recovery.list()?),
                "append" => {
                    let input: native_documents::snapshots::Input = serde_json::from_value(input.ok_or("Missing snapshot input")?).map_err(|e|e.to_string())?;
                    serde_json::to_value(recovery.append(input)?)
                },
                "restore-version" => {
                    let file = file.ok_or("Missing version identifier")?;
                    let snapshot = recovery.list()?.snapshots.into_iter().find(|s|s.file == file).ok_or("Recovery version is unavailable or damaged")?;
                    Ok(serde_json::json!({"name":snapshot.metadata.name,"source":recovery.restore(&file)?}))
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
