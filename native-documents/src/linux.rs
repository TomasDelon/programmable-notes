//! Descriptor-relative Linux operations. The final pathname is never followed.
use crate::{Error, MAX_SOURCE_BYTES};
use sha2::{Digest, Sha256};
use std::{
    ffi::{CString, OsStr},
    fs::{File, Metadata, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::{
            ffi::OsStrExt,
            fs::{MetadataExt, OpenOptionsExt},
        },
    },
    path::{Path, PathBuf},
};
#[derive(Clone)]
pub(crate) struct Snapshot {
    pub metadata: Metadata,
    pub digest: [u8; 32],
}
impl Snapshot {
    fn matches(&self, other: &Self) -> bool {
        self.metadata.dev() == other.metadata.dev()
            && self.metadata.ino() == other.metadata.ino()
            && self.digest == other.digest
    }
}
pub(crate) struct AuthorizedFile {
    directory: File,
    name: CString,
    pub path: PathBuf,
    pub snapshot: Option<Snapshot>,
}
fn c_name(name: &OsStr) -> Result<CString, Error> {
    CString::new(name.as_bytes()).map_err(|_| Error::Rejected("Invalid file name"))
}
fn io_result(result: libc::c_int) -> Result<libc::c_int, Error> {
    if result < 0 {
        Err(std::io::Error::last_os_error().into())
    } else {
        Ok(result)
    }
}
fn at(
    directory: &File,
    name: &CString,
    flags: libc::c_int,
    mode: libc::mode_t,
) -> Result<File, Error> {
    // SAFETY: directory owns a live descriptor; name is NUL-terminated. A successful
    // openat returns a new owned descriptor, transferred exactly once to File.
    let fd = io_result(unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            mode,
        )
    })?;
    Ok(unsafe { File::from_raw_fd(fd) })
}
fn read(file: &mut File) -> Result<(Snapshot, String), Error> {
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(Error::Rejected("Only regular source files are supported"));
    }
    if metadata.len() > MAX_SOURCE_BYTES as u64 {
        return Err(Error::Rejected("File exceeds 500 KB limit"));
    }
    let mut bytes = Vec::new();
    file.take((MAX_SOURCE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err(Error::Rejected("File exceeds 500 KB limit"));
    }
    let after = file.metadata()?;
    if metadata.len() != after.len()
        || metadata.mtime() != after.mtime()
        || metadata.mtime_nsec() != after.mtime_nsec()
        || metadata.ctime() != after.ctime()
        || metadata.ctime_nsec() != after.ctime_nsec()
    {
        return Err(Error::Conflict);
    }
    let digest = Sha256::digest(&bytes).into();
    let source = String::from_utf8(bytes)
        .map_err(|_| Error::Rejected("File is not valid UTF-8; source was not modified"))?;
    Ok((
        Snapshot {
            metadata: after,
            digest,
        },
        source,
    ))
}
impl AuthorizedFile {
    pub fn select(path: &Path, allow_missing: bool) -> Result<(Self, String), Error> {
        if !path.is_absolute() {
            return Err(Error::Rejected(
                "Native picker must select an absolute path",
            ));
        }
        let extension = path.extension().and_then(OsStr::to_str).unwrap_or("");
        if !matches!(extension, "mdx" | "md" | "tsx" | "ts" | "jsx" | "js") {
            return Err(Error::Rejected(
                "Select a supported Markdown or source module file",
            ));
        }
        let name = path
            .file_name()
            .ok_or(Error::Rejected("Missing file name"))?;
        let parent = path
            .parent()
            .ok_or(Error::Rejected("Missing parent directory"))?
            .canonicalize()?;
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&parent)?;
        name.to_str()
            .ok_or(Error::Rejected("Selected file name must be UTF-8"))?;
        let name_c = c_name(name)?;
        let existing = at(&directory, &name_c, libc::O_RDONLY | libc::O_NONBLOCK, 0);
        let (snapshot, source) = match existing {
            Ok(mut file) => {
                let (s, t) = read(&mut file)?;
                (Some(s), t)
            }
            Err(Error::Io(e)) if allow_missing && e.kind() == std::io::ErrorKind::NotFound => {
                (None, String::new())
            }
            Err(e) => return Err(e),
        };
        Ok((
            Self {
                directory,
                name: name_c,
                path: parent.join(name),
                snapshot,
            },
            source,
        ))
    }
    pub(crate) fn reread(&self) -> Result<(Snapshot, String), Error> {
        let mut file = at(
            &self.directory,
            &self.name,
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        )?;
        read(&mut file)
    }
    fn current(&self) -> Result<(File, Snapshot), Error> {
        let mut file = at(
            &self.directory,
            &self.name,
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        )?;
        let (s, _) = read(&mut file)?;
        Ok((file, s))
    }
    pub fn write(&mut self, source: &str) -> Result<bool, Error> {
        let before = if let Some(expected) = &self.snapshot {
            let (file, now) = self.current().map_err(|_| Error::Conflict)?;
            if !expected.matches(&now) {
                return Err(Error::Conflict);
            }
            if now.metadata.uid() != unsafe { libc::geteuid() } {
                return Err(Error::Rejected("Save requires file ownership; use Save As"));
            }
            if now.metadata.mode() & 0o200 == 0 {
                return Err(Error::Rejected(
                    "File is read-only; use Save As or restore write permission",
                ));
            }
            Some((file, now))
        } else {
            None
        };
        let mut temporary = Temporary::create(&self.directory)?;
        temporary.file.write_all(source.as_bytes())?;
        if let Some((original, old)) = &before {
            // Preserve group and xattrs (including ACLs) before commit. Unsupported
            // metadata is an error, never silently stripped from the user's file.
            io_result(unsafe { libc::fchown(temporary.file.as_raw_fd(), !0, old.metadata.gid()) })?;
            copy_xattrs(original, &temporary.file)?;
            io_result(unsafe {
                libc::fchmod(temporary.file.as_raw_fd(), old.metadata.mode() & 0o777)
            })?;
        }
        temporary.file.sync_all()?;
        let committed_metadata = temporary.file.metadata()?;
        if let Some((_, old)) = &before {
            let (_, last) = self.current().map_err(|_| Error::Conflict)?;
            if !old.matches(&last)
                || old.metadata.ctime() != last.metadata.ctime()
                || old.metadata.ctime_nsec() != last.metadata.ctime_nsec()
            {
                return Err(Error::Conflict);
            }
        }
        // SAFETY: both names and directory descriptors remain live for the syscall.
        // RENAME_NOREPLACE is essential for a picker-selected absent destination.
        let flags = if self.snapshot.is_none() {
            libc::RENAME_NOREPLACE
        } else {
            0
        };
        let renamed = unsafe {
            libc::renameat2(
                self.directory.as_raw_fd(),
                temporary.name.as_ptr(),
                self.directory.as_raw_fd(),
                self.name.as_ptr(),
                flags,
            )
        };
        if renamed < 0 {
            let e = std::io::Error::last_os_error();
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                return Err(Error::Conflict);
            }
            return Err(e.into());
        }
        temporary.committed = true;
        self.snapshot = Some(Snapshot {
            metadata: committed_metadata,
            digest: Sha256::digest(source.as_bytes()).into(),
        });
        // A failed directory sync cannot undo a committed rename. Return the new
        // revision with a durability warning rather than pretending no write happened.
        Ok(self.directory.sync_all().is_ok())
    }
}
struct Temporary<'a> {
    directory: &'a File,
    name: CString,
    file: File,
    committed: bool,
}
impl<'a> Temporary<'a> {
    fn create(directory: &'a File) -> Result<Self, Error> {
        let name = CString::new(format!(".pn-save-{}", crate::random_id()?)).unwrap();
        let file = at(
            directory,
            &name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )?;
        Ok(Self {
            directory,
            name,
            file,
            committed: false,
        })
    }
}
impl Drop for Temporary<'_> {
    fn drop(&mut self) {
        if !self.committed {
            unsafe { libc::unlinkat(self.directory.as_raw_fd(), self.name.as_ptr(), 0) };
        }
    }
}
fn copy_xattrs(source: &File, target: &File) -> Result<(), Error> {
    // Linux bounds each value; additionally bound aggregate metadata allocation.
    let length = unsafe { libc::flistxattr(source.as_raw_fd(), std::ptr::null_mut(), 0) };
    if length < 0 {
        let e = std::io::Error::last_os_error();
        if e.raw_os_error() == Some(libc::ENOTSUP) {
            return Ok(());
        }
        return Err(e.into());
    }
    if length as usize > 65536 {
        return Err(Error::Rejected("File has excessive extended metadata"));
    }
    let mut names = vec![0u8; length as usize];
    let got =
        unsafe { libc::flistxattr(source.as_raw_fd(), names.as_mut_ptr().cast(), names.len()) };
    if got < 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    if got as usize > names.len() {
        return Err(Error::Conflict);
    }
    names.truncate(got as usize);
    let mut total = 0;
    for name in names.split(|b| *b == 0).filter(|n| !n.is_empty()) {
        let name = CString::new(name).unwrap();
        let size =
            unsafe { libc::fgetxattr(source.as_raw_fd(), name.as_ptr(), std::ptr::null_mut(), 0) };
        if size < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        total += size as usize;
        if total > 1024 * 1024 {
            return Err(Error::Rejected("File has excessive extended metadata"));
        }
        let mut value = vec![0u8; size as usize];
        let got = unsafe {
            libc::fgetxattr(
                source.as_raw_fd(),
                name.as_ptr(),
                value.as_mut_ptr().cast(),
                value.len(),
            )
        };
        if got < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        if got as usize > value.len() {
            return Err(Error::Conflict);
        }
        io_result(unsafe {
            libc::fsetxattr(
                target.as_raw_fd(),
                name.as_ptr(),
                value.as_ptr().cast(),
                got as usize,
                0,
            )
        })?;
    }
    Ok(())
}
