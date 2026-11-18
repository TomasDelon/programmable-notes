//! One private recovery copy. It never carries an original path or file grant.
use crate::Store;
use std::{
    fs::{self, DirBuilder},
    io::ErrorKind,
    os::unix::fs::{DirBuilderExt, MetadataExt},
    path::Path,
};

pub fn recovery_draft(
    directory: &Path,
    action: &str,
    source: Option<&str>,
) -> Result<Option<String>, String> {
    match DirBuilder::new().mode(0o700).create(directory) {
        Ok(()) => {
            let parent = directory
                .parent()
                .ok_or("Recovery directory needs a parent")?;
            fs::File::open(parent)
                .and_then(|dir| dir.sync_all())
                .map_err(|error| error.to_string())?;
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.to_string()),
    }
    let metadata = fs::symlink_metadata(directory).map_err(|e| e.to_string())?;
    if !metadata.is_dir()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o077 != 0
    {
        return Err("Recovery directory must be private and owned by the editor user".into());
    }
    let path = directory.join("recovered.mdx");
    let mut store = Store::default();
    match action {
        "keep" => {
            let pending = store.prepare_save_as(&path).map_err(|e| e.to_string())?;
            if pending.exists() {
                return Err("A recovery draft already exists".into());
            }
            let draft = store
                .commit_save_as(pending, source.ok_or("Missing draft text")?)
                .map_err(|e| e.to_string())?;
            if draft.durability_warning {
                return Err(
                    "Draft was written, but crash durability could not be confirmed".into(),
                );
            }
            Ok(None)
        }
        "restore" => match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
            Ok(_) => store
                .open(&[path])
                .map(|mut docs| docs.pop().map(|doc| doc.source))
                .map_err(|e| e.to_string()),
        },
        "delete" => {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
            fs::File::open(directory)
                .and_then(|dir| dir.sync_all())
                .map_err(|e| e.to_string())?;
            Ok(None)
        }
        _ => Err("Unknown draft action".into()),
    }
}
