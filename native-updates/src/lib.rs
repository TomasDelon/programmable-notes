//! Bounded update transport and policy. No renderer path or command authority.
//! Outcome: signed Debian updates through the system graphical installer.
//! Invariants: fixed HTTPS origin, version-bound signatures, no passwords/shell.
//! Witness/Done: policy tests plus separately required real desktop acceptance.
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{io::Write, time::Duration};

pub const MAX_PACKAGE_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: usize = 64 * 1024;
pub const ENDPOINT: &str = "https://programmable-notes.pages.dev/desktop/linux-amd64/latest.json";
const PREFIX: &str = "/desktop/linux-amd64/";
const HOST: &str = "programmable-notes.pages.dev";
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    pub url: String,
    pub signature: String,
}
#[derive(Debug, Clone, PartialEq)]
pub enum Installation {
    Installed,
    Cancelled,
    Unconfirmed,
}
fn version(value: &str) -> Result<Version, String> {
    Version::parse(value.strip_prefix('v').unwrap_or(value))
        .map_err(|_| "Update version is invalid.".into())
}
pub fn check_size(current: usize, incoming: usize) -> Result<(), String> {
    if current
        .checked_add(incoming)
        .is_none_or(|sum| sum > MAX_PACKAGE_BYTES)
    {
        Err("Update package exceeds the 25 MiB limit.".into())
    } else {
        Ok(())
    }
}
pub fn ensure_clean(dirty: bool, busy: bool, operations: usize) -> Result<(), String> {
    if dirty || busy || operations != 0 {
        Err("Save all documents and finish pending edits before installing an update.".into())
    } else {
        Ok(())
    }
}
pub fn authorize(label: &str, child: bool) -> Result<(), String> {
    preview_policy::authorize(label, child)
}
fn artifact_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid update location.")?;
    if url.scheme() != "https"
        || url.host_str() != Some(HOST)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.path().starts_with(PREFIX)
        || !url.path().ends_with(".deb")
        || url.path().trim_start_matches(PREFIX).contains('/')
        || url.path().contains('%')
    {
        return Err("Update location is outside the trusted Debian channel.".into());
    }
    Ok(url)
}
pub fn validate_release(bytes: &[u8], current: &str) -> Result<Option<Release>, String> {
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err("Update metadata exceeds its size limit.".into());
    }
    let manifest: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "Update metadata is invalid.")?;
    let announced = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or("Update version is missing.")?;
    let new_version = version(announced)?;
    let current_version = version(current)?;
    let entry = manifest
        .get("platforms")
        .and_then(|v| v.get("linux-x86_64-deb"))
        .ok_or("No supported Linux amd64 Debian update is available.")?;
    let release = Release {
        version: new_version.to_string(),
        url: entry
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or("Update location is missing.")?
            .into(),
        signature: entry
            .get("signature")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty() && v.len() <= 16384)
            .ok_or("Update signature is missing or invalid.")?
            .into(),
    };
    artifact_url(&release.url)?;
    if new_version <= current_version {
        return Ok(None);
    }
    Ok(Some(release))
}
pub fn verify_signed_package(
    bytes: &[u8],
    release: &Release,
    public_key: &str,
) -> Result<(), String> {
    check_size(0, bytes.len())?;
    let decode = |value: &str| -> Result<String, String> {
        String::from_utf8(
            STANDARD
                .decode(value.trim())
                .map_err(|_| "Update signature encoding is invalid.")?,
        )
        .map_err(|_| "Update signature encoding is invalid.".into())
    };
    let key = minisign_verify::PublicKey::decode(&decode(public_key)?)
        .map_err(|_| "Update public key is invalid.")?;
    let signature = minisign_verify::Signature::decode(&decode(&release.signature)?)
        .map_err(|_| "Update signature is invalid.")?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "Update package signature did not verify.")?;
    let signed: Vec<_> = signature
        .trusted_comment()
        .split('\t')
        .filter_map(|field| field.strip_prefix("version:"))
        .collect();
    if signed.len() != 1 || version(signed[0])? != version(&release.version)? {
        return Err("Update signature does not bind the announced version.".into());
    }
    Ok(())
}
fn client() -> Result<reqwest::Client, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "Update networking could not start.".into())
}
async fn fetch(url: reqwest::Url, maximum: usize) -> Result<Vec<u8>, String> {
    let response = client()?
        .get(url)
        .send()
        .await
        .map_err(|_| "Update server could not be reached.")?;
    if response.status() != reqwest::StatusCode::OK {
        return Err("Update server did not return an available update.".into());
    }
    if response
        .content_length()
        .is_some_and(|n| n > maximum as u64)
    {
        return Err("Update response exceeds its size limit.".into());
    }
    let mut chunks = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.map_err(|_| "Update download was interrupted.")?;
        if bytes
            .len()
            .checked_add(chunk.len())
            .is_none_or(|n| n > maximum)
        {
            return Err("Update response exceeds its size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub async fn fetch_manifest() -> Result<Vec<u8>, String> {
    fetch(
        reqwest::Url::parse(ENDPOINT).expect("constant endpoint"),
        MAX_MANIFEST_BYTES,
    )
    .await
}
pub async fn download(release: &Release) -> Result<Vec<u8>, String> {
    fetch(artifact_url(&release.url)?, MAX_PACKAGE_BYTES).await
}
fn inspect_deb(path: &std::path::Path, expected: &str) -> Result<String, String> {
    let output = std::process::Command::new("/usr/bin/dpkg-deb")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .arg("--field")
        .arg(path)
        .args(["Package", "Version", "Architecture"])
        .output()
        .map_err(|_| "The Debian package inspection tool is unavailable.")?;
    let text =
        std::str::from_utf8(&output.stdout).map_err(|_| "Update package metadata is invalid.")?;
    if !output.status.success()
        || !text.lines().any(|s| s == "Package: programmable-notes")
        || !text.lines().any(|s| s == "Architecture: amd64")
        || !text.lines().any(|s| s == format!("Version: {expected}"))
    {
        return Err("The signed package is not this application's expected Linux version.".into());
    }
    let installed = installed_version()?;
    ensure_newer_installed(expected, &installed)?;
    Ok(installed)
}
fn installed_version() -> Result<String, String> {
    let output = std::process::Command::new("/usr/bin/dpkg-query")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .args([
            "--show",
            "--showformat=${Status}\n${Version}\n${Architecture}\n",
            "programmable-notes",
        ])
        .output()
        .map_err(|_| "The installed package version could not be checked.")?;
    let text = std::str::from_utf8(&output.stdout)
        .map_err(|_| "The installed package version is invalid.")?;
    let lines: Vec<_> = text.lines().collect();
    if !output.status.success()
        || lines.len() != 3
        || lines[0] != "install ok installed"
        || lines[2] != "amd64"
    {
        return Err("The installed Debian package is unavailable or needs system repair.".into());
    }
    validate_debian_version(lines[1])?;
    Ok(lines[1].to_owned())
}
pub fn installation_outcome(code: u32) -> Result<Installation, String> {
    match code {
        1 => Ok(Installation::Installed),
        3 | 9 => Ok(Installation::Cancelled),
        _ => Err(
            "The system installer did not install the update. Your running app remains open."
                .into(),
        ),
    }
}
/// The stable PackageKit 1 API uses Polkit; no password crosses this process.
/// Only already signature-verified bytes and a validated release version enter.
pub async fn install_with_packagekit(
    bytes: Vec<u8>,
    expected: String,
) -> Result<Installation, String> {
    check_size(0, bytes.len())?;
    let expected_after = expected.clone();
    let (file, before_version) = tokio::task::spawn_blocking(
        move || -> Result<(tempfile::NamedTempFile, String), String> {
            let mut file = tempfile::Builder::new()
                .prefix("programmable-notes-update-")
                .suffix(".deb")
                .tempfile()
                .map_err(|_| "The update could not be staged on disk.")?;
            file.write_all(&bytes)
                .and_then(|_| file.as_file().sync_all())
                .map_err(|_| "The update could not finish staging on disk.")?;
            let before = inspect_deb(file.path(), &expected)?;
            Ok((file, before))
        },
    )
    .await
    .map_err(|_| "Update package staging was interrupted.")??;
    let connection=tokio::time::timeout(Duration::from_secs(30),zbus::Connection::system()).await
        .map_err(|_| "The system package installer did not respond.")?.map_err(|_| "The system package installer is unavailable. Install PackageKit and a graphical Polkit agent.")?;
    let manager = zbus::Proxy::new(
        &connection,
        "org.freedesktop.PackageKit",
        "/org/freedesktop/PackageKit",
        "org.freedesktop.PackageKit",
    )
    .await
    .map_err(|_| "The system package installer is unavailable.")?;
    let path: zbus::zvariant::OwnedObjectPath = tokio::time::timeout(
        Duration::from_secs(30),
        manager.call("CreateTransaction", &()),
    )
    .await
    .map_err(|_| "The system package installer did not respond.")?
    .map_err(|_| "A system installation transaction could not be opened.")?;
    let transaction = zbus::Proxy::new(
        &connection,
        "org.freedesktop.PackageKit",
        path,
        "org.freedesktop.PackageKit.Transaction",
    )
    .await
    .map_err(|_| "The system installation transaction is unavailable.")?;
    let mut finished = transaction
        .receive_signal("Finished")
        .await
        .map_err(|_| "The system installation status is unavailable.")?;
    // Background=false requests interactive authorization through the desktop agent.
    let _: () = transaction
        .call("SetHints", &vec!["interactive=true", "background=false"])
        .await
        .map_err(|_| "The system installer cannot provide graphical authorization.")?;
    let filenames = vec![file
        .path()
        .to_str()
        .ok_or("The staged update path is invalid.")?
        .to_owned()];
    let accepted: Result<(), _> = transaction.call("InstallFiles", &(0u64, filenames)).await;
    // A missing method reply does not establish whether the privileged transaction
    // started. Await its authoritative terminal signal even after an RPC error.
    let wait = if accepted.is_ok() { 600 } else { 15 };
    let mut terminal = tokio::time::timeout(Duration::from_secs(wait), finished.next())
        .await
        .ok()
        .flatten();
    if terminal.is_none() {
        let _ = tokio::time::timeout(
            Duration::from_secs(5),
            transaction.call::<_, _, ()>("Cancel", &()),
        )
        .await;
        terminal = tokio::time::timeout(Duration::from_secs(15), finished.next())
            .await
            .ok()
            .flatten();
    }
    let mut outcome = match terminal {
        Some(message) => match message.body().deserialize::<(u32, u32)>() {
            Ok((code, _runtime)) => installation_outcome(code),
            Err(_) => Ok(Installation::Unconfirmed),
        },
        None => Ok(Installation::Unconfirmed),
    };
    // dpkg can fail after partial changes. A terminal failure/cancellation is not
    // proof that the installed package stayed intact; do not unlock blindly.
    let observed = tokio::task::spawn_blocking(installed_version)
        .await
        .ok()
        .and_then(Result::ok);
    let expected_installed = if matches!(outcome, Ok(Installation::Installed)) {
        &expected_after
    } else {
        &before_version
    };
    if observed.as_ref() != Some(expected_installed) {
        outcome = Ok(Installation::Unconfirmed);
    }
    // Keep staged bytes alive throughout the transaction. Dropping only cleans our file.
    if matches!(outcome, Ok(Installation::Unconfirmed)) {
        // Completion is unknown; do not unlink a file the system may still read.
        let _ = file.keep();
    } else {
        drop(file);
    }
    outcome
}

pub struct Ticket<T> {
    id: String,
    created: std::time::Instant,
    value: T,
}
impl<T> Ticket<T> {
    pub fn issue(value: T) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            created: std::time::Instant::now(),
            value,
        }
    }
    pub fn id(&self) -> &str {
        &self.id
    }
}
pub fn consume_ticket<T>(pending: &mut Option<Ticket<T>>, requested: &str) -> Result<T, String> {
    if !pending.as_ref().is_some_and(|ticket| {
        ticket.id == requested && ticket.created.elapsed() < Duration::from_secs(600)
    }) {
        return Err(
            "The pending update is unavailable or expired. Check for updates again.".into(),
        );
    }
    Ok(pending.take().expect("matched ticket").value)
}
#[cfg(test)]
mod ticket_tests {
    use super::*;
    #[test]
    fn ticket_is_one_use_and_not_an_arbitrary_renderer_identifier() {
        let mut pending = Some(Ticket::issue(42));
        let id = pending.as_ref().unwrap().id().to_owned();
        assert!(consume_ticket(&mut pending, "forged-id").is_err());
        assert_eq!(consume_ticket(&mut pending, &id).unwrap(), 42);
        assert!(consume_ticket(&mut pending, &id).is_err());
    }
    #[test]
    fn expired_ticket_cannot_install() {
        let mut ticket = Ticket::issue(42);
        let id = ticket.id().to_owned();
        ticket.created = std::time::Instant::now() - Duration::from_secs(601);
        assert!(consume_ticket(&mut Some(ticket), &id).is_err());
    }
}

pub fn ensure_newer_installed(candidate: &str, installed: &str) -> Result<(), String> {
    version(candidate)?;
    validate_debian_version(installed)?;
    // Debian epochs, revisions and '~' sort differently from SemVer. The
    // package manager's ordering must protect an externally upgraded install.
    let status = std::process::Command::new("/usr/bin/dpkg")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .args(["--compare-versions", candidate, "gt", installed])
        .output()
        .map_err(|_| "Debian version comparison is unavailable.")?;
    if !status.status.success() {
        return Err("The installed package is already this version or newer. Close and reopen the application before checking again.".into());
    }
    Ok(())
}

fn validate_debian_version(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_digit()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b".+~:-".contains(&byte))
    {
        return Err("The installed Debian version is invalid.".into());
    }
    Ok(())
}
