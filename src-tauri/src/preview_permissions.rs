//! Deny native browser authority before assigning any authored iframe document.
use crate::preview_activation::{trusted_shell, Activation};
use std::sync::{Arc, Once};
use tauri::{Manager, WebviewWindow};
use webkit2gtk::{
    FileChooserRequestExt, PermissionRequestExt, ScriptDialogType, SettingsExt, WebView, WebViewExt,
};

const ASSIGNMENT_PREFIX: &str = r#"(()=>{const expectedLocation = "#;
const ASSIGNMENT_MIDDLE: &str = r#";const iframe = document.querySelector('iframe');if(location.href !== expectedLocation || !iframe || iframe.getAttribute('sandbox') !== 'allow-scripts'){throw new Error('preview_publication_refused');}iframe.srcdoc = "#;
const ASSIGNMENT_SUFFIX: &str = r#";})()"#;

fn assignment(html: &str, expected_location: &str) -> Result<String, serde_json::Error> {
    Ok(format!(
        "{}{}{}{}{}",
        ASSIGNMENT_PREFIX,
        serde_json::to_string(expected_location)?,
        ASSIGNMENT_MIDDLE,
        serde_json::to_string(html)?,
        ASSIGNMENT_SUFFIX
    ))
}

fn install(webview: &WebView) -> Result<(), &'static str> {
    let settings = webview.settings().ok_or("Preview settings unavailable")?;
    settings.set_enable_fullscreen(false);
    if settings.enables_fullscreen() {
        return Err("Preview fullscreen could not be disabled");
    }
    webview.connect_run_file_chooser(|_, request| {
        request.cancel();
        true
    });
    webview.connect_permission_request(|_, request| {
        // Include unknown request subclasses: no browser permission is delegated.
        request.deny();
        true
    });
    webview.connect_print(|_, _| true);
    webview.connect_enter_fullscreen(|_| true);
    webview.connect_leave_fullscreen(|_| true);
    webview.connect_script_dialog(|_, dialog| {
        if matches!(
            dialog.dialog_type(),
            ScriptDialogType::Confirm | ScriptDialogType::BeforeUnloadConfirm
        ) {
            dialog.confirm_set_confirmed(false);
        }
        // Keep the borrowed dialog unretained. WebKit closes it on its last unref
        // after signal dispatch; an unset prompt result means cancellation.
        // Synchronous close here would clear WebKit's current dialog mid-dispatch.
        true
    });
    Ok(())
}

pub fn activate(
    window: &WebviewWindow,
    child: bool,
    activation: Arc<Activation>,
    renderer_hook: Arc<Once>,
    html: Option<String>,
) -> tauri::Result<()> {
    let eligible = child && window.label() == "preview";
    let app = window.app_handle().clone();
    window.with_webview(move |platform| {
        let webview = platform.inner();
        let location = webview.uri();
        let trusted = eligible
            && location
                .as_ref()
                .is_some_and(|url| trusted_shell(url.as_str(), cfg!(feature = "custom-protocol")));
        let outcome: Result<bool, &'static str> = activation.run(
            trusted,
            || {
                install(&webview)?;
                crate::preview_failure::install_on_webview(&webview, app.clone(), &renderer_hook);
                Ok(())
            },
            || {
                // Probe children install identical guards without acquiring a payload.
                let Some(html) = html.as_deref() else {
                    return Ok(());
                };
                let script = assignment(html, location.as_deref().ok_or("location")?)
                    .map_err(|_| "serialization")?;
                let failed = app.clone();
                webview.run_javascript(
                    &script,
                    None::<&webkit2gtk::gio::Cancellable>,
                    move |result| {
                        if result.is_err() {
                            eprintln!("NATIVE_PREVIEW_ACTIVATION_FAILED reason=assignment");
                            failed.exit(1);
                        }
                    },
                );
                Ok(())
            },
        );
        if let Err(reason) = outcome {
            eprintln!("NATIVE_PREVIEW_ACTIVATION_FAILED reason={reason}");
            app.exit(1);
        }
    })
}
