# Linux local-editor candidate — 26 November 2026

This receipt distinguishes source checks from installed desktop behavior. Cloud
activation is paused. No public release, production signing key, visibility
change or weakened sandbox is part of this work.

## Implemented inputs

- `c7203e2`: literal typed dollars, transaction-owned delimiter promotion and
  neighboring Markdown preservation.
- `a020d0d`: private-storage groundwork, inactive and not provisioned.
- `17ab40f`: native authorized folders, shared Visual editor, Settings, guarded
  signed Debian update installation and redistribution notices.
- `f9cd7a3`: complete one-use update ticket integration and bound PackageKit
  method replies. A missing installation reply remains uncertain until an
  authoritative terminal result; it does not unlock editing prematurely.

## Observed local checks

The complete `npm run check` passed for the combined application inputs:
627 unit tests, 147 Chromium cases, 9 built-Pages cases and 4 inactive-cloud
acceptance cases. Formatting, linting, strict TypeScript and production build
passed. The tooling run was repeated with the pinned credential scanner available:
83 passed, zero skips. An additional build-diagnostic control brings the later
tooling run to **84 passed, zero skips**. Rust-only corrections do not alter these
browser inputs.

The four new dollar/Markdown browser cases ran three times each against the pinned
WebKit browser: **12 passed**, zero failures, skips, retries or flaky acceptance.
The captured production JavaScript was independently byte-compared with the final
combined application build. This is browser evidence, not WebKitGTK desktop
evidence. Its combined working-tree receipt must not be attributed to the isolated
`c7203e2` commit.

Native crate results: documents **51 passed /7 existing opt-in cases not run
locally**; preview policy **7 passed**; updates **15 passed**, including four real
private-D-Bus timeout/terminal-result regressions. The D-Bus tests use their own
test daemon and never invoke the system package installer. They do not demonstrate
an actual PackageKit/Polkit upgrade. Rust formatting passed.

Native notice generation verified 346 third-party Cargo packages, 227 embedded npm
packages and 17 Rust legal resources. Notice SHA-256:
`22c389b80810875502248084d47c7c4427517acc783b99e28088c89ba79508cd`.
History/archive credential scans found zero findings. Raw audit reports remain
ignored; credentials and personal note folders are not bundled.

## Hosted observations

- [Initial mandatory run](https://github.com/TomasDelon/programmable-notes/actions/runs/45812064032):
  JavaScript `check` passed; native package step failed. The API exposes only a
  generic exit-code annotation. Redirected log downloads were denied by the
  execution environment, so the precise first compiler diagnostic was not
  observed. The independently identified incomplete ticket integration was fixed;
  it is not presented as the observed first CI diagnostic.
- [Full hosted browser run](https://github.com/TomasDelon/programmable-notes/actions/runs/45812315962):
  passed; matching Chromium, Firefox and WebKit were enabled. Downloadable browser
  results are attached to that run. These unchanged browser inputs remain relevant
  after Rust-only fixes.
- [Corrected mandatory run](https://github.com/TomasDelon/programmable-notes/actions/runs/45829899133):
  the entire native job passed, including the optimized production package,
  package inspection, native crates, real ENOSPC/crash/sync-error controls and
  GTK-dependent application unit tests. The JavaScript job also passed; both
  mandatory jobs completed successfully.
  A watcher HTTP 503 was an observer failure, not a build failure.
- [Download the Linux testing ZIP](https://github.com/TomasDelon/programmable-notes/actions/runs/45829899133/artifacts/15121738182):
  `linux-amd64-testing`, 12,080,533 compressed bytes. GitHub's artifact API verified
  that this upload exists and is unexpired. It contains the `.deb`, `SHA256SUMS`,
  `build.json` and installation instructions. The manifest records the actual
  build revision; PR builds may use GitHub's merge revision. The runtime/security
  readiness fields are deliberately false. This environment could not fetch the
  redirected artifact download, so no local installation is claimed. Downloads
  require GitHub sign-in and expire after seven days.

## Unexecuted desktop acceptance

This environment lacks GTK/WebKitGTK development libraries and a suitable
full-system desktop. Hosted build success cannot establish installed launch,
native chooser behavior, production namespace/cgroup enforcement, renderer Stop
or a real PackageKit/Polkit transaction. Existing renderer/containment blockers
remain in [NATIVE_SECURITY](../../NATIVE_SECURITY.md) and
[LINUX_DESKTOP_TESTING](../../LINUX_DESKTOP_TESTING.md). No namespace, cgroup,
AppArmor or process-isolation check was bypassed.

The older `native-fidelity.mjs` Visual selectors target the previous button/form
editor; they require adaptation before certifying the new shared Visual surface.
Its historical results are not new-surface acceptance.

On a compatible disposable Ubuntu amd64 desktop, use
[LINUX_LOCAL_EDITOR](../../LINUX_LOCAL_EDITOR.md) to verify the checksummed package,
open a disposable folder, edit in Visual/Source, undo/redo, save and reopen exact
source. Exercise cancellation, external-change conflicts, recovery and refusal of
unsafe/oversized folders. Repeat the native security contract against that exact
production package. Keep unrelated source bytes and permissions as assertions.

The signed update channel is intentionally unavailable until a real signing key
and authorized distribution feed exist. Configured-channel acceptance must cover
successful installation, user cancellation, corrupt signatures, replay/downgrade
refusal and indeterminate package-manager completion. Testing artifacts expire
after seven days and are not a permanent update service.
