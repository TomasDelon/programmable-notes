//! Native browser authority denial; install before any authored document is loaded.
use webkit2gtk::{
    FileChooserRequestExt, PermissionRequestExt, ScriptDialogType, SettingsExt, WebView, WebViewExt,
};

pub(crate) fn install(webview: &WebView) -> Result<(), &'static str> {
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
