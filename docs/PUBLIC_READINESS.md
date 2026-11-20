# Public repository remediation

The owner intentionally made this repository public. This report does not request
publication approval or propose reversing visibility. PR #1 remains draft.

**Recommendation: NO-GO for an unqualified public-remediation sign-off or general
redistribution.** No live credential was confirmed; immediate current-file privacy
mitigation is applied. Historical contact/source metadata and publication rights
still require owner decisions. Technical development can continue independently.
This is not a production security-readiness certification.

## Scope and method

The baseline audit covered both remote branches, PR #1 head/merge refs and all
local Git objects: 88 reachable commits at `b8402d1`, 1,812 distinct local blobs
(92,086,844 bytes), 10 historical ZIP blobs and 288 logical archive members
(115 distinct members). The repository was not shallow. Archive traversal was
bounded, without executing its content; no extraction failure was reported.
Documentation, fixtures, journals, workflows, screenshots, recordings and
commit author/committer metadata were included. Later remediation commits are
also covered by the continuing history scan.

Official Gitleaks 8.30.1 was verified against its release checksum. History and
exported-blob/archive scans each reported four matches. All four were independently
identified as public X.509 kernel-module signing certificate fingerprints in
synthetic Linux journals, rather than private keys or API credentials. Only their
four immutable historical finding fingerprints are excepted by `.gitleaksignore`;
there is no blanket rule/path exception or inline-allow bypass.

Media review inspected metadata from 196 image occurrences, decoded all 2,096
frames of eight distinct WebM recordings, and OCR-scanned 2,095 distinct image
contents. No email, credential-label, private-home-path or private-image-metadata
candidate was returned. Contact sheets of all 59 distinct original images were
visually inspected; these showed synthetic editor/desktop tests and icons.
Thumbnail inspection and OCR are imperfect; no claim of exhaustive human review
of every video frame is made. Full-resolution raw audit output is ignored and is
not published because it may reproduce the data being audited.

## Findings and remediation

| Finding                                                  | Applied correction                                                                                                                                                             | Residual exposure / action                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal-provider email in 86 of 88 baseline commits     | Future local commits use the verified owner's GitHub noreply identity; new commit metadata checked                                                                             | Historical author/committer metadata remains public. Value withheld. Owner must accept exposure or authorize a coordinated history rewrite. A mailmap would not remove it. |
| Private original-source reference in research provenance | Current pointer withheld; original research bodies/public citations retained                                                                                                   | Historical versions remain public. Owner should review the original document's sharing separately. Removing a pointer does not revoke sharing or erase history.            |
| Browser demo lacked complete dependency license texts    | Full upstream notices accompany the historical demo; identical dependency lock verified. New builds generate notices and demo assembly refuses missing notices                 | Preserve the sidecar with old archives. Historic archive bytes/checksums are retained as evidence.                                                                         |
| Preserved prototype font lacked complete OFL text        | Actual embedded-font attribution plus full SIL OFL1.1 text added alongside the original archive                                                                                | Retain the sidecar with the design ZIP; broader design/research rights remain unconfirmed.                                                                                 |
| Future credential disclosure risk                        | Expanded ignore rules, pinned/redacted history-and-ZIP scanner, Git/ZIP synthetic-key refusal tests (including shared non-ZIP blob aliases), least-privilege workflow checkout | Ignore rules do not remove tracked/history data. Arbitrary binary/media privacy still requires manual review.                                                              |
| Mutable workflow actions and duplicate build cost        | Actions pinned to upstream commit IDs, checkout credential persistence disabled, release-mode Tauri tests reuse the packaging dependency profile                               | Review/update pinned action commits deliberately. No sandbox tests removed.                                                                                                |

No confirmed credential requires rotation based on this audit. If the owner knows
of a credential disclosed elsewhere, revoke/rotate it before considering any
history cleanup. Historical public copies, forks, PR refs and caches may survive
a rewrite; no automatic erasure guarantee is possible. No shared history was
rewritten and no important evidence was deleted.

## Licensing and redistribution

There is no project open-source license. Public visibility does not grant a
general reuse license, and this work does not choose one. The owner must decide
whether/how to license original application code and confirm rights to publish
supplied research/design materials. Third-party texts do not settle those rights.

`docs/demo/THIRD_PARTY_NOTICES.txt` preserves actual upstream texts for 167 installed
production npm dependencies/direct tools. The historical demo engine `54c41a7`
uses the same lockfile as the notice inventory. Build generation validates installed
versions, rejects missing/escaping license files and places the notice asset in
future browser/native frontend builds. Wry's fork attribution and existing license
files remain intact. The font sidecar uses embedded attribution and official SPDX
SIL OFL1.1 license text.

**Full Rust/native binary redistribution attribution is not complete.** Automatic
native installer uploads are paused until that inventory is included; mandatory
production builds and package inspection continue. Existing installers/evidence
have not been deleted. This does not claim that an experimental package is ready
for unrestricted redistribution. Browser review artifacts are opt-in and carry
full browser dependency notices; the project itself remains unlicensed.

## GitHub Actions and cost

Actual public run [44694104501](https://github.com/TomasDelon/programmable-notes/actions/runs/44694104501)
on `8a8e44c` executed and passed **both** `check` and `native-check`. This includes
TypeScript/Vitest/Chromium, Rust/Tauri, real ENOSPC, writer-crash/sync-error gates,
Wry verification and optimized Debian package inspection. It is evidence that the
former private-account pre-run billing refusal did not block this public run.
The revised pinned/scanning workflow also executed and passed both jobs in
[44697972078](https://github.com/TomasDelon/programmable-notes/actions/runs/44697972078)
on `7226bcc`, including the synthetic-key controls and production package build.
The new Save gates then actually executed and passed in both-job-success run
[44699786688](https://github.com/TomasDelon/programmable-notes/actions/runs/44699786688)
on `367626f`: real ENOSPC, four writer SIGKILL stages and both original Save EIO
cases. A later documentation head must be observed separately. Compilation/package inspection is not native GUI acceptance.

Only standard `ubuntu-24.04` runners are used. Tokens have `contents: read`;
there is no `pull_request_target`, self-hosted runner, paid service or secret-based
build dependency. Superseded PR runs cancel. Full browser tests remain mandatory;
recording/uploading the walkthrough is an explicit manual input with seven-day
retention. Failure screenshots also have seven-day retention. Raw scanner reports
are never uploaded. Production native packaging occurs before security-feature
release tests, preventing test-feature code from contaminating the installer.

[GitHub's official billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
states standard hosted compute is free for public repositories; larger runners
are billed even for public repositories. Artifact/storage allowances are separate
and must not be described as unlimited free storage. Repository cache allowance
is 10 GB unless the owner elects a higher paid limit. No spending/cache limit,
account setting, subscription or budget was changed. A successful run does not
guarantee that future account-level restrictions cannot occur.

## Verification and limitations

- Full local check: formatting, ESLint, TypeScript, 114 Vitest tests and 37 real
  Chromium tests passed. The notice generator produced 167 complete package
  notices. Tooling controls verify license/version/path refusal and synthetic
  key rejection; see the dated progress checkpoint for final command results.
- Both baseline and revised public CI executed and passed as linked above.
  The new Save acceptance steps also executed successfully on `367626f`.
- Fresh demo capture, manifest/CRC verification, ten malformed-artifact refusal
  controls and clean-extracted real Chromium interaction/playback checks passed.
  Missing notices are one of the refused cases. An anonymous public clone checked out exact commit `7226bcc`, installed from
  scratch with `npm ci`, and passed the full check: 114 unit, 37 Chromium and
  four tooling controls (none skipped). Its history/archive scan also returned
  zero additional findings. Browser binaries were shared; generated runtime,
  dependencies and build output were absent before installation.
- Existing native evidence remains valid only for its recorded builds. The
  disposable Ubuntu VM has since been restored and a standalone real original
  Save ENOSPC gate passed there. This is separate from native GUI acceptance;
  a separate fresh-profile full native fidelity/restart/recovery command also
  passed. The recorded existing ELF scope is retained. No new full malicious
  WebKitGTK/cgroup matrix is claimed by this remediation.
- Native JavaScriptCore/WebKitGTK renderer crashes, startup reliability and the
  earlier instantaneous PID observation remain technical risks. The later bounded
  six-case observer run passed but did not establish the cause of the old failure.
  Physical GPU/Wayland and other distributions are separate untested compatibility
  areas; they do not block independent source-fidelity/recovery engineering.

## Owner-controlled decisions

1. Accept historical personal/source-pointer exposure, or authorize a coordinated
   history rewrite and external cache/fork remediation after preserving evidence.
2. Review source-document sharing and confirm research/design publication rights.
3. Choose a project licensing policy, if general reuse is intended.

No visibility change, merge, public release, history rewrite or PR readiness
promotion is performed. These decisions do not require pausing ordinary safe
engineering. Next technical work is the already-reproduced original Save sync-error
regression, followed by native renderer/startup investigation in a disposable VM.

## Continued independent native reliability work

After the audit, a further actual packaged-editor test passed real original-Save
ENOSPC UI handling: visible **Source retained**, exact original bytes/mode/sibling,
retained Visual input and Undo/Redo, then explicit Save/reopen after freeing space.
Its guarded external-only filler and pidfd cleanup add no application privilege.
The first input-observer failure is retained with its exact source fingerprint.
[Actual screenshot, exports, results and reproduction](security-evidence/2026-11-20-native-save-enospc/README.md).
Two added refusal controls make the latest local tooling count six; prior
clean-checkout and hosted counts above keep their earlier scope.

## Embedded compiler attribution follow-up

The npm esbuild-wasm MIT file does not include Go's embedded runtime notices.
Actual WASM build information identified go1.26.5; the historical browser review
contains the identical compiler bytes. Official Go root LICENSE/PATENTS and its
standard-library vendor/Boring license files were retrieved and their Git blob
hashes verified. Eleven actual texts now accompany both generated notices and
the historical review sidecar, explicitly labeled as a source-license superset.
This does not assert every listed component is linked or assign an app license.

Build generation rejects a changed compiler version, WASM fingerprint or notice
fingerprint. Demo packaging rejects omission of the complete embedded text.
A synthetic positive plus asset/version/truncated-text refusal test passed.
[Inventory and update procedure](../licenses/README.md). Native Rust binary
attribution remains incomplete and automatic installer upload remains paused.
The historical email/source exposure and owner publication-rights decisions are
unchanged; the unqualified remediation/redistribution recommendation remains NO-GO.
