//! Bounded Linux directory notifications. Hints never carry source or grant authority.
use crate::Error;
use std::{
    ffi::{CStr, CString},
    fs::File,
    io::Read,
    os::fd::{AsRawFd, FromRawFd},
};

pub(crate) struct SourceWatch {
    file: File,
    name: Vec<u8>,
}
impl SourceWatch {
    pub(crate) fn new(directory: &File, name: &CStr) -> Result<Self, Error> {
        // SAFETY: successful descriptor is transferred to one owned File.
        let fd = unsafe { libc::inotify_init1(libc::IN_NONBLOCK | libc::IN_CLOEXEC) };
        if fd < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        let file = unsafe { File::from_raw_fd(fd) };
        // This path refers only to our live, already-authorized directory descriptor.
        // No caller-supplied absolute path enters the notification service.
        let path = CString::new(format!("/proc/self/fd/{}", directory.as_raw_fd())).unwrap();
        let mask = libc::IN_ONLYDIR
            | libc::IN_CLOSE_WRITE
            | libc::IN_MODIFY
            | libc::IN_ATTRIB
            | libc::IN_CREATE
            | libc::IN_DELETE
            | libc::IN_MOVED_FROM
            | libc::IN_MOVED_TO
            | libc::IN_MOVE_SELF
            | libc::IN_DELETE_SELF;
        // SAFETY: live descriptor/path, fixed mask; closing file removes its watch.
        if unsafe { libc::inotify_add_watch(file.as_raw_fd(), path.as_ptr(), mask) } < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(Self {
            file,
            name: name.to_bytes().to_vec(),
        })
    }
    /// One bounded queue read. Periodic authoritative reconciliation covers lost hints.
    pub(crate) fn poll_hint(&mut self, timeout_ms: u16) -> Result<bool, Error> {
        if timeout_ms > 1000 {
            return Err(Error::Rejected("Notification wait exceeds bound"));
        }
        let mut descriptor = libc::pollfd {
            fd: self.file.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        // SAFETY: one live pollfd for a finite, bounded wait.
        let ready = unsafe { libc::poll(&mut descriptor, 1, timeout_ms.into()) };
        if ready < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        if ready == 0 {
            return Ok(false);
        }
        if descriptor.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
            return Err(Error::Rejected("Notification descriptor unavailable"));
        }
        let mut buffer = [0u8; 4096];
        match self.file.read(&mut buffer) {
            Ok(0) => Err(Error::Rejected("Notification descriptor ended")),
            Ok(length) => hints(&buffer[..length], &self.name),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => Ok(false),
            Err(error) => Err(error.into()),
        }
    }
}
fn hints(bytes: &[u8], expected: &[u8]) -> Result<bool, Error> {
    let mut offset = 0;
    let mut changed = false;
    let header = std::mem::size_of::<libc::inotify_event>();
    while offset < bytes.len() {
        if bytes.len() - offset < header {
            return Err(Error::Rejected("Truncated notification"));
        }
        // SAFETY: header range was checked; byte buffer may be unaligned.
        let event = unsafe {
            std::ptr::read_unaligned(bytes.as_ptr().add(offset).cast::<libc::inotify_event>())
        };
        let end = offset
            .checked_add(header)
            .and_then(|v| v.checked_add(event.len as usize))
            .filter(|end| *end <= bytes.len())
            .ok_or(Error::Rejected("Invalid notification length"))?;
        let name = &bytes[offset + header..end];
        let name = &name[..name.iter().position(|b| *b == 0).unwrap_or(name.len())];
        if event.mask
            & (libc::IN_Q_OVERFLOW | libc::IN_IGNORED | libc::IN_MOVE_SELF | libc::IN_DELETE_SELF)
            != 0
            || name == expected
        {
            changed = true;
        }
        offset = end;
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event(mask: u32, name: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1i32.to_ne_bytes());
        bytes.extend_from_slice(&mask.to_ne_bytes());
        bytes.extend_from_slice(&0u32.to_ne_bytes());
        bytes.extend_from_slice(&(name.len() as u32).to_ne_bytes());
        bytes.extend_from_slice(name);
        bytes
    }
    #[test]
    fn overflow_and_retirement_are_hints_even_without_a_filename() {
        assert!(hints(&event(libc::IN_Q_OVERFLOW, &[]), b"note.mdx").unwrap());
        assert!(hints(&event(libc::IN_IGNORED, &[]), b"note.mdx").unwrap());
        assert!(hints(&event(libc::IN_MOVE_SELF, &[]), b"note.mdx").unwrap());
    }
    #[test]
    fn bounded_decoder_rejects_truncation_and_ignores_unrelated_names() {
        assert!(!hints(&event(libc::IN_MODIFY, b"other.mdx\0"), b"note.mdx").unwrap());
        assert!(hints(&event(libc::IN_MOVED_TO, b"note.mdx\0"), b"note.mdx").unwrap());
        assert!(hints(&[0; 15], b"note.mdx").is_err());
        let mut malformed = event(libc::IN_MODIFY, &[]);
        malformed[12..16].copy_from_slice(&u32::MAX.to_ne_bytes());
        assert!(hints(&malformed, b"note.mdx").is_err());
    }
}
