fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_preview",
            "stop_preview",
            "preview_connection_active",
            "host_probe",
            "open_documents",
            "open_notes_folder",
            "choose_vault",
            "vault_inventory",
            "open_vault_sources",
            "create_vault_source",
            "desktop_update_check",
            "desktop_update_install",
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
