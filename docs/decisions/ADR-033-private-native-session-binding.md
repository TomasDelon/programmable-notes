# ADR-033: private native grants for shared sessions

Date: 26 November 2026. Status: binding and real-file harness; UI/IPC acceptance pending.
Requirements: DATA-01, EDIT-01, SECURITY-01; supports A04/A07/A10.

Bind authorized NativeDocument baselines to the existing DocumentSessions model
through one small injected save/close adapter. Copy grant, source, disk revision,
logical path and durability warning once; later input mutation cannot retarget I/O.
Resolve only a private grant from the host session ID, forward exact accepted source
and expected disk CAS, and map the native revision/durability receipt unchanged.
No filesystem path, runtime service, generic provider or new IPC permission is added.

Host session IDs are supplied by trusted application code and must be globally
unique for its session lifetime. This factory rejects reused or cross-aliased
session/grant identities. Reserve ownership only after a successful controller
attachment. Failure leaves the caller's existing native grant untouched and owned
by that caller; never silently close it, delete a file or overwrite a destination.
Close removes the active binding only after native acknowledgement. The controller
retains its conservative close-uncertain state on rejection or late unapplied text.

The typed controller interface omits generic attach. TypeScript Omit is not runtime
hardening or a security facade; the factory, ports and controller remain trusted
host services. None may be passed to authored React. The native import is type-only;
actual Tauri save/close functions are injected by the eventual platform bootstrap.
No browser persistence or alternate execution fallback is installed here.

An additive external Store harness now publishes through this actual binding and
controller and observes exact real-file bytes before flush. It checks close/grant
retirement, fresh reopening and external-conflict retention while preserving all
original cases and the missing-scheduling negative control. Its Rust test helper
accepts bounded save/close requests and opens only literal note.mdx through a
retained authorized Vault. The empty-struct Open variant rejects unexpected fields;
a unit variant had ignored them, though it never used a supplied path. This helper
is not linked into the application or exposed as native IPC.

Real backend I/O is not proof of OS picker authorization, registered Tauri denial,
installed UI autosave/close/recovery or inline React containment. Those gates remain
open. Read the [packet plan](../plans/native-session-binding.md) and implementation
status for executed results; future shared-product wiring must preserve explicit
native authorization and dirty/busy acknowledgement.
