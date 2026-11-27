# Next native fixture packet: clean image and SSH-only provisioning

Requirements SECURITY-01 and REACT-01; existing failed fixture remains unchanged.
Outcome: run the fixed inline React acceptance fixture through reviewed share-free
provisioning on a disposable standard Ubuntu GitHub runner with host QEMU.
Invariants: no host shares, owner data/credentials, private key in images or Docker
contexts, arbitrary QEMU arguments, production permission changes, release or paid
services. Keep actual native product and full security acceptance separate.
Witness: pin fresh guest host identity and authenticate with a host-only dedicated
key; verify actual guest mounts/authorized public key and actual launch inputs
before author payload. Wrong identity/key or a share/overlap must refuse admission.
Done: reviewed versioned preparation/transfer implementation, meaningful controls,
then actual fixture keyboard/pointer/geometry and trusted live Stop/expiry/cleanup
observations. Mocked launch alone cannot complete native acceptance.

Small phases:

1. Pinned official Ubuntu guest recipe and fixed assembly scripts. No entire repo
   or host filesystem context: only reviewed public scripts plus public auth key.
   Fresh server host keys generated after image-cache reuse, never published.
2. Fresh owned Docker assembly/packer containers, without host mounts; export root
   image inside container rather than privileged host tar extraction. Copy out only
   fixed raw ext4, kernel, initrd and PUBLIC guest host key. Private controller key
   stays in separate host auth root; guest server private keys stay in guest image.
3. Use existing fixed host QEMU guard. Host SSH with explicit identity, config-none,
   ForwardAgent=no, IdentitiesOnly=yes, strict pinned known_hosts; bounded transfer
   of allowlisted payload/evidence. No 9p, virtiofs, SMB, container key copy or
   checked-host-then-unchecked-container launch.
4. Manual-only standard Ubuntu24 GitHub runner can install host QEMU; this cloud
   host has no host QEMU, sudo or package helper. No paid runner/service. Checkout
   must not persist credentials; never stage .git, home, env or signing material.
5. Independent review before any guest run; test refusal/cleanup paths and retain
   input hashes, mounts, process/resource receipts and first failures. Curated
   evidence only; never upload images, auth roots, guest server keys or raw secrets.

Root owns integration, dist/4173 and full checks. Delegate disjoint preparation and
review only. Review exact file list/interfaces before code; avoid generic VM APIs.

## Failure feedback when artifact storage is unavailable

- **Outcome:** expose only validated OS-admission stage/categories through GitHub
  check annotations, so the cloud agent can diagnose a failed run without signed
  artifact URLs or raw SSH logs.
- **Invariants:** never print unrecognized fields, paths, keys, exception text or
  arbitrary receipt strings. Preserve the original failure and native-app-not-tested
  scope; reporting a failed result must not make the job pass.
- **Witness:** the actual reporter CLI maps a bounded valid receipt to one fixed
  safe annotation; forged scope, extra fields, oversized/symlinked input and
  message injection are refused without printing their values.
- **Done:** regression controls, workflow integration and actual runner annotation
  observed. The original failed run/artifact remain unchanged.
