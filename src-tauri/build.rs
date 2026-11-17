fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["start_preview", "stop_preview", "host_probe"]),
    ))
    .expect("Tauri ACL/configuration build failed");
}
