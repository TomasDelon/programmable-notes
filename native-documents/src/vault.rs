//! One explicit OS folder selection, bounded before any grant is published.
//! Skip only real directories named .git, node_modules, or .programmable-notes.
//! Other regular non-source files are ignored; symlinks and special entries fail closed.
use crate::{
    linux::AuthorizedFile, Error, InventoryEntry, MAX_DOCUMENTS, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES,
};
use std::{
    collections::HashSet,
    ffi::{CStr, CString, OsStr, OsString},
    fs::{File, OpenOptions},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::{
            ffi::{OsStrExt, OsStringExt},
            fs::OpenOptionsExt,
        },
    },
    path::{Path, PathBuf},
};
const MAX_DEPTH: usize = 16;
const MAX_ENTRIES: usize = 4096;
const MAX_RELATIVE_BYTES: usize = 4096;
const EXCLUDED_DIRECTORIES: [&str; 3] = [".git", "node_modules", ".programmable-notes"];

pub(crate) fn validate_source_path(path: &str) -> Result<(), Error> {
    if path.is_empty()
        || path.len() > MAX_RELATIVE_BYTES
        || path.contains(['\0', '\\'])
        || Path::new(path).is_absolute()
        || path.split('/').any(|part| {
            part.is_empty() || part == "." || part == ".." || EXCLUDED_DIRECTORIES.contains(&part)
        })
        || path.split('/').count() > MAX_DEPTH + 1
        || !Path::new(path)
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(crate::supported_source_extension)
    {
        return Err(Error::Rejected("Unsupported vault source path"));
    }
    Ok(())
}

pub(crate) fn validate_source_paths(paths: &[String]) -> Result<(), Error> {
    let mut unique = HashSet::new();
    for path in paths {
        validate_source_path(path)?;
        if !unique.insert(path) {
            return Err(Error::Rejected("Duplicate vault source path"));
        }
    }
    Ok(())
}
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
}
struct SourceEntry<'a> {
    directory: &'a File,
    name: &'a OsStr,
    logical_path: &'a str,
    pinned: File,
    bytes: u64,
}
impl Walk {
    fn visit(
        &mut self,
        directory: &File,
        relative: &Path,
        depth: usize,
        source: &mut impl FnMut(SourceEntry<'_>) -> Result<(), Error>,
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
                if EXCLUDED_DIRECTORIES
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
                self.visit(&child, &relative, depth + 1, source)?;
            } else if metadata.is_file() {
                if !relative
                    .extension()
                    .and_then(OsStr::to_str)
                    .is_some_and(crate::supported_source_extension)
                {
                    continue;
                }
                let logical_path = relative
                    .to_str()
                    .ok_or(Error::Rejected("Folder source paths must be UTF-8"))?;
                source(SourceEntry {
                    directory,
                    name: &name,
                    logical_path,
                    pinned,
                    bytes: metadata.len(),
                })?;
            } else {
                return Err(Error::Rejected(
                    "Folder contains a symbolic link or special file",
                ));
            }
        }
        Ok(())
    }
}
fn select_root(root: &Path) -> Result<File, Error> {
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
    Ok(directory)
}

/// Trusted-host directory capability, never constructed from document runtime input.
pub struct Vault {
    directory: File,
    // Original selection spelling is a label only; it may become stale after a rename.
    display_root: PathBuf,
}
impl Vault {
    /// Call only after OS folder authorization; never expose this path-taking API as IPC.
    pub fn select_authorized(root: &Path) -> Result<Self, Error> {
        Ok(Self {
            directory: select_root(root)?,
            display_root: root.to_path_buf(),
        })
    }

    /// Metadata is observational, not an atomic snapshot or authority to open/write a path.
    /// Only the root descriptor is retained; source payloads and file grants are not opened.
    pub fn inventory(&self) -> Result<Vec<InventoryEntry>, Error> {
        let mut entries = Vec::new();
        self.visit(&mut |entry| {
            entries.push(InventoryEntry {
                logical_path: entry.logical_path.to_owned(),
                bytes: entry.bytes,
            });
            Ok(())
        })?;
        Ok(entries)
    }

    pub(crate) fn display_root(&self) -> &Path {
        &self.display_root
    }

    pub(crate) fn select_source(&self, path: &str) -> Result<(AuthorizedFile, String), Error> {
        let (directory, name) = self.resolve_parent(path)?;
        let pinned = open_at(&directory, name, libc::O_PATH)?;
        let metadata = pinned.metadata()?;
        if !metadata.is_file() {
            return Err(Error::Rejected("Vault source must be a regular file"));
        }
        if metadata.len() > MAX_SOURCE_BYTES as u64 {
            return Err(Error::Rejected("File exceeds 500 KB limit"));
        }
        AuthorizedFile::select_anchored(directory, name, self.display_root.join(path), pinned)
    }

    pub(crate) fn prepare_create(&self, path: &str) -> Result<AuthorizedFile, Error> {
        let (directory, name) = self.resolve_parent(path)?;
        AuthorizedFile::missing_anchored(directory, name, self.display_root.join(path))
    }

    fn resolve_parent<'a>(&self, path: &'a str) -> Result<(File, &'a OsStr), Error> {
        validate_source_path(path)?;
        let mut directory = self.directory.try_clone()?;
        let mut components = path.split('/');
        let name = components.next_back().unwrap(); // Nonempty, validated source path.
        for parent in components {
            let pinned = open_at(&directory, OsStr::new(parent), libc::O_PATH)?;
            let metadata = pinned.metadata()?;
            if !metadata.is_dir() {
                return Err(Error::Rejected(
                    "Vault source parent must be a real directory",
                ));
            }
            directory = OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC)
                .open(format!("/proc/self/fd/{}", pinned.as_raw_fd()))?;
        }
        Ok((directory, OsStr::new(name)))
    }

    fn visit(
        &self,
        source: &mut impl FnMut(SourceEntry<'_>) -> Result<(), Error>,
    ) -> Result<(), Error> {
        Walk { entries: 0 }.visit(&self.directory, Path::new(""), 0, source)
    }
}

pub(crate) fn collect(root: &Path) -> Result<Vec<(AuthorizedFile, String)>, Error> {
    let vault = Vault::select_authorized(root)?;
    let mut files = Vec::new();
    let mut bytes = 0;
    vault.visit(&mut |entry| {
        if files.len() >= MAX_DOCUMENTS {
            return Err(Error::Rejected("Folder exceeds 32 source file limit"));
        }
        if entry.bytes > MAX_SOURCE_BYTES as u64 {
            return Err(Error::Rejected("File exceeds 500 KB limit"));
        }
        let (file, source) = AuthorizedFile::select_anchored(
            entry.directory.try_clone()?,
            entry.name,
            root.join(entry.logical_path),
            entry.pinned,
        )?;
        bytes += source.len();
        if bytes > MAX_TOTAL_BYTES {
            return Err(Error::Rejected("Folder exceeds 8 MiB source limit"));
        }
        files.push((file, source));
        Ok(())
    })?;
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::Vault;
    use crate::{random_id, Error};
    use std::{fs, path::PathBuf};

    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn prepared_missing_target_cannot_replace_an_intervening_creator() {
        let fixture = Fixture(
            PathBuf::from("/tmp")
                .join(format!("pn-vault-create-prepared-{}", random_id().unwrap())),
        );
        fs::create_dir(&fixture.0).unwrap();
        let vault = Vault::select_authorized(&fixture.0).unwrap();
        // This is the same private production preparation used by Store::create_vault.
        let mut prepared = vault.prepare_create("note.mdx").unwrap();
        let winner = fixture.0.join("note.mdx");
        fs::write(&winner, "intervening creator\r\n😀").unwrap();
        assert!(matches!(
            prepared.write("must not replace"),
            Err(Error::Conflict)
        ));
        assert_eq!(
            fs::read(winner).unwrap(),
            "intervening creator\r\n😀".as_bytes()
        );
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 1);
    }
}
