//! Linux resource boundary; never falls back to spawning an unrestricted preview.
use std::{
    io::Write,
    path::Path,
    process::{Child, Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};
pub const MAX_HTML_BYTES: usize = 4 * 1024 * 1024;
pub const PROPERTIES: &[&str] = &[
    "MemoryMax=512M",
    "MemorySwapMax=0",
    "CPUQuota=25%",
    "TasksMax=128",
    "RuntimeMaxSec=60",
    "TimeoutStartSec=5",
    "TimeoutStopSec=1",
    "KillMode=control-group",
    "SendSIGKILL=yes",
    "OOMPolicy=kill",
    "NoNewPrivileges=yes",
    "PrivateNetwork=yes",
    "LimitCORE=0",
    "UMask=0077",
    "UnsetEnvironment=WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS WEBKIT_INSPECTOR_SERVER LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH GTK_MODULES GTK3_MODULES GTK_PATH GIO_EXTRA_MODULES GDK_PIXBUF_MODULE_FILE",
];
pub fn authorize(label: &str, child: bool) -> Result<(), String> {
    if label == "editor" && !child {
        Ok(())
    } else {
        Err("preview has no host capabilities".into())
    }
}
pub fn run_args(unit: &str, executable: &Path) -> Vec<String> {
    let mut args = vec![
        "--user",
        "--pipe",
        "--wait",
        "--collect",
        "--quiet",
        "--service-type=exec",
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();
    args.push(format!("--unit={unit}"));
    args.push("--setenv=TAURI_WEBVIEW_AUTOMATION=false".into());
    args.extend(PROPERTIES.iter().map(|p| format!("--property={p}")));
    args.extend([
        "--".into(),
        "/usr/bin/env".into(),
        "-i".into(),
        "TAURI_WEBVIEW_AUTOMATION=false".into(),
        "TAURI_AUTOMATION=false".into(),
        executable.to_string_lossy().into_owned(),
        "--preview-child".into(),
    ]);
    args
}
pub fn verify_values(memory: &str, swap: &str, cpu: &str, tasks: &str) -> Result<(), String> {
    let memory = memory
        .trim()
        .parse::<u64>()
        .map_err(|_| "memory.max is not bounded")?;
    let tasks = tasks
        .trim()
        .parse::<u64>()
        .map_err(|_| "pids.max is not bounded")?;
    let parts = cpu.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 2 {
        return Err("Invalid cpu.max".into());
    }
    let quota = parts[0]
        .parse::<u64>()
        .map_err(|_| "cpu.max is not bounded")?;
    let period = parts[1]
        .parse::<u64>()
        .map_err(|_| "Invalid cpu.max period")?;
    if memory == 0
        || memory > 536_870_912
        || tasks == 0
        || tasks > 128
        || swap.trim() != "0"
        || quota == 0
        || period == 0
        || quota > period / 4
    {
        return Err("Effective cgroup limits exceed preview policy".into());
    }
    Ok(())
}
pub fn verify_runtime_identity(
    editor_net: &str,
    preview_net: &str,
    editor_status: &str,
    preview_status: &str,
) -> Result<(), String> {
    if !editor_net.starts_with("net:[")
        || !preview_net.starts_with("net:[")
        || editor_net == preview_net
    {
        return Err("Preview network namespace is not isolated; systemd may have silently skipped PrivateNetwork".into());
    }
    let uid = |status: &str| {
        status
            .lines()
            .find(|l| l.starts_with("Uid:"))
            .and_then(|line| line.split_whitespace().nth(2))
            .map(str::to_owned)
    };
    let own = uid(editor_status).ok_or("Cannot verify editor user")?;
    if own == "0" || uid(preview_status).as_ref() != Some(&own) {
        return Err("Preview must run as the same non-root desktop user".into());
    }
    if !preview_status
        .lines()
        .any(|line| line.split_whitespace().collect::<Vec<_>>() == ["NoNewPrivs:", "1"])
    {
        return Err("Preview NoNewPrivileges is not active".into());
    }
    Ok(())
}
fn verify_process(unit: &str) -> Result<(), String> {
    let out = Command::new("systemctl")
        .args(["--user", "show", "--property=MainPID", "--value", unit])
        .output()
        .map_err(|e| e.to_string())?;
    let pid = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<u32>()
        .map_err(|_| "Cannot verify preview PID")?;
    if pid == 0 {
        return Err("Preview process is not active".into());
    }
    let read = |p: String| {
        std::fs::read_to_string(p).map_err(|e| format!("Cannot verify process policy: {e}"))
    };
    let own_net = std::fs::read_link("/proc/self/ns/net").map_err(|e| e.to_string())?;
    let child_net = std::fs::read_link(format!("/proc/{pid}/ns/net")).map_err(|e| e.to_string())?;
    verify_runtime_identity(
        &own_net.to_string_lossy(),
        &child_net.to_string_lossy(),
        &read("/proc/self/status".into())?,
        &read(format!("/proc/{pid}/status"))?,
    )
}
fn verify_cgroup(unit: &str) -> Result<(), String> {
    let output = Command::new("systemctl")
        .args(["--user", "show", "--property=ControlGroup", "--value", unit])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Cannot inspect preview cgroup".into());
    }
    let group = String::from_utf8_lossy(&output.stdout);
    let group = group.trim();
    if !group.starts_with('/') || group == "/" || group.split('/').any(|p| p == "..") {
        return Err("Invalid preview cgroup path".into());
    }
    let root = Path::new("/sys/fs/cgroup").join(group.trim_start_matches('/'));
    let read = |name| {
        std::fs::read_to_string(root.join(name)).map_err(|e| format!("Cannot verify {name}: {e}"))
    };
    verify_values(
        &read("memory.max")?,
        &read("memory.swap.max")?,
        &read("cpu.max")?,
        &read("pids.max")?,
    )
}
#[derive(Default)]
pub struct Supervisor {
    child: Option<Child>,
    unit: Option<String>,
}
impl Supervisor {
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(unit) = self.unit.as_ref() {
            // systemd owns the complete WebKit process subtree, not only the launcher PID.
            let status = Command::new("systemctl")
                .args(["--user", "stop", unit])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                let absent = Command::new("systemctl")
                    .args(["--user", "show", "--property=LoadState", "--value", unit])
                    .output()
                    .map_err(|e| e.to_string())?;
                if String::from_utf8_lossy(&absent.stdout).trim() != "not-found" {
                    return Err("Failed to stop preview unit; do not launch another".into());
                }
            }
        }
        if let Some(mut child) = self.child.take() {
            let _ = child.wait();
        }
        self.unit = None;
        Ok(())
    }
    pub fn start(&mut self, executable: &Path, html: &str) -> Result<String, String> {
        if !cfg!(target_os = "linux") {
            return Err("Native preview requires the validated Linux resource backend; no unrestricted fallback".into());
        }
        if html.len() > MAX_HTML_BYTES {
            return Err("Preview artifact exceeds 4 MiB".into());
        }
        self.stop()?;
        let manager = Command::new("systemctl")
            .args(["--user", "is-system-running"])
            .output()
            .map_err(|e| e.to_string())?;
        if !matches!(
            String::from_utf8_lossy(&manager.stdout).trim(),
            "running" | "degraded"
        ) {
            return Err(
                "A running user systemd manager and delegated cgroup v2 are required".into(),
            );
        }
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let unit = format!(
            "programmable-notes-preview-{}-{suffix}.service",
            std::process::id()
        );
        let mut args = run_args(&unit, executable);
        let index = args.len() - 2;
        let graphics = [
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "XDG_RUNTIME_DIR",
            "XAUTHORITY",
            "DBUS_SESSION_BUS_ADDRESS",
            "LANG",
            "LC_ALL",
        ]
        .iter()
        .filter_map(|name| {
            std::env::var(name)
                .ok()
                .map(|value| format!("{name}={value}"))
        });
        let render = [
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            "WEBKIT_DISABLE_DMABUF_RENDERER",
        ]
        .into_iter()
        .filter_map(|name| {
            (std::env::var(name).ok().as_deref() == Some("1")).then(|| format!("{name}=1"))
        });
        args.splice(index..index, graphics.chain(render));
        let mut child = Command::new("systemd-run")
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        self.unit = Some(unit.clone());
        let mut input = child.stdin.take().ok_or("Missing child input")?;
        self.child = Some(child);
        // The child blocks on stdin before creating WebKit. Verify real cgroup
        // controller files before sending any author artifact, not just unit properties.
        let ready = (|| {
            for _ in 0..50 {
                if Command::new("systemctl")
                    .args(["--user", "is-active", "--quiet", &unit])
                    .status()
                    .map_err(|e| e.to_string())?
                    .success()
                {
                    verify_cgroup(&unit)?;
                    return verify_process(&unit);
                }
                if self
                    .child
                    .as_mut()
                    .unwrap()
                    .try_wait()
                    .map_err(|e| e.to_string())?
                    .is_some()
                {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err("Preview resource unit did not become active".into())
        })();
        if let Err(error) = ready {
            drop(input);
            let _ = self.stop();
            return Err(error);
        }
        let write = input.write_all(html.as_bytes());
        drop(input);
        if write.is_err() {
            let _ = self.stop();
            return Err("Resource-isolated preview rejected input".into());
        }
        Ok(unit)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runtime_identity_refuses_silent_namespace_fallback_and_privileges() {
        let status = "Uid:\t1000\t1000\t1000\t1000\nNoNewPrivs:\t1\n";
        assert!(verify_runtime_identity("net:[1]", "net:[2]", status, status).is_ok());
        assert!(verify_runtime_identity("net:[1]", "net:[1]", status, status).is_err());
        assert!(verify_runtime_identity(
            "net:[1]",
            "net:[2]",
            status,
            &status.replace("NoNewPrivs:\t1", "NoNewPrivs:\t0")
        )
        .is_err());
        assert!(verify_runtime_identity(
            "net:[1]",
            "net:[2]",
            status,
            &status.replace("1000", "0")
        )
        .is_err());
    }
    #[test]
    fn service_environment_cannot_disable_sandbox_or_enable_inspection() {
        let args = run_args("test.service", Path::new("/usr/bin/programmable-notes"));
        let unset = args
            .iter()
            .find(|a| a.starts_with("--property=UnsetEnvironment="))
            .expect("Service environment not sanitized");
        for name in [
            "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS",
            "WEBKIT_INSPECTOR_SERVER",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "GTK_MODULES",
            "GIO_EXTRA_MODULES",
        ] {
            assert!(unset.split(['=', ' ']).any(|v| v == name));
        }
        assert!(args.iter().any(|a| a == "--property=LimitCORE=0"));
    }
    #[test]
    fn effective_limits_must_be_bounded_and_no_weaker_than_policy() {
        assert!(verify_values("536870912", "0", "25000 100000", "128").is_ok());
        assert!(verify_values("1000", "0", "10000 100000", "8").is_ok());
        for (memory, swap, cpu, tasks) in [
            ("max", "0", "25000 100000", "128"),
            ("536870912", "max", "25000 100000", "128"),
            ("536870912", "0", "max 100000", "128"),
            ("536870912", "0", "25001 100000", "128"),
            ("536870912", "0", "25000 100000", "129"),
            ("536870913", "0", "25000 100000", "128"),
            ("536870912", "0", "25000 0", "128"),
        ] {
            assert!(verify_values(memory, swap, cpu, tasks).is_err());
        }
    }
    #[test]
    fn preview_and_unknown_labels_never_authorized() {
        assert!(authorize("editor", false).is_ok());
        for label in ["preview", "editor", "", "editor-child", "*"] {
            assert!(authorize(label, true).is_err());
        }
        for label in ["preview", "editor-child", ""] {
            assert!(authorize(label, false).is_err());
        }
    }
    #[test]
    fn launcher_has_hard_boundaries_and_no_shell_or_author_arguments() {
        let args = run_args("generated.service", Path::new("/opt/notes app/bin"));
        for property in PROPERTIES {
            assert!(args.contains(&format!("--property={property}")));
        }
        assert_eq!(
            &args[args.len() - 2..],
            ["/opt/notes app/bin", "--preview-child"]
        );
        assert!(args.contains(&"--wait".into()));
        assert!(args.contains(&"--setenv=TAURI_WEBVIEW_AUTOMATION=false".into()));
        assert!(!args.iter().any(|a| a == "sh" || a == "-c"));
    }
    #[test]
    fn oversized_artifact_is_rejected_before_any_process_launch() {
        assert!(Supervisor::default()
            .start(Path::new("/nonexistent"), &"x".repeat(MAX_HTML_BYTES + 1))
            .unwrap_err()
            .contains("4 MiB"));
    }
}
