//! Native-owned, one-shot admission. No renderer message can mark guards ready.
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
pub struct Activation(AtomicBool);

impl Activation {
    pub fn run<E>(
        &self,
        eligible: bool,
        install: impl FnOnce() -> Result<(), E>,
        publish: impl FnOnce() -> Result<(), E>,
    ) -> Result<bool, E> {
        if !eligible || self.0.swap(true, Ordering::SeqCst) {
            return Ok(false);
        }
        // A failure consumes admission: never retry with partially installed guards.
        install()?;
        publish()?;
        Ok(true)
    }
}

pub fn trusted_shell(url: &str, custom_protocol: bool) -> bool {
    matches!(
        url,
        "tauri://localhost/native-preview.html"
            | "http://tauri.localhost/native-preview.html"
            | "https://tauri.localhost/native-preview.html"
    ) || (!custom_protocol && url == "http://127.0.0.1:5173/native-preview.html")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, sync::mpsc, thread};

    #[test]
    fn only_exact_shell_urls_admit() {
        for url in [
            "tauri://localhost/native-preview.html",
            "http://tauri.localhost/native-preview.html",
            "https://tauri.localhost/native-preview.html",
        ] {
            assert!(trusted_shell(url, true));
            assert!(trusted_shell(url, false));
        }
        assert!(trusted_shell(
            "http://127.0.0.1:5173/native-preview.html",
            false
        ));
        assert!(!trusted_shell(
            "http://127.0.0.1:5173/native-preview.html",
            true
        ));
        for url in [
            "about:blank",
            "about:srcdoc",
            "tauri://localhost/index.html",
            "tauri://localhost/native-preview.html?payload=x",
            "tauri://localhost/native-preview.html#fragment",
            "tauri://user@localhost/native-preview.html",
            "tauri://localhost:1234/native-preview.html",
            "tauri://evil/native-preview.html",
            "http://tauri.localhost.evil/native-preview.html",
            "http://127.0.0.1:5173/native-preview.html?payload=x",
            "http://127.0.0.1:5173/index.html",
            "http://127.0.0.1:5174/native-preview.html",
            "file:///native-preview.html",
        ] {
            assert!(!trusted_shell(url, true), "{url}");
            assert!(!trusted_shell(url, false), "{url}");
        }
    }

    #[test]
    fn guards_finish_before_first_and_only_publication() {
        let activation = Activation::default();
        let events = RefCell::new(Vec::new());
        assert_eq!(
            activation.run(
                true,
                || {
                    events.borrow_mut().push("guards");
                    Ok::<_, ()>(())
                },
                || {
                    assert_eq!(*events.borrow(), ["guards"]);
                    events.borrow_mut().push("author");
                    Ok(())
                }
            ),
            Ok(true)
        );
        assert_eq!(
            activation.run::<()>(true, || panic!("reinstall"), || panic!("republish")),
            Ok(false)
        );
        assert_eq!(*events.borrow(), ["guards", "author"]);
    }

    #[test]
    fn unrelated_completion_does_not_consume_admission() {
        let activation = Activation::default();
        assert_eq!(
            activation.run::<()>(false, || panic!("install"), || panic!("publish")),
            Ok(false)
        );
        assert_eq!(activation.run::<()>(true, || Ok(()), || Ok(())), Ok(true));
    }

    #[test]
    fn failed_guard_installation_never_publishes_or_retries() {
        let activation = Activation::default();
        assert_eq!(
            activation.run(true, || Err("guard failure"), || panic!("author ran")),
            Err("guard failure")
        );
        assert_eq!(
            activation.run::<()>(true, || panic!("retry"), || panic!("author ran")),
            Ok(false)
        );
    }

    #[test]
    fn failed_publication_never_retries() {
        let activation = Activation::default();
        assert_eq!(
            activation.run(true, || Ok(()), || Err("publish failure")),
            Err("publish failure")
        );
        assert_eq!(
            activation.run::<()>(true, || panic!("retry"), || panic!("author ran")),
            Ok(false)
        );
    }

    #[test]
    fn delayed_native_callback_cannot_publish_early() {
        let (release, wait) = mpsc::channel();
        let (record, events) = mpsc::channel();
        let callback = thread::spawn(move || {
            wait.recv().unwrap();
            Activation::default()
                .run::<()>(
                    true,
                    || {
                        record.send("guards").unwrap();
                        Ok(())
                    },
                    || {
                        record.send("author").unwrap();
                        Ok(())
                    },
                )
                .unwrap();
        });
        assert_eq!(events.try_recv(), Err(mpsc::TryRecvError::Empty));
        release.send(()).unwrap();
        callback.join().unwrap();
        assert_eq!(events.into_iter().collect::<Vec<_>>(), ["guards", "author"]);
    }
}
