# Packet: private native grants for shared document sessions

Requirements: DATA-01, EDIT-01, SECURITY-01; supports A04/A07/A10.

- **Outcome:** trusted host code attaches an authorized native document to a unique
  editor session; accepted publication writes its actual file through the existing
  DocumentSessions controller and native save/close ports.
- **Invariants:** session IDs, native grants and disk revisions remain separate;
  bindings and copied grant IDs stay private; no path authority, runtime service,
  second history, IPC, UI activation or storage fallback.
- **Witness:** tests bind exact source/CAS, independent documents, delayed replies,
  mutable inputs, duplicate attachment and uncertain close. A separate actual
  Store harness case observes controller publication on disk before flush, exact
  bytes, safe close/reopen and preservation of external conflicting bytes.
- **Done:** narrow injected factory, targeted TS/type/lint checks, actual Store
  harness and Rust example validation, followed by independent review. Installed
  Tauri/GUI/ACL and shared product activation remain separate acceptance gates.

The factory captures only save/close functions and five baseline fields, maps
host session IDs privately, and exposes a typed controller interface that omits generic attach.
This is a trusted-host API convention, not a runtime sandbox: the returned
instance still has the underlying method at runtime. Only successful attachments reserve identities. Successfully used
session/grant IDs are never reused, including after close; failed attachment never
closes any grant. Backend close acknowledgement removes the active mapping;
DocumentSessions continues to own close uncertainty and retained/unapplied text.

The external test writer may add bounded fixed-fixture close/open messages solely
to exercise controller lifecycle. Existing save messages, original harness cases
and the automatic-write negative control remain unchanged. This protocol never
enters the application or accepts a filesystem path.

## Progress

- [x] Tests-first implementation and targeted checks.
- [x] Actual Store controller publication/lifecycle/conflict witness.
- [x] Independent structural/helper review found no blocker; root final validation passed.

## Executed scope

The missing-module RED was observed before implementation. The targeted binding
and existing DocumentSessions suites pass together (36 tests); TypeScript and
targeted lint pass. The actual Store harness passes all original cases plus the
separate controller scenario; its original missing-scheduling negative control
still fails the original real-file observation. Rust example compilation/test
invocation succeeds; the binary's protocol is exercised by the real subprocess
harness rather than Rust unit cases. Baseline durability warnings and published
non-durable receipts remain blocked truthfully.

The adapter does not reconcile uncertain close or storage errors, retry writes,
release failed attachments, generate host IDs, authorize filesystem paths or
activate production UI. The trusted host supplies globally unique session IDs
and retains ownership of an authorized grant when attachment fails. A factory is
one binding owner for its controller lifetime. Unapplied text and failure recovery
remain the existing controller's responsibility; memory retention is not durable
recovery. No native GUI/ACL or installed close/restart acceptance is claimed.

Root final validation passed: complete check exit 0, 735 unit, 96 tooling/zero
skips, 152 Chromium, 9 Pages and 4 inactive-cloud cases; Rust document suite
79 passed/7 existing ignored slots, Rust formatting and real Store positive path.
The original negative control exited 1 at its exact automatic-disk assertion.
These are backend/browser development gates, not installed GUI/ACL acceptance.
