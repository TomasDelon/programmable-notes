# ADR-034: Explicit trusted inline and whole-document runtime renderers

Status: implemented boundary; native product integration remains pending.

## Context

The existing shared RenderedEditor imported a RenderedRuntime that directly used
browser compilation and iframe presentation. Reusing that editor in a native
workspace could therefore instantiate browser execution without a validated native
runtime adapter. WebApp also directly owned its whole-document browser preview
hook and iframe presentation. The owner requires one shared product and isolated
interactive React in the same document/window, not a second platform-specific
editor.

## Decision

RenderedRuntimeContext accepts an optional trusted renderer component. The shared
RenderedRuntime owns no browser compiler or iframe dependency. Without a renderer
it displays an unavailable state. The
web bootstrap explicitly supplies WebRenderedRuntime, which contains the existing
island compilation/presentation behavior, including its paused state. No document
message selects a renderer.

The whole-document path uses `preview/DocumentRuntime.tsx`. Its trusted renderer
is a stable component, with a render prop that delivers presentation, current
status/error/source locations, availability and Stop/rebuild controls. Without a
renderer it delivers an unavailable state and inert controls; it imports no
browser compiler or iframe. The actual WebApp bootstrap explicitly supplies
`web/WebDocumentRuntime.tsx`, which owns the existing `useWebPreview` and
`WebPreview` integration. The render prop forwards the current result directly,
without a mirrored runtime state or another source/history owner.

The inline adapter receives compilation inputs and an error callback; the
whole-document adapter exposes its bounded presentation/lifecycle session.
Neither receives canonical-source publication, filesystem, native IPC or shell
authority. This component dependency injection is an application architecture
boundary, not a JavaScript sandbox. The renderer remains trusted application code;
authored React must still execute within the platform's independently enforced
sandbox.

## Consequences and limits

Existing browser island behavior and source preservation remain required. The
whole-document seam preserves `shouldCompileWholeDocument`, the existing compiler
and its 15-second deadline, iframe sandbox/referrer policy and HTML-keyed lifetime.
With unchanged executable HTML, Source/Preview and theme changes retain the frame;
retired requests withdraw their diagnostics and presentation through the existing
hook. Stop/rebuild, editable-island retirement and React-disable request reset
keep their existing behavior. The component split adds no history, canonical
source copy or UI redesign.

The workspace model and native lifecycle integration remain unfinished. No native
runtime is supplied, activated or accepted by this decision. Native pointer,
keyboard, geometry, Stop and containment acceptance still require reviewed
share-free infrastructure and real runtime evidence. The rejected native shell
is not an approved fallback.

Boundary tests cover unavailable/paused states and explicit adapter delivery;
whole-document controls also exercise stable renderer/frame identity and direct
diagnostic withdrawal. Existing compiler, island-lifetime and actual browser
interaction checks remain required. These do not establish installed native
behavior or complete product acceptance.
