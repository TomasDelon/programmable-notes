fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_preview",
            "stop_preview",
            "host_probe",
            "open_documents",
            "save_document",
            "save_document_as",
            "reopen_document",
            "close_document",
            "confirm_discard",
            "set_documents_dirty",
            "recovery_draft",
        ]),
    ))
    .expect("Tauri ACL/configuration build failed");
}
