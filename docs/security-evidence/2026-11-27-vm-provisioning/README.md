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
been tested locally, while actual guest admission is still pending.

The complete required `npm run check` exited 0: **739 unit, 101 tooling (zero
skips), 152 Chromium, 9 local Pages and 4 inactive-cloud browser tests passed**,
plus format, lint, strict types and production build. The three new tooling
wrappers count 29 preparation, 31 packing and 28 admission Python controls;
routing tests cover old and VM dispatch combinations. The pinned scanner was
explicitly enabled. The staged-source secret scan found zero findings. No local
native Rust/GUI tests were rerun; no Rust or application UI source changed.

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

Local image preparation and launcher layout checks have executed. Actual guest
boot, authenticated OS admission and normal shutdown must be reported from their
own runner result before being claimed. The managed host has no host QEMU, sudo
or package helper; no unchecked container launch was substituted.

OS admission does not test the native application, malicious MDX, IPC/filesystem
denial, keyboard/geometry, native Stop/expiry or CPU/memory containment. Those
remain required after the infrastructure gate. No namespace restriction,
AppArmor policy or application isolation limit is disabled by this pipeline.
