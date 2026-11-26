# ADR-034: Explicit trusted inline runtime renderer

Status: implemented boundary; native product integration remains pending.

## Context

The existing shared RenderedEditor imported a RenderedRuntime that directly used
browser compilation and iframe presentation. Reusing that editor in a native
workspace could therefore instantiate browser execution without a validated native
runtime adapter. The owner requires one shared product and isolated interactive
React in the same document/window, not a second platform-specific editor.

## Decision

RenderedRuntimeContext accepts an optional trusted renderer component. The shared
RenderedRuntime owns no browser compiler or iframe dependency. Without a renderer
it displays an unavailable state. The
web bootstrap explicitly supplies WebRenderedRuntime, which contains the existing
island compilation/presentation behavior, including its paused state. No document
message selects a renderer.

The adapter receives compilation inputs and an error callback, never
canonical-source publication, filesystem, native IPC or shell authority. This
component dependency injection is an application architecture boundary, not a
JavaScript sandbox. The renderer remains trusted application code; authored React
must still execute within the platform's independently enforced sandbox.

## Consequences and limits

Existing browser island behavior and source preservation remain required. The
whole-document browser execution path stays in WebApp for this incremental slice;
it must also be extracted before native shared-workspace integration. No native
runtime is supplied, activated or accepted by this decision. Native pointer,
keyboard, geometry, Stop and containment acceptance still require reviewed
share-free infrastructure and real runtime evidence. The rejected native shell
is not an approved fallback.

Boundary tests cover unavailable/paused states and explicit adapter delivery;
existing island-lifetime and browser interaction tests cover web behavior. These
do not establish installed native behavior.
