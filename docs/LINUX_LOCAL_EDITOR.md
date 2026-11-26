# Try the local Linux editor

The native testing application stores selected notes as real source files on your
computer. It does not use the browser workspace database. Cloud storage is paused.
Target packages are Debian/Ubuntu **amd64** desktops satisfying the existing
AppArmor4/systemd252+/WebKitGTK4.1 requirements; other platforms are not certified.

## Download and install

Successful native CI produces a **linux-amd64-testing** artifact after package,
notice and Rust checks. Download it from the draft PR's Actions run and extract
the ZIP. It includes the `.deb`, SHA256SUMS, build identity and instructions.
Verify and install from that directory:

```sh
sha256sum --check SHA256SUMS
sudo apt install './Programmable Notes_0.1.1_amd64.deb'
```

Open **Programmable Notes** using the desktop application launcher. This is a
testing build, not a public release or production security readiness claim.
Compilation and package inspection alone do not prove installed launch.

## Notes folder and editing

Choose **Open notes folder** in the application or Settings. The system chooser
authorizes that folder; its supported `.md`, `.mdx`, `.js`, `.jsx`, `.ts` and `.tsx`
files keep their root-relative module paths. Edit a selected file and press
**Ctrl+S** to save exact source through the native writer. **Save As** explicitly
chooses a location for a new note. Existing file changes/conflicts require review;
no silent overwrite or arbitrary document-code filesystem permission is granted.

The current bounded workspace supports 32 sources, 8 MiB total and 500,000 bytes per
file. Unsafe or oversized selections fail without partially replacing notes.
Symlinks and special files are refused. The app currently reselects the folder
after restart; choosing a remembered pathname automatically is not implemented.
Keep independent backups of your notes folder.

Choose **Visual** for direct Markdown/math editing or **Source** for raw MDX.
Unfinished dollars are literal text; complete expressions render when selection
leaves them. Invalid completed TeX remains local red source. JSX is opaque to
visual source changes. React runs in the separate native preview in **Split**;
it does not execute inside the privileged editing surface.

Native recovery snapshots are separate from original documents. Restore into an
unsaved copy and review before saving. An unapplied visual attempt can be retained
in native recovery; failed recovery remains visible rather than pretending it saved.

## Updates

**Settings → Check for updates** checks only the configured signed channel.
Installation requires a separate **Download and install** action and saved notes.
The system's PackageKit/Polkit agent handles authorization; the application never
collects a password and has no terminal fallback. Editing and preview restarts
stay blocked during replacement. After confirmed installation, close and reopen.
An unconfirmed installer result is not success: inspect the system installer first.

The initial channel remains disabled until a real public verification key and
authorized signed distribution feed exist. No test signing key is embedded.
Actions artifacts expire after 7 days and cannot provide permanent automatic updates.

## Test on your desktop

Use a disposable notes folder initially. Open a mixed-EOL/BOM `.mdx`, change one
paragraph in Visual, undo/redo, save and compare unrelated bytes. Close/reopen the
app, reselect the folder and verify the saved file. Test a cancelled Save As,
external file-change conflict, recovery restore and disabled update status.
Configured-channel acceptance must additionally cover signed update success,
Polkit cancellation, tamper/downgrade refusal and failure/recovery after package-
manager errors. These are not implied by unit tests.

Preview requires actual namespace/resource enforcement. If that is unavailable,
leave preview refused; do not disable isolation. Current renderer/CPU Stop and
installed-package limitations remain in [NATIVE_SECURITY](NATIVE_SECURITY.md) and
[the reproducible native procedures](LINUX_DESKTOP_TESTING.md).
