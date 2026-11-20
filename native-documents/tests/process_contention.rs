#![cfg(target_os = "linux")]
//! Real exec'd writers exercise flock lifetime and revision conflicts across processes.
use native_documents::snapshots::{Input, Recovery};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
struct Worker(Child);
impl Drop for Worker {
    fn drop(&mut self) {
        // Only our own directly spawned writer; cleanup also runs on assertion failure.
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn input(source: String, parent: Option<String>) -> Input {
    Input {
        document_id: "a".repeat(32),
        name: "note.mdx".into(),
        baseline: None,
        parent,
        source,
    }
}
fn writer_source(index: usize) -> String {
    format!("# Writer {index}\r\nCafé 😀\r\n<div>opaque</div>\r\n")
}
fn start(root: &Path, parent: &str, index: usize) -> Worker {
    Worker(
        Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "snapshot_process_worker",
                "--nocapture",
            ])
            .env("PN_CONTENTION_ROOT", root)
            .env("PN_CONTENTION_PARENT", parent)
            .env("PN_CONTENTION_INDEX", index.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    )
}
fn ready(worker: &mut Worker, root: &Path, index: usize) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !root
        .parent()
        .unwrap()
        .join(format!("ready-{index}"))
        .exists()
    {
        assert!(
            worker.0.try_wait().unwrap().is_none(),
            "Writer exited before ready"
        );
        assert!(Instant::now() < deadline, "Writer ready deadline exceeded");
        std::thread::sleep(Duration::from_millis(5));
    }
}
fn release(worker: &mut Worker) {
    worker.0.stdin.take().unwrap().write_all(b"G").unwrap();
}
fn finish(worker: &mut Worker) -> serde_json::Value {
    let deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(status) = worker.0.try_wait().unwrap() {
            break status;
        }
        assert!(
            Instant::now() < deadline,
            "Writer completion deadline exceeded"
        );
        std::thread::sleep(Duration::from_millis(5));
    };
    let mut stdout = String::new();
    let mut stderr = String::new();
    worker
        .0
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut stdout)
        .unwrap();
    worker
        .0
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut stderr)
        .unwrap();
    assert!(status.success(), "Writer failed: {stdout}\n{stderr}");
    let result = stdout
        .lines()
        .find_map(|line| line.strip_prefix("WRITER_RESULT "))
        .expect("Missing writer result");
    let result: serde_json::Value = serde_json::from_str(result).unwrap();
    assert_eq!(result["pid"].as_u64(), Some(u64::from(worker.0.id())));
    assert_ne!(worker.0.id(), std::process::id());
    result
}

#[test]
fn actual_process_writers_preserve_one_head_and_recover_from_busy_and_stale_revisions() {
    for round in 0..5 {
        let path = std::env::temp_dir().join(format!(
            "pn-snapshot-process-writers-{}-{round}",
            std::process::id()
        ));
        // Register cleanup only after we created this directory successfully.
        fs::create_dir(&path).unwrap();
        let fixture = Fixture(path);
        let root = fixture.0.join("recovery");
        let original = "\u{feff}# Original\r\nNever overwritten 😀\r\n";
        fs::write(fixture.0.join("original.mdx"), original).unwrap();
        let mut held = Recovery::open(&root).unwrap();
        let prior = held
            .append(input("\u{feff}Prior snapshot\r\n".into(), None))
            .unwrap();
        assert!(prior.durable);
        let mut blocked = start(&root, &prior.snapshot.id, 0);
        ready(&mut blocked, &root, 0);
        release(&mut blocked);
        let rejected = finish(&mut blocked);
        assert_eq!(rejected["ok"], false);
        assert!(rejected["error"].as_str().unwrap().contains("busy"));
        assert_eq!(held.list().unwrap().snapshots.len(), 1);
        drop(held);

        let mut workers: Vec<_> = (1..=3)
            .map(|index| start(&root, &prior.snapshot.id, index))
            .collect();
        for (index, worker) in workers.iter_mut().enumerate() {
            ready(worker, &root, index + 1);
        }
        // Release every independently exec'd process before waiting for any result.
        for worker in &mut workers {
            release(worker);
        }
        let mut winner = None;
        for (index, worker) in workers.iter_mut().enumerate() {
            let result = finish(worker);
            if result["ok"] == true {
                assert!(
                    winner.replace(index + 1).is_none(),
                    "Two competing parents published heads"
                );
            } else {
                let error = result["error"].as_str().unwrap();
                assert!(
                    error.contains("busy") || error.contains("revision conflict"),
                    "Unexpected writer error: {error}"
                );
            }
        }
        let winner = winner.expect("No writer published after lock release");
        let mut store = Recovery::open(&root).unwrap();
        let inventory = store.list().unwrap();
        assert!(inventory.errors.is_empty());
        assert_eq!(inventory.snapshots.len(), 2);
        let head = &inventory.snapshots[0];
        assert_eq!(head.metadata.generation, 2);
        assert_eq!(
            head.metadata.parent.as_deref(),
            Some(prior.snapshot.id.as_str())
        );
        assert_eq!(store.restore(&head.file).unwrap(), writer_source(winner));
        assert_eq!(
            store.restore(&prior.snapshot.file).unwrap(),
            "\u{feff}Prior snapshot\r\n"
        );
        assert!(store
            .append(input("stale retry".into(), Some(prior.snapshot.id)))
            .unwrap_err()
            .contains("revision conflict"));
        let next = store
            .append(input(
                "Explicit current-head retry\r\n".into(),
                Some(head.id.clone()),
            ))
            .unwrap();
        assert!(next.durable);
        assert_eq!(next.snapshot.metadata.generation, 3);
        assert_eq!(
            store.restore(&next.snapshot.file).unwrap(),
            "Explicit current-head retry\r\n"
        );
        assert_eq!(
            fs::read(fixture.0.join("original.mdx")).unwrap(),
            original.as_bytes()
        );
        println!("REAL_PROCESS_CONTENTION_PASS round={round} winner={winner} busy_rejected=true stale_rejected=true exact_prior=true retry=true original_unchanged=true");
    }
}

#[test]
#[ignore = "worker invoked only by its owning contention test with synthetic fixtures"]
fn snapshot_process_worker() {
    let root =
        PathBuf::from(std::env::var_os("PN_CONTENTION_ROOT").expect("Synthetic fixture required"));
    assert_eq!(root.file_name().unwrap(), "recovery");
    assert!(root
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("pn-snapshot-process-writers-"));
    let index: usize = std::env::var("PN_CONTENTION_INDEX")
        .unwrap()
        .parse()
        .unwrap();
    assert!(index <= 3);
    let parent = std::env::var("PN_CONTENTION_PARENT").unwrap();
    fs::write(
        root.parent().unwrap().join(format!("ready-{index}")),
        b"ready",
    )
    .unwrap();
    let mut go = [0];
    std::io::stdin().read_exact(&mut go).unwrap();
    assert_eq!(go, *b"G");
    let result = Recovery::open(&root)
        .and_then(|mut store| store.append(input(writer_source(index), Some(parent))));
    let mut response = match result {
        Ok(written) => {
            assert!(written.durable);
            serde_json::json!({"ok":true})
        }
        Err(error) => serde_json::json!({"ok":false,"error":error}),
    };
    response["pid"] = std::process::id().into();
    println!("WRITER_RESULT {response}");
}
