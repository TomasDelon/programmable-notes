//! Native-dialog-authorized file grants. Never expose these path-taking methods as IPC.
use serde::Serialize;
use std::{
    fmt,
    path::{Path, PathBuf},
};
pub const MAX_SOURCE_BYTES: usize = 500_000;
pub const MAX_DOCUMENTS: usize = 32;
pub const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;
#[derive(Debug)]
pub enum Error {
    Rejected(&'static str),
    Io(std::io::Error),
    UnknownGrant,
    StaleRevision,
    Conflict,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rejected(message) => write!(f, "{message}"),
            Self::Io(e) => write!(f, "File operation failed: {e}"),
            Self::UnknownGrant => write!(f, "Unknown document authorization"),
            Self::StaleRevision => write!(f, "Stale document revision; reopen before saving"),
            Self::Conflict => write!(
                f,
                "File changed on disk; reopen or Save As to preserve both versions"
            ),
        }
    }
}
impl std::error::Error for Error {}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub revision: String,
    pub name: String,
    pub logical_path: String,
    pub display_path: String,
    pub source: String,
    pub durability_warning: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub revision: String,
    pub durable: bool,
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux::AuthorizedFile;
use std::collections::HashMap;
fn random_id() -> Result<String, Error> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes)
        .map_err(|_| Error::Rejected("Secure authorization entropy unavailable"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
#[cfg(target_os = "linux")]
struct Grant {
    file: AuthorizedFile,
    revision: String,
    size: usize,
    logical_path: String,
}
#[cfg(target_os = "linux")]
pub struct PendingSave {
    file: AuthorizedFile,
}
#[cfg(target_os = "linux")]
impl PendingSave {
    pub fn exists(&self) -> bool {
        self.file.snapshot.is_some()
    }
}
#[derive(Default)]
pub struct Store {
    #[cfg(target_os = "linux")]
    grants: HashMap<String, Grant>,
}
#[cfg(target_os = "linux")]
impl Store {
    fn capacity(&self, additional: usize, bytes: usize, replacing: usize) -> Result<(), Error> {
        if self.grants.len() + additional > MAX_DOCUMENTS
            || self
                .grants
                .values()
                .map(|g| g.size)
                .sum::<usize>()
                .saturating_sub(replacing)
                + bytes
                > MAX_TOTAL_BYTES
        {
            return Err(Error::Rejected(
                "Document workspace limit exceeded; close unused files",
            ));
        }
        Ok(())
    }
    pub fn open(&mut self, paths: &[PathBuf]) -> Result<Vec<Document>, Error> {
        self.capacity(paths.len(), 0, 0)?;
        let mut prepared = Vec::new();
        let mut bytes = 0;
        for path in paths {
            let (file, source) = AuthorizedFile::select(path, false)?;
            bytes += source.len();
            self.capacity(paths.len(), bytes, 0)?;
            prepared.push((random_id()?, random_id()?, file, source));
        }
        let mut common = prepared
            .first()
            .and_then(|(_, _, f, _)| f.path.parent())
            .map(Path::to_path_buf);
        for (_, _, file, _) in &prepared {
            while common
                .as_ref()
                .is_some_and(|root| !file.path.starts_with(root))
            {
                common = common.and_then(|p| p.parent().map(Path::to_path_buf));
            }
        }
        let mut documents = Vec::new();
        let mut grants = Vec::new();
        for (id, revision, file, source) in prepared {
            let name = file
                .path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            let logical_path = file
                .path
                .strip_prefix(common.as_deref().unwrap_or(Path::new("/")))
                .unwrap()
                .to_str()
                .ok_or(Error::Rejected("Selected file names must be UTF-8"))?
                .to_string();
            let d = Document {
                id: id.clone(),
                revision: revision.clone(),
                name,
                logical_path,
                display_path: file.path.to_string_lossy().into_owned(),
                source,
                durability_warning: false,
            };
            grants.push((
                id,
                Grant {
                    size: d.source.len(),
                    logical_path: d.logical_path.clone(),
                    file,
                    revision,
                },
            ));
            documents.push(d);
        }
        self.grants.extend(grants);
        Ok(documents)
    }
    pub fn save(&mut self, id: &str, revision: &str, source: &str) -> Result<Saved, Error> {
        if source.len() > MAX_SOURCE_BYTES {
            return Err(Error::Rejected("File exceeds 500 KB limit"));
        }
        let old = self.grants.get(id).ok_or(Error::UnknownGrant)?;
        if old.revision != revision {
            return Err(Error::StaleRevision);
        }
        self.capacity(0, source.len(), old.size)?;
        let next = random_id()?;
        let grant = self.grants.get_mut(id).unwrap();
        let durable = grant.file.write(source)?;
        grant.size = source.len();
        grant.revision = next.clone();
        Ok(Saved {
            revision: next,
            durable,
        })
    }
    pub fn prepare_save_as(&self, path: &Path) -> Result<PendingSave, Error> {
        self.capacity(1, 0, 0)?;
        let (file, _) = AuthorizedFile::select(path, true)?;
        Ok(PendingSave { file })
    }
    pub fn commit_save_as(
        &mut self,
        mut pending: PendingSave,
        source: &str,
    ) -> Result<Document, Error> {
        if source.len() > MAX_SOURCE_BYTES {
            return Err(Error::Rejected("File exceeds 500 KB limit"));
        }
        self.capacity(1, source.len(), 0)?;
        let id = random_id()?;
        let revision = random_id()?;
        let name = pending
            .file
            .path
            .file_name()
            .unwrap()
            .to_str()
            .ok_or(Error::Rejected("Selected file name must be UTF-8"))?
            .to_string();
        let durable = pending.file.write(source)?;
        let d = Document {
            id: id.clone(),
            revision: revision.clone(),
            logical_path: name.clone(),
            display_path: pending.file.path.to_string_lossy().into_owned(),
            name,
            source: source.into(),
            durability_warning: !durable,
        };
        self.grants.insert(
            id,
            Grant {
                file: pending.file,
                revision,
                size: source.len(),
                logical_path: d.logical_path.clone(),
            },
        );
        Ok(d)
    }
    pub fn save_as(&mut self, path: &Path, source: &str) -> Result<Document, Error> {
        let pending = self.prepare_save_as(path)?;
        if pending.exists() {
            return Err(Error::Rejected(
                "Existing Save As target requires explicit replacement confirmation",
            ));
        }
        self.commit_save_as(pending, source)
    }
    pub fn reopen(&mut self, id: &str, revision: &str) -> Result<Document, Error> {
        let grant = self.grants.get(id).ok_or(Error::UnknownGrant)?;
        if grant.revision != revision {
            return Err(Error::StaleRevision);
        }
        let (snapshot, source) = grant.file.reread()?;
        self.capacity(0, source.len(), grant.size)?;
        let next = random_id()?;
        let grant = self.grants.get_mut(id).unwrap();
        grant.file.snapshot = Some(snapshot);
        grant.size = source.len();
        grant.revision = next.clone();
        Ok(Document {
            id: id.into(),
            revision: next,
            name: grant
                .file
                .path
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .into(),
            logical_path: grant.logical_path.clone(),
            display_path: grant.file.path.to_string_lossy().into_owned(),
            source,
            durability_warning: false,
        })
    }
    pub fn close(&mut self, id: &str) -> Result<(), Error> {
        self.grants
            .remove(id)
            .map(|_| ())
            .ok_or(Error::UnknownGrant)
    }
}
#[cfg(not(target_os = "linux"))]
impl Store {
    pub fn open(&mut self, _: &[PathBuf]) -> Result<Vec<Document>, Error> {
        Err(Error::Rejected(
            "Native document persistence currently requires Linux",
        ))
    }
    pub fn save(&mut self, _: &str, _: &str, _: &str) -> Result<Saved, Error> {
        Err(Error::Rejected(
            "Native document persistence currently requires Linux",
        ))
    }
    pub fn close(&mut self, _: &str) -> Result<(), Error> {
        Err(Error::UnknownGrant)
    }
}
