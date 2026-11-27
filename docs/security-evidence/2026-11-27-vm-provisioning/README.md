# Share-free guest preparation and OS admission

Date: 27 November 2026, Europe/Paris. Scope: development test infrastructure, not
an accepted desktop application or production-security certification.

## Real preparation

Root executed the reviewed preparation and packing commands against a fresh
private task root. The public context contained exactly Dockerfile, configure.sh
and controller.pub; the private controller key stayed outside it. Fresh guest
server keys were generated during uncached configuration, not a cached build RUN.
No owner home, vault, keys, whole process environment or Git metadata was staged.

Actual Docker assembly and artifact copying passed. The two newly owned containers
exited successfully, the tool completed exact-ID cleanup, and a separate filtered
daemon query found zero remaining labelled containers or images. This does not
claim removal of ordinary public build-cache layers. The existing launcher then
passed its real layout check. **No guest was booted by this local preparation.**

The raw image is 6 GiB logically and approximately 1.64 GiB physically. Sparse
copying preserves exact bytes while avoiding allocation of empty disk blocks.
[Preparation receipt](preparation.json) contains the source/artifact hashes,
sizes, modes and cleanup observation. It contains no key material or local paths.
The raw image, controller key, guest server keys and private client state are not
public artifacts.

## Failures retained

- An initial conservative 20 GiB workspace budget refused with 16.3 GiB available,
  before Docker. Root verified the existing sparse behavior and its byte/hash/
  allocation regression, then used a 14 GiB operating budget. Guest size and all
  application sandbox/resource restrictions were preserved.
- The first CLI attempt assumed `/usr/bin/docker`; the actual managed client is
  in `/usr/local/bin`. An explicit two-location resolver now checks the executable
  without accepting a caller-controlled path or environment override.
- Docker metadata queries passed, but image building initially refused because
  BuildX tried to write state under the read-only home. Bounded diagnostic flags
  identified BuildX/read-only errors without printing raw credential-bearing
  output. Private task-owned BUILDX_CONFIG fixed the actual build; HOME and Docker
  trust/registry settings stayed intact.

Independent review also corrected subprocess ownership, mutable cleanup targets,
stream/TAR metadata bounds, proxy injection, incomplete probe reads and a source
identity filter. Negative controls cover these findings. Mocked Docker/SSH tests
remain logic evidence, not substitutes for the real execution stages.

The admission tool also retains failed-run receipts after validating the private
fixture root. They contain fixed stage/error categories and bounded return codes,
not raw SSH output, keys, mount paths or exception text. Cleanup failure stays a
failed result; invalid preflight writes no receipt. These failure controls have
been tested locally. The actual hosted attempt below failed; successful guest
admission remains unproven.

The complete required `npm run check` exited 0: **739 unit, 101 tooling (zero
skips), 152 Chromium, 9 local Pages and 4 inactive-cloud browser tests passed**,
plus format, lint, strict types and production build. The three new tooling
wrappers count 29 preparation, 31 packing and 28 admission Python controls;
routing tests cover old and VM dispatch combinations. The pinned scanner was
explicitly enabled. The staged-source secret scan found zero findings. No local
native Rust/GUI tests were rerun; no Rust or application UI source changed.

## Hosted execution and evidence retrieval

Required CI for source **3533fcc** passed in
[run 45913220787](https://github.com/TomasDelon/programmable-notes/actions/runs/45913220787).
This is the required application/build check result, distinct from optional OS
admission and from later work-in-progress source changes.

The manual standard-Ubuntu OS-admission
[run 45913264160](https://github.com/TomasDelon/programmable-notes/actions/runs/45913264160)
**failed** after its real image assembly and launch-layout validation completed.
The exact internal stage and error category are not established. The sanitized
receipt artifact could not be retrieved: Azure Blob downloads returned
`Forbidden`, including an approved retry. No signed download URL is reproduced.
That access failure is a limitation on diagnosis, not an explanation of the OS
admission failure. The original failed run and its artifact remain retained and
are not rewritten or promoted by later source/tests.

A permanent strict receipt reporter is implemented for subsequent runs. It reads
only bounded, owned, private regular receipt files without following symlinks;
rejects duplicate keys, unknown fields and invalid types/enums; and emits only
validated OS stage/error categories and bounded return codes as GitHub check
annotations. Public-key hashes, private paths, exception text and raw SSH output
are not printed. Its schema includes the writer's `protocol` category for invalid
probe responses, including cleanup failures originating in that stage.
Known failed probes include only a fixed check name (for example `cgroup_v2`),
never its raw value. Unknown exceptions do not receive an invented check. Seven
reporter CLI controls cover injection, misplaced labels and exact scope; the
smoke wrapper now counts 32 Python controls, preserving admission predicates.
The final tooling rerun passed **108 tests, zero skips** after these additions.

Reporting a valid failed receipt exits zero so diagnosis can complete; the
original smoke step still exits unsuccessfully and keeps the job failed. There
is no `continue-on-error` or rewritten old result. This delivery change does not
fix the unknown cause, establish the original failure stage or demonstrate a new
successful VM run. Native application acceptance remains outside OS admission.

The next actual run at **584631f**,
[45916879926](https://github.com/TomasDelon/programmable-notes/actions/runs/45916879926),
also **failed**. This time the validated check annotation was accessible:
`stage=boot_wait reason=timeout ssh_error=timeout returncode=255 guard_status=2`.
The [fixed annotation receipt](os-admission-45916879926.json) records its scope and
source commit. SSH admission timed out before any native application payload.
This establishes the failure category, not the guest-startup cause. Boot, pin/key
negative controls and normal shutdown are not reported as passing. Required
application/build CI for that source passed in
[45916875245](https://github.com/TomasDelon/programmable-notes/actions/runs/45916875245).

The follow-up diagnostic reports only ten fixed literal boot-marker names and
a serial byte count, together and only on boot failure. It reads the private
regular log through the pinned runtime directory after owned cleanup attempts,
with byte/time bounds and descriptor/path identity checks. Missing, changed,
unsafe or late evidence is omitted without masking the original failure. Raw
serial output is never published. Presence is advisory; absence does not establish
a cause, and no marker can pass admission. **42 Python controls and 9 reporter
CLI tests passed**; actual marker observations await the next runner execution.

## Actual startup observation and public network-file correction

At source **1ab4bb4**, required [CI45919131636](https://github.com/TomasDelon/programmable-notes/actions/runs/45919131636)
passed both jobs, including the production package and the Tauri test command
containing the four acquisition outcome cases. The separate
[VM45919175702](https://github.com/TomasDelon/programmable-notes/actions/runs/45919175702)
failed again at SSH boot timeout. Its [validated annotation receipt](os-admission-45919175702.json)
contains only `crng_ready`, `linux_kernel_started`, `systemd_started` and the
48,235-byte count. No raw serial output was published. These observed markers do
not establish the absence of another event or the timeout's cause. No native
payload, successful SSH admission, pin/key negatives or normal shutdown is claimed.

Review found a concrete permission flaw: `umask 077` plus the configuration
heredoc left the public DHCP `.network` file root-owned `0600`; networkd uses an
unprivileged service account. Provisioning now explicitly makes **only that public
file `0644`**. Private authorization stays `0600`; SSH, namespaces and resource
policy are unchanged. The new control executes the actual versioned fragment
under the private umask, checks exact bytes/modes and retains a private auth file.
It failed before the correction and passed afterward: **30 provision controls**.

A separate [actual Linux DAC receipt](network-mode-dac.json) records a fresh
pinned-Ubuntu, network-none container with no host mounts or owner data: non-owner
UID1001 could not read the root-owned `0600` file, then read exact bytes at `0644`.
The owned container was removed; a separate daemon query found zero remaining
probe containers. This proves the permission distinction, not actual networkd or
guest admission. Reproduce the versioned file-mode control with:

```sh
node --test tests/tooling/native-vm-provision.test.mjs
```

The correction still requires a **fresh** preparation/packing/admission run.
Old prepared contexts intentionally fail current source-hash validation. Do not
reuse the old private image, weaken admission checks or relabel earlier failures.

## Reproduce

On a disposable Linux host with Docker, Python and OpenSSH client:

```sh
pn_fixture_parent=$(mktemp -d)
pn_fixture_root="$pn_fixture_parent/fixture"
python3 -I -B scripts/native-vm-provision.py --prepare "$pn_fixture_root"
python3 -I -B scripts/native-vm-pack.py --pack "$pn_fixture_root"
python3 -I -B scripts/native-vm-launch.py --check "$pn_fixture_root/launch.json"
```

These commands do not boot. A failed new root is retained and cannot be silently
reused or overwritten. Never upload the fixture root. Preserve sanitized receipts
and clean only the newly owned disposable resources after use.

The optional existing CI workflow mode provisions host QEMU on a standard Ubuntu
runner and runs the fixed OS-admission smoke:

```sh
gh workflow run ci.yml --ref fix/preview-markdown-input -f native_vm=true
```

All other dispatch inputs must retain defaults. This mode excludes duplicate
ordinary builds and uploads only `native-vm-os-admission` JSON. It requires the
usual repository permission to dispatch Actions; it does not require application
secrets, a paid runner, a release or a merge.

## Current limits

Local image preparation and launcher layout checks have executed. A hosted OS
admission attempt failed; successful guest boot, authenticated OS admission and
normal shutdown must be demonstrated by their own complete runner result before
being claimed. The managed host has no host QEMU, sudo or package helper; no
unchecked container launch was substituted.

OS admission does not test the native application, malicious MDX, IPC/filesystem
denial, keyboard/geometry, native Stop/expiry or CPU/memory containment. Those
remain required after the infrastructure gate. No namespace restriction,
AppArmor policy or application isolation limit is disabled by this pipeline.
