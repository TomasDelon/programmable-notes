//! One explicit OS folder selection, bounded before any grant is published.
//! Skip only real directories named .git, node_modules, or .programmable-notes.
//! Other regular non-source files are ignored; symlinks and special entries fail closed.
use crate::{linux::AuthorizedFile, Error, MAX_DOCUMENTS, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES};
use std::{
    ffi::{CStr, CString, OsStr, OsString},
    fs::{File, OpenOptions},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::{
            ffi::{OsStrExt, OsStringExt},
            fs::OpenOptionsExt,
        },
    },
    path::Path,
};
const MAX_DEPTH: usize = 16;
const MAX_ENTRIES: usize = 4096;
const MAX_RELATIVE_BYTES: usize = 4096;
fn open_at(parent: &File, name: &OsStr, flags: libc::c_int) -> Result<File, Error> {
    let name =
        CString::new(name.as_bytes()).map_err(|_| Error::Rejected("Invalid folder entry name"))?;
    // SAFETY: live parent descriptor and NUL-terminated name; successful fd becomes one File.
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}
struct Directory(*mut libc::DIR);
impl Drop for Directory {
    fn drop(&mut self) {
        unsafe {
            libc::closedir(self.0);
        }
    }
}
fn names(directory: &File, entries: &mut usize) -> Result<Vec<OsString>, Error> {
    // Open a distinct stream; dup would share the directory seek offset.
    let stream_fd = open_at(
        directory,
        OsStr::new("."),
        libc::O_RDONLY | libc::O_DIRECTORY,
    )?;
    use std::os::fd::IntoRawFd;
    let fd = stream_fd.into_raw_fd();
    let stream = unsafe { libc::fdopendir(fd) };
    if stream.is_null() {
        let error = std::io::Error::last_os_error();
        unsafe {
            libc::close(fd);
        }
        return Err(error.into());
    }
    let stream = Directory(stream);
    let mut names = Vec::new();
    loop {
        // SAFETY: a live DIR owns its descriptor; readdir data is copied before next call.
        unsafe {
            *libc::__errno_location() = 0;
        }
        let entry = unsafe { libc::readdir(stream.0) };
        if entry.is_null() {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(0) {
                return Err(error.into());
            }
            break;
        }
        let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
        if name == b"." || name == b".." {
            continue;
        }
        *entries += 1;
        if *entries > MAX_ENTRIES {
            return Err(Error::Rejected("Folder exceeds 4096 entry limit"));
        }
        names.push(OsString::from_vec(name.to_vec()));
    }
    names.sort();
    Ok(names)
}
struct Walk {
    entries: usize,
    bytes: usize,
    files: Vec<(AuthorizedFile, String)>,
}
impl Walk {
    fn visit(
        &mut self,
        directory: &File,
        root: &Path,
        relative: &Path,
        depth: usize,
    ) -> Result<(), Error> {
        for name in names(directory, &mut self.entries)? {
            let relative = relative.join(&name);
            if relative.as_os_str().as_bytes().len() > MAX_RELATIVE_BYTES {
                return Err(Error::Rejected(
                    "Folder relative path exceeds 4096 byte limit",
                ));
            }
            // O_PATH opens no device and does not follow symlinks. Classification and reads
            // refer to this pinned inode even if its directory entry changes concurrently.
            let pinned = open_at(directory, &name, libc::O_PATH)?;
            let metadata = pinned.metadata()?;
            if metadata.is_dir() {
                if [".git", "node_modules", ".programmable-notes"]
                    .iter()
                    .any(|skip| name == OsStr::new(skip))
                {
                    continue;
                }
                if depth >= MAX_DEPTH {
                    return Err(Error::Rejected("Folder exceeds 16 directory depth limit"));
                }
                // Reopen our pinned directory for iteration, not the mutable entry name.
                let child = OpenOptions::new()
                    .read(true)
                    .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC)
                    .open(format!("/proc/self/fd/{}", pinned.as_raw_fd()))?;
                self.visit(&child, root, &relative, depth + 1)?;
            } else if metadata.is_file() {
                if !relative
                    .extension()
                    .and_then(OsStr::to_str)
                    .is_some_and(crate::supported_source_extension)
                {
                    continue;
                }
                relative
                    .to_str()
                    .ok_or(Error::Rejected("Folder source paths must be UTF-8"))?;
                if self.files.len() >= MAX_DOCUMENTS {
                    return Err(Error::Rejected("Folder exceeds 32 source file limit"));
                }
                if metadata.len() > MAX_SOURCE_BYTES as u64 {
                    return Err(Error::Rejected("File exceeds 500 KB limit"));
                }
                let (file, source) = AuthorizedFile::select_anchored(
                    directory.try_clone()?,
                    &name,
                    root.join(relative),
                    pinned,
                )?;
                self.bytes += source.len();
                if self.bytes > MAX_TOTAL_BYTES {
                    return Err(Error::Rejected("Folder exceeds 8 MiB source limit"));
                }
                self.files.push((file, source));
            } else {
                return Err(Error::Rejected(
                    "Folder contains a symbolic link or special file",
                ));
            }
        }
        Ok(())
    }
}
pub(crate) fn collect(root: &Path) -> Result<Vec<(AuthorizedFile, String)>, Error> {
    if !root.is_absolute()
        || root
            .as_os_str()
            .as_bytes()
            .split(|b| *b == b'/')
            .any(|part| part == b"." || part == b"..")
    {
        return Err(Error::Rejected(
            "Select an absolute folder without traversal components",
        ));
    }
    let mut directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open("/")?;
    for component in root.components() {
        if let std::path::Component::Normal(name) = component {
            directory = open_at(&directory, name, libc::O_RDONLY | libc::O_DIRECTORY)?;
        }
    }
    let mut walk = Walk {
        entries: 0,
        bytes: 0,
        files: Vec::new(),
    };
    walk.visit(&directory, root, Path::new(""), 0)?;
    Ok(walk.files)
}
