//! Immutable recovery records. No original paths or reusable grants are stored.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ffi::CString,
    fs::{self, DirBuilder, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    },
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_VERSIONS: usize = 5;
pub const MAX_RECORDS: usize = 64;
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = crate::MAX_SOURCE_BYTES + 2048;
const MAGIC: &[u8] = b"PNRECOVERY1\n";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub document_id: String,
    pub name: String,
    pub baseline: Option<String>,
    pub parent: Option<String>,
    pub source: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metadata {
    pub schema: u32,
    pub document_id: String,
    pub name: String,
    pub baseline: Option<String>,
    pub parent: Option<String>,
    pub generation: u64,
    pub created_at_ms: u64,
    pub source_bytes: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Header {
    metadata: Metadata,
    digest: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Snapshot {
    pub file: String,
    pub id: String,
    pub metadata: Metadata,
}
#[derive(Debug, Serialize)]
pub struct RecordError {
    pub file: String,
    pub message: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub capacity_exceeded: bool,
    pub snapshots: Vec<Snapshot>,
    pub errors: Vec<RecordError>,
}
#[derive(Debug, Serialize)]
pub struct Written {
    pub snapshot: Snapshot,
    pub durable: bool,
    pub warning: Option<String>,
}

pub struct Recovery {
    directory: File,
    _lock: Option<File>,
    maintenance_warning: Option<String>,
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn valid_name(name: &str) -> bool {
    name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && name.chars().all(|c| !c.is_control())
        && name.rsplit_once('.').is_some_and(|(stem, extension)| {
            !stem.is_empty() && matches!(extension, "md" | "mdx" | "tsx" | "ts" | "jsx" | "js")
        })
}
fn record_name(name: &str) -> bool {
    let parts: Vec<_> = name
        .strip_suffix(".pnrec")
        .unwrap_or("")
        .split('-')
        .collect();
    parts.len() == 3
        && valid_hex(parts[0], 32)
        && parts[1].len() == 20
        && parts[1].bytes().all(|b| b.is_ascii_digit())
        && valid_hex(parts[2], 64)
}
fn file_name(metadata: &Metadata, digest: &str) -> String {
    format!(
        "{}-{:020}-{digest}.pnrec",
        metadata.document_id, metadata.generation
    )
}
fn digest(metadata: &Metadata, source: &str) -> Result<String, String> {
    let mut hash = Sha256::new();
    hash.update(MAGIC);
    hash.update(serde_json::to_vec(metadata).map_err(|e| e.to_string())?);
    hash.update([0]);
    hash.update(source.as_bytes());
    Ok(hex(&hash.finalize()))
}
fn io(result: libc::c_int) -> Result<libc::c_int, String> {
    if result < 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(result)
    }
}
fn private(file: &File) -> Result<(), String> {
    let m = file.metadata().map_err(|e| e.to_string())?;
    if !m.is_file()
        || m.uid() != unsafe { libc::geteuid() }
        || m.mode() & 0o077 != 0
        || m.nlink() != 1
    {
        return Err("Recovery files must be private, owned, regular and single-link".into());
    }
    Ok(())
}
impl Recovery {
    pub fn open(path: &Path) -> Result<Self, String> {
        match DirBuilder::new().mode(0o700).create(path) {
            Ok(()) => File::open(path.parent().ok_or("Missing recovery parent")?)
                .and_then(|f| f.sync_all())
                .map_err(|e| e.to_string())?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.to_string()),
        }
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)
            .map_err(|e| e.to_string())?;
        let m = directory.metadata().map_err(|e| e.to_string())?;
        if m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o077 != 0 {
            return Err("Recovery directory must be private and owned".into());
        }
        let mut store = Self {
            directory,
            _lock: None,
            maintenance_warning: None,
        };
        let lock = store.at(
            ".lock",
            libc::O_RDWR | libc::O_CREAT | libc::O_NONBLOCK,
            0o600,
        )?;
        private(&lock)?;
        io(unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) })
            .map_err(|_| "Recovery is busy in another operation".to_string())?;
        store._lock = Some(lock);
        store.maintenance_warning = store.cleanup().and_then(|_| store.repair_retention()).err();
        Ok(store)
    }
    fn at(&self, name: &str, flags: i32, mode: u32) -> Result<File, String> {
        let name = CString::new(name).map_err(|_| "Invalid recovery name")?;
        let fd = io(unsafe {
            libc::openat(
                self.directory.as_raw_fd(),
                name.as_ptr(),
                flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                mode,
            )
        })?;
        Ok(unsafe { File::from_raw_fd(fd) })
    }
    fn names(&self) -> Result<Vec<String>, String> {
        let mut names = Vec::new();
        for item in fs::read_dir(format!("/proc/self/fd/{}", self.directory.as_raw_fd()))
            .map_err(|e| e.to_string())?
        {
            let name = item
                .map_err(|e| e.to_string())?
                .file_name()
                .into_string()
                .map_err(|_| "Invalid recovery file name")?;
            names.push(name);
            if names.len() > 256 {
                return Err("Too many recovery directory entries".into());
            }
        }
        names.sort();
        Ok(names)
    }
    fn unlink(&self, name: &str) -> Result<(), String> {
        let name = CString::new(name).map_err(|_| "Invalid recovery name")?;
        io(unsafe { libc::unlinkat(self.directory.as_raw_fd(), name.as_ptr(), 0) }).map(|_| ())
    }
    fn read(&self, name: &str, limit: usize) -> Result<Vec<u8>, String> {
        let file = self.at(name, libc::O_RDONLY | libc::O_NONBLOCK, 0)?;
        private(&file)?;
        if file.metadata().map_err(|e| e.to_string())?.len() > limit as u64 {
            return Err("Recovery record exceeds size limit".into());
        }
        let mut bytes = Vec::new();
        file.take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > limit {
            return Err("Recovery record exceeds size limit".into());
        }
        Ok(bytes)
    }
    fn cleanup(&self) -> Result<(), String> {
        let mut removed = false;
        for name in self.names()? {
            if name
                .strip_prefix(".pending-")
                .or_else(|| name.strip_prefix(".pn-save-"))
                .is_some_and(|id| valid_hex(id, 32))
            {
                private(&self.at(&name, libc::O_RDONLY | libc::O_NONBLOCK, 0)?)?;
                self.unlink(&name)?;
                removed = true;
            }
        }
        if removed {
            self.directory.sync_all().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn record(&self, name: &str) -> Result<(Snapshot, String), String> {
        if !record_name(name) {
            return Err("Invalid recovery record identifier".into());
        }
        let bytes = self.read(name, MAX_RECORD_BYTES)?;
        let rest = bytes.strip_prefix(MAGIC).ok_or("Invalid recovery format")?;
        let split = rest
            .iter()
            .position(|b| *b == b'\n')
            .ok_or("Truncated recovery header")?;
        if split > 2048 {
            return Err("Recovery header exceeds size limit".into());
        }
        let header: Header =
            serde_json::from_slice(&rest[..split]).map_err(|_| "Invalid recovery metadata")?;
        let m = &header.metadata;
        if m.schema != 1
            || m.generation == 0
            || !valid_hex(&m.document_id, 32)
            || !valid_name(&m.name)
            || m.baseline.as_ref().is_some_and(|id| !valid_hex(id, 64))
            || m.parent.as_ref().is_some_and(|id| !valid_hex(id, 64))
            || m.source_bytes > crate::MAX_SOURCE_BYTES
            || file_name(m, &header.digest) != name
        {
            return Err("Invalid recovery metadata or filename mismatch".into());
        }
        let source =
            std::str::from_utf8(&rest[split + 1..]).map_err(|_| "Recovery source is not UTF-8")?;
        if source.len() != m.source_bytes || digest(m, source)? != header.digest {
            return Err("Recovery integrity check failed".into());
        }
        Ok((
            Snapshot {
                file: name.into(),
                id: header.digest,
                metadata: header.metadata,
            },
            source.into(),
        ))
    }
    pub fn list(&self) -> Result<Inventory, String> {
        let mut inventory = Inventory {
            capacity_exceeded: false,
            snapshots: Vec::new(),
            errors: Vec::new(),
        };
        let mut bytes = 0usize;
        for name in self.names()? {
            if matches!(name.as_str(), ".lock" | "recovered.mdx") {
                continue;
            }
            match self.record(&name) {
                Ok((snapshot, _)) => {
                    bytes = bytes.saturating_add(
                        self.at(&name, libc::O_RDONLY | libc::O_NONBLOCK, 0)?
                            .metadata()
                            .map_err(|e| e.to_string())?
                            .len() as usize,
                    );
                    inventory.snapshots.push(snapshot);
                }
                Err(message) => inventory.errors.push(RecordError {
                    file: name,
                    message,
                }),
            }
        }
        inventory.capacity_exceeded =
            inventory.snapshots.len() > MAX_RECORDS + 1 || bytes > MAX_BYTES + MAX_RECORD_BYTES;
        inventory.snapshots.sort_by(|a, b| {
            a.metadata
                .document_id
                .cmp(&b.metadata.document_id)
                .then(b.metadata.generation.cmp(&a.metadata.generation))
                .then(a.id.cmp(&b.id))
        });
        for pair in inventory.snapshots.windows(2) {
            if pair[0].metadata.document_id == pair[1].metadata.document_id
                && pair[0].metadata.generation == pair[1].metadata.generation
            {
                inventory.errors.push(RecordError {
                    file: pair[0].file.clone(),
                    message: "Ambiguous duplicate recovery generation".into(),
                });
            }
        }
        if let Some(message) = &self.maintenance_warning {
            inventory.errors.push(RecordError {
                file: String::new(),
                message: message.clone(),
            });
        }
        Ok(inventory)
    }
    fn repair_retention(&self) -> Result<(), String> {
        let inventory = self.list()?;
        // A damaged/ambiguous inventory must never authorize automatic deletion.
        if !inventory.errors.is_empty() {
            return Ok(());
        }
        let mut obsolete = Vec::new();
        let mut current = "";
        let mut count = 0;
        for snapshot in &inventory.snapshots {
            if current != snapshot.metadata.document_id {
                current = &snapshot.metadata.document_id;
                count = 0;
            }
            count += 1;
            if count > MAX_VERSIONS {
                obsolete.push(&snapshot.file);
            }
        }
        if !obsolete.is_empty() {
            // Complete the interrupted publication's durability barrier before pruning.
            self.directory.sync_all().map_err(|e| e.to_string())?;
            for file in obsolete {
                self.unlink(file)?;
            }
            self.directory.sync_all().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn migrate_legacy(&mut self) -> Result<Option<Snapshot>, String> {
        if !self.names()?.iter().any(|name| name == "recovered.mdx") {
            return Ok(None);
        }
        let bytes = self.read("recovered.mdx", crate::MAX_SOURCE_BYTES)?;
        let source = String::from_utf8(bytes).map_err(|_| "Legacy recovery source is not UTF-8")?;
        let identity =
            hex(&Sha256::digest(b"programmable-notes:legacy-recovery-v1"))[..32].to_string();
        let inventory = self.list()?;
        let versions: Vec<_> = inventory
            .snapshots
            .iter()
            .filter(|s| s.metadata.document_id == identity)
            .collect();
        if !versions.is_empty() {
            for snapshot in versions {
                if self.restore(&snapshot.file)? == source {
                    return Ok(Some(snapshot.clone()));
                }
            }
            return Err(
                "Legacy recovery differs from migrated versions; both were retained".into(),
            );
        }
        let written = self.append(Input {
            document_id: identity,
            name: "recovered.mdx".into(),
            baseline: None,
            parent: None,
            source,
        })?;
        if !written.durable {
            return Err("Legacy copy retained; migration durability is uncertain".into());
        }
        Ok(Some(written.snapshot))
    }
    pub fn restore(&self, file: &str) -> Result<String, String> {
        self.record(file).map(|(_, source)| source)
    }
    pub fn remove(&mut self, file: &str) -> Result<(), String> {
        if !record_name(file) {
            return Err("Invalid recovery record identifier".into());
        }
        private(&self.at(file, libc::O_RDONLY | libc::O_NONBLOCK, 0)?)?;
        self.unlink(file)?;
        self.directory.sync_all().map_err(|e| e.to_string())
    }
    pub fn append(&mut self, input: Input) -> Result<Written, String> {
        if !valid_hex(&input.document_id, 32)
            || !valid_name(&input.name)
            || input.source.len() > crate::MAX_SOURCE_BYTES
            || input.baseline.as_ref().is_some_and(|id| !valid_hex(id, 64))
            || input.parent.as_ref().is_some_and(|id| !valid_hex(id, 64))
        {
            return Err("Invalid recovery input or source exceeds 500 KB".into());
        }
        let inventory = self.list()?;
        if !inventory.errors.is_empty() {
            return Err("Recovery has damaged or ambiguous records; restore valid versions or explicitly remove damaged records first".into());
        }
        if inventory.capacity_exceeded {
            return Err("Recovery storage is full; valid records remain available for restore or explicit deletion".into());
        }
        let versions: Vec<_> = inventory
            .snapshots
            .iter()
            .filter(|s| s.metadata.document_id == input.document_id)
            .collect();
        let head = versions.first().copied();
        if head.map(|s| &s.id) != input.parent.as_ref() {
            return Err("Recovery revision conflict; refresh snapshots before retrying".into());
        }
        if let Some(head) = head {
            if head.metadata.name == input.name
                && head.metadata.baseline == input.baseline
                && self.restore(&head.file)? == input.source
            {
                return Ok(Written {
                    snapshot: head.clone(),
                    durable: self.directory.sync_all().is_ok(),
                    warning: None,
                });
            }
        }
        let metadata = Metadata {
            schema: 1,
            document_id: input.document_id,
            name: input.name,
            baseline: input.baseline,
            parent: input.parent,
            generation: head.map_or(Ok(1), |s| {
                s.metadata
                    .generation
                    .checked_add(1)
                    .ok_or("Recovery generation exhausted")
            })?,
            created_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis()
                .try_into()
                .map_err(|_| "Invalid clock")?,
            source_bytes: input.source.len(),
        };
        let id = digest(&metadata, &input.source)?;
        let header = serde_json::to_vec(&Header {
            metadata: metadata.clone(),
            digest: id.clone(),
        })
        .map_err(|e| e.to_string())?;
        let mut bytes = MAGIC.to_vec();
        bytes.extend(header);
        bytes.push(b'\n');
        bytes.extend(input.source.as_bytes());
        if bytes.len() > MAX_RECORD_BYTES {
            return Err("Recovery record exceeds size limit".into());
        }
        let obsolete: Vec<_> = versions.iter().skip(MAX_VERSIONS - 1).copied().collect();
        let sizes = |s: &Snapshot| {
            self.at(&s.file, libc::O_RDONLY | libc::O_NONBLOCK, 0)
                .and_then(|f| {
                    f.metadata()
                        .map(|m| m.len() as usize)
                        .map_err(|e| e.to_string())
                })
        };
        let used = inventory
            .snapshots
            .iter()
            .map(sizes)
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum::<usize>();
        let reclaimed = obsolete
            .iter()
            .map(|s| sizes(s))
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum::<usize>();
        if inventory.snapshots.len() + 1 > MAX_RECORDS + 1
            || inventory.snapshots.len() + 1 - obsolete.len() > MAX_RECORDS
            || used + bytes.len() - reclaimed > MAX_BYTES
            || used + bytes.len() > MAX_BYTES + MAX_RECORD_BYTES
        {
            return Err("Recovery storage is full; previous snapshots retained".into());
        }
        let temporary = format!(
            ".pending-{}",
            crate::random_id().map_err(|e| e.to_string())?
        );
        let file = file_name(&metadata, &id);
        let publish = (|| {
            let mut output = self.at(
                &temporary,
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                0o600,
            )?;
            output.write_all(&bytes).map_err(|e| e.to_string())?;
            output.sync_all().map_err(|e| e.to_string())?;
            let from = CString::new(temporary.as_str()).unwrap();
            let to = CString::new(file.as_str()).unwrap();
            io(unsafe {
                libc::renameat2(
                    self.directory.as_raw_fd(),
                    from.as_ptr(),
                    self.directory.as_raw_fd(),
                    to.as_ptr(),
                    libc::RENAME_NOREPLACE,
                )
            })?;
            Ok::<(), String>(())
        })();
        if let Err(error) = publish {
            let _ = self.unlink(&temporary);
            return Err(error);
        }
        let snapshot = Snapshot { file, id, metadata };
        if let Err(error) = self.directory.sync_all() {
            return Ok(Written {
                snapshot,
                durable: false,
                warning: Some(format!("Published but durability uncertain: {error}")),
            });
        }
        let prune = (|| {
            for previous in obsolete {
                self.unlink(&previous.file)?;
            }
            self.directory.sync_all().map_err(|e| e.to_string())
        })();
        Ok(Written {
            snapshot,
            durable: true,
            warning: prune
                .err()
                .map(|e| format!("Snapshot saved; retention cleanup failed: {e}")),
        })
    }
}
