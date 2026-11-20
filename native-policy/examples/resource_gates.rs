//! Tests the actual Linux supervisor without GTK. Not a substitute for WebKit tests.
use preview_policy::Supervisor;
use std::{
    io::{self, Read},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
fn active(unit: &str) -> bool {
    Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", unit])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}
fn wait_stopped(unit: &str, seconds: u64) {
    let deadline = Instant::now() + Duration::from_secs(seconds);
    while active(unit) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
    }
    assert!(
        !active(unit),
        "preview unit survived termination/lifetime budget"
    );
}
fn main() {
    if std::env::args().any(|a| a == "--preview-child") {
        let mut mode = String::new();
        io::stdin().read_to_string(&mut mode).unwrap();
        // A validation sentinel proves that a rejected launch never received an artifact.
        if !mode.is_empty() {
            if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
                let marker = std::path::PathBuf::from(runtime)
                    .join(format!("pn-preview-payload-{}", std::process::id()));
                std::fs::write(marker, b"test artifact delivered\n").unwrap();
            }
        }

        match mode.as_str() {
            "loop" => loop {
                std::hint::spin_loop();
            },
            "memory" => {
                let mut blocks = Vec::new();
                loop {
                    let block = vec![42u8; 16 * 1024 * 1024];
                    std::hint::black_box(&block);
                    blocks.push(block);
                }
            }
            _ => thread::sleep(Duration::from_secs(120)),
        }
        return;
    }
    let mut supervisor = Supervisor::default();
    let executable = std::env::current_exe().unwrap();
    let unit = match supervisor.start(&executable, "loop") {
        Ok(unit) => unit,
        Err(error) => {
            eprintln!("NOT RUN: resource backend unavailable or rejected: {error}");
            std::process::exit(2);
        }
    };
    // Every successful start already verified actual cpu/memory/swap/pids files
    // before delivering the payload. Exercise termination of a CPU-bound child.
    thread::sleep(Duration::from_secs(2));
    supervisor.stop().expect("Stop failed");
    wait_stopped(&unit, 3);
    println!("PASS: resource-verified CPU loop stopped");
    let unit = supervisor
        .start(&executable, "memory")
        .expect("Restart after Stop failed");
    wait_stopped(&unit, 75);
    // An early stop is expected under memory pressure. Wall-time expiration alone
    // is insufficient OOM evidence; collect the actual journal separately.
    println!("Memory-pressure group terminated: {unit}; inspect journal for OOM cause");
    supervisor
        .stop()
        .expect("Collected memory unit could not be reaped");
    let unit = supervisor
        .start(&executable, "idle")
        .expect("Restart after pressure failed");
    wait_stopped(&unit, 75);
    supervisor
        .stop()
        .expect("Expired/collected unit could not be reaped");
    let unit = supervisor
        .start(&executable, "idle")
        .expect("Restart after expiry failed");
    supervisor.stop().expect("Final stop failed");
    wait_stopped(&unit, 3);
    println!("PASS: independent lifetime and restart after expired/collected unit");
}
