# Programmable Notes — Product Vision & Architecture

> **Status:** Product concept and technical exploration. No implementation has been approved or started in this document.  
> **Working title:** Programmable Notes (placeholder, not a final product name).  
> **Captured:** 2026-11-17.  
> **Purpose:** Preserve decisions and key reasoning from the initial product-design discussion in one easy-to-revisit Markdown source of truth.  
> **Decision notation:** **Confirmed** = specifically requested/accepted; **Proposed** = recommended but not selected; **Deferred** = deliberately excluded from the initial scope; **Risk** = must be validated.

## 1. Product concept

A **cross-platform, AI-native, programmable note-taking application**. Notes are not only passive Markdown pages: they can contain interactive React components, user-defined Markdown syntax, executable code, and a broad variety of media. Both source and rendered views are editing interfaces. The goal is a fast, efficient experience on desktop, mobile, and the web.

**Core design idea:** a document is a structured, programmable artifact that can be edited by a person or AI and rendered as an interactive interface while retaining an editable source representation.

**Not the current goal:** clone Obsidian, Notion or Fluster wholesale. Investigations of other apps were to understand their technical principles, not to copy their complete UX or feature sets.

## 2. Confirmed product requirements

| ID | Capability | Expected behavior | Status |
| --- | --- | --- | --- |
| F1 | Cross-platform | Runs on Linux, macOS, Windows, Android, iOS, and in browsers, with excellent responsiveness and resource efficiency. | **Confirmed** |
| F2 | React + TypeScript/JavaScript | React components can render and operate **inside notes**, including interactive controls, visuals and JSX/TSX-based applications. | **Confirmed** |
| F3 | Code execution | Execute code using available local runtimes on desktops; provide limited browser runtimes and optional configured cloud/remote execution. | **Confirmed** |
| F4 | AI-native editing and creation | AI agents can create, modify, transform and organize notes and components through inspectable, reversible editing operations. | **Confirmed** |
| F5 | Programmable Markdown | Users can define syntax that is translated into React components. The syntax supports inputs, typed parameters, nested content, and very simple through very complex uses. | **Confirmed** |
| F6 | Full bidirectional editing | Users can edit source directly **or** edit the fully rendered preview. Edits must remain synchronized with a canonical document model. | **Confirmed**, with important technical qualification below |
| F7 | Universal media | PDFs, video, audio, images, SVGs, diagrams, and other formats should be viewable and eventually editable/annotatable within notes. | **Confirmed** |

### Explicit scope refinement

- A standalone, user-facing **visual component creation tool** was removed from the list of major features. The underlying component/syntax infrastructure is important, but the visual builder itself was considered superficial **for now**.
- The aspiration is that **everything in preview mode is editable**, not merely clickable or rendered. This includes text, tables, media and configurable React components. Arbitrary custom React code cannot automatically be translated back into editable source without a defined editing contract or adapter. Treat that as a product-level requirement to design toward, not an already-solved engineering fact.
- AI-assisted/autonomous development is the preferred implementation workflow, with humans retaining architecture, safety, and product decisions.

## 3. Programmable Markdown in detail

Users should be able to introduce **new syntax**, not just choose from a hardcoded set of markdown extensions. Examples:

**Minimal inline syntax:**

```md
The result is ==important==.
```

`==important==` could map to a custom React-rendered highlight with a user-selected background or color. This may be implemented through a simple declarative formatting extension rather than a full JavaScript module.

**Typed component inputs:**

```md
:::slider min=0 max=100 value=35 step=5
:::
```

This can map to a slider React component, using numeric properties validated before rendering.

**Complex declarative form:**

```md
:::form id=course-feedback
# Course feedback

?name: text
  label: Your name
  required: true

?difficulty: select
  label: Difficulty
  options: Easy | Medium | Hard

?rating: slider
  min: 1
  max: 10
  default: 5

@submit "Save response"
:::
```

This is **illustrative syntax**, not a finalized grammar. The form might render native/react controls, validate inputs, and save answers as structured data.

### Proposed component definition contract

Each syntax extension could declare:

| Field | Role |
| --- | --- |
| `id` / `name` | Stable identifier and package namespace |
| `syntax` | Inline / block / directive / custom parser grammar |
| `inputs` | Types, defaults, validation, options and required fields |
| `children` | Whether nested Markdown is allowed |
| `component` | React implementation or renderer mapping |
| `state` | Transient state versus persisted state |
| `outputs` | Optional values/events other components consume |
| `editor` | How a visual editor changes the underlying structured document |
| `permissions` | Allowed IO, data, file, network and execution capabilities |
| `version` | Compatibility, migration and reproducibility |

**Important separation:** user-defined syntax should be parsed centrally into a structured representation, rather than letting each React component invent an independent parser. Design for grammar precedence, collisions, parser diagnostics, versioning, and preserving standard Markdown semantics.

### Editing behavior

- **Source mode:** edit Markdown/MDX/JSX/TSX directly.
- **Rendered editing mode:** edit text, manipulate media, change component settings, add/remove/reorder blocks, edit table data, etc.
- **Single canonical document model:** both modes operate on the same content representation; changes are synchronized and undoable.
- **Configuration vs runtime state:** persistent values should serialize back into the document (e.g., change `value=35` to `value=60`), while temporary UI state need not modify source. For forms, user answers can go into structured storage rather than the form definition.
- **Arbitrary custom components:** to support meaningful visual editing, require or generate an editing adapter/schema. The application cannot guarantee arbitrary JSX source can always be reconstructed from the UI without loss.
- **AI editing:** use stable object identities and structured edits rather than uncontrolled text replacement where possible.

## 4. Execution model

Execution depends on the **actual device and connected capabilities**, not only the programming language.

| Target | Characteristics |
| --- | --- |
| **Local desktop** | On Linux/macOS/Windows, detect and use locally installed interpreters, compilers, packages and tools, subject to explicit authorization. Examples: Python environments, Rust, Go, C/C++, R, LaTeX, shell. |
| **Browser** | Limited isolated JavaScript/WebAssembly execution; optional Pyodide, WebR, and other browser-compatible runtimes. No direct access to host shell or installed applications. |
| **Cloud** | Optional explicitly configured server-side execution environments; supported languages depend on installed/containerized runtimes and allowed packages. Not unrestricted. |
| **Remote personal computer** | From browser/mobile, send authenticated jobs to an authorized companion service on the user's own computer; uses that computer's toolchains while it is online/reachable. |

A unified execution API should expose: language, source code, target, runtime/environment ID, resource/time budgets, cancellation, stdout, stderr, exit status, and rich artifacts. Runtimes should advertise **capabilities** so the UI can offer only compatible targets.

**Security constraints:** opening or displaying a note must never silently launch host processes. Imported components and untrusted code should run in constrained environments with scoped filesystem/network capabilities. Shell/tool access must not be granted simply because a note contains a React component. Use different trust levels for trusted local code versus imported or AI-generated content. Tauri plugin shell access is not a substitute for a security sandbox. iOS distribution policies and browser WebKit limitations require early validation.

**Execution outputs:** text, error logs, tables, SVG/PNG plots, interactive HTML, PDFs and other artifacts should embed naturally in documents. A notebook-like execution protocol could borrow ideas from Jupyter MIME bundles and kernel messaging.

## 5. AI-native editing

Treat AI integration as infrastructure, not a chatbot bolted onto the editor.

AI should be able to:

- Locate and read notes, sections, equations, media references and component definitions.
- Create and modify Markdown, MDX, React/TSX components, custom syntax extensions and code cells.
- Make structured changes with precise targets, diffs, undo/redo and transaction boundaries.
- Ask the execution system to run authorized tests and return results to the document.
- Review errors, suggest fixes, and regenerate or refactor content without silently destroying unrelated material.
- Prepare large changes for review and preserve provenance and version history.

**Proposed foundation:** stable IDs for document nodes, components, code cells, results, figures and datasets. A structured tool/API surface should expose inspect, insert, update, move, remove, execute, compare and revert operations. AI permissions must be separate from rendering permissions.

Autonomous coding agents (e.g. Codex) are the preferred development method, but their actual autonomy, access and test execution must be verified. Do not assume work continues in the background unless the runtime supports it.

## 6. Universal media

A note should contain more than hyperlinks or opaque attachments. Desired media behavior:

| Medium | Desired interactions |
| --- | --- |
| PDF | Embedded viewer, page navigation, selection/search, annotations, links to pages or regions |
| Video | Playback, seekable timestamps, annotations, subtitles where available |
| Audio | Playback, waveform/timestamps, transcript integration when available |
| Image | Zoom, resize, annotate, reference regions |
| SVG | Crisp vector display, optional structured/vector editing |
| LaTeX/math | Fast typesetting; mathematical source remains editable |
| Diagrams | Mermaid and potentially editable diagram sources |
| CSV/JSON/data | Tables, structured views, graphing, optional code interaction |
| 3D models | Interactive preview via opt-in libraries where supported |
| Code | Syntax editing, run controls and captured outputs |

**Avoid loading heavy libraries automatically:** PDF, Three.js, graphing engines and other advanced renderers should be lazy-loaded when required.

## 7. Recommended technical stack (proposals, not locked decisions)

| Layer | Candidate | Why |
| --- | --- | --- |
| Shared UI | React + TypeScript | Native component format for the documents; broad ecosystem |
| Web build | Vite + PWA | Shared frontend, fast iteration, offline installability |
| Desktop/mobile shell | Tauri 2 | Native APIs with a reusable web UI, smaller bundles than Electron in many cases |
| Native operations | Rust | File access, process supervision, indexing, platform bridge |
| Markdown/MDX | `@mdx-js/mdx`, `remark`, `rehype`, `micromark` | Pluggable grammar plus JSX-capable rendering |
| Source editor | CodeMirror 6 | Highly configurable, mobile-friendly editor primitives |
| Structured visual editor | Evaluate ProseMirror/TipTap or Lexical with custom nodes | Needed for actual rendered editing; requires proof of lossless source round-tripping |
| Local native storage | SQLite + filesystem | Offline-first, durable notes and metadata |
| Browser storage | IndexedDB / OPFS adapter | Web compatibility, optional offline storage |
| Browser Python/R | Pyodide / WebR | Limited execution where compatible |
| Remote/cloud runtime | Capability-scoped runner, isolated processes/containers | Safe transport and execution; no exposed generic shell |
| Synchronization | Independent adapter/protocol (to design later) | Do not couple document model to server availability |
| Styling | Lightweight shared design tokens / CSS, optional Tailwind | Responsive UI across screen sizes |

### Proposed monorepo

```text
apps/
  web/                  # Browser/PWA
  native/               # Tauri desktop + mobile
packages/
  editor/               # Source and rich editing experiences
  document-model/       # Canonical AST, identities, change operations
  mdx-engine/           # Parsing, transforms, compilation, rendering
  components/           # Registry, schema, editing adapters
  execution-protocol/   # Target discovery, jobs, streams, artifacts
  storage/              # Local persistence and web adapters
  ai-tools/             # Permissioned structured operations
  ui/                   # Cross-platform React components
  sync/                 # Future cross-device synchronization
```

This is a **candidate layout**, not an approved repository structure.

## 8. Performance and portability principles

- Local-first editing; typing must not wait for disk, network or AI.
- Keep computation off the main UI thread when possible; debounce, cache and incrementally process MDX instead of rebuilding on every keystroke.
- Lazy-load heavy media and scientific libraries.
- Virtualize long documents and large lists; avoid re-rendering all note components when one value changes.
- Use desktop and mobile-specific navigation, selection and keyboard/touch behaviors while sharing the document model and renderer.
- Test actual WebKit/iOS, Android WebView, and Linux/macOS system webviews, not only desktop Chromium.
- Set measurable performance budgets later (editing latency, startup, memory, bundle size and large-document behavior). Any proposed frame-time target is aspirational until measured.

## 9. Research findings from Fluster

The open/publicly inspectable Fluster cross-platform repository demonstrated a compact MDX-to-React pipeline:

1. Persist the raw MDX note content (Rust model with `file_path`, `raw_body`, `ctime`, `last_read`).
2. Compile MDX with `@mdx-js/mdx` and remark/rehype plugins for math, Mermaid, code, etc.
3. Evaluate the resulting function-body module via MDX `run()` using `react/jsx-runtime`.
4. Resolve component tags through an explicit component map, then render them via React.
5. Use a debounced parse hook (300 ms default) and React error boundaries.

**Key limitation:** a fixed registry of known components is not automatically a universal arbitrary npm/React component execution environment. For our product, package loading, permission boundaries and editor adapters need to be designed deliberately.

Relevant source pointers:

- [Fluster repository](https://github.com/flusterIO/fluster)
- [MDX compiler](https://github.com/flusterIO/fluster/blob/main/apps/fluster/src/features/mdx/data/parse/mdx_to_jsx.ts)
- [Debounced MDX parse and runtime](https://github.com/flusterIO/fluster/blob/main/apps/fluster/src/features/mdx/state/hooks/use_debounce_mdx_parse.tsx)
- [Component map](https://github.com/flusterIO/fluster/blob/main/apps/fluster/src/features/mdx/data/component_map/get_component_map.tsx)
- [Renderer / ErrorBoundary](https://github.com/flusterIO/fluster/blob/main/apps/fluster/src/features/mdx/presentation/parsed_mdx_content.tsx)
- [Raw MDX note model](https://github.com/flusterIO/fluster/blob/main/apps/fluster/src-tauri/src/features/mdx/data/mdx_note_model.rs)

This investigation inspected source files; it did not compile, benchmark or security-audit Fluster. Its license should be checked at the precise revision before reusing code.

## 10. Architectural risks and unresolved questions

| Issue | Significance | First validation |
| --- | --- | --- |
| Editing **arbitrary** rendered React components | A generic renderer cannot infer a reversible visual editor from arbitrary JSX. | Prototype 3 components with typed editing adapters and source round-trip tests. |
| Arbitrary syntax extensions | Grammar conflicts, ambiguous nesting and broken source preservation. | Define block/inline grammar plugin contracts with parser snapshots. |
| Dynamic JS/TS/npm dependencies on mobile | Browser/WebView, bundling, permissions and iOS policy constraints. | Mobile spike with one custom React component and one external dependency. |
| Running code on the host | Host compromise or data loss if untrusted content gains process access. | Isolated, permission-scoped runner; test denial of forbidden IO. |
| Cross-platform local-first storage | Browser, desktop and mobile differ in filesystem/storage semantics. | Same note CRUD and crash recovery across native and web adapters. |
| Synchronization | Offline conflicts, attachments, versioning and recovery. | Defer a specific sync engine until document model and IDs stabilize. |
| AI reliability | Unintended broad edits, hallucinated code, silent content loss. | Structured operations, exact diffs, rollback and test-driven acceptance. |
| Resource usage | MDX compilation, large PDFs, 3D and concurrent components may overload mobile devices. | Profile memory, cold start and render latency on low-spec devices. |

## 11. Complexity and delivery expectations

Earlier architectural assessment: roughly **9.5/10** overall complexity. This is a large editor/runtime/platform integration project. Full visual editing of arbitrary components is the hardest part, followed by secure execution, custom grammars and cross-platform packaging.

Initial planning estimates assuming motivated AI-assisted/autonomous development and real test infrastructure (not commitments):

| Phase | Rough optimistic planning window | Scope |
| --- | --- | --- |
| Proof of concept | 2–4 weeks | Web Markdown/MDX editor, basic React preview and simple visual edits |
| Functional MVP | 2–4 months | Useful note editor, AI tools, core custom syntax, basic code execution |
| Advanced personal version | 6–12 months | Linux/macOS/web, mobile prototypes, richer programmable Markdown |
| Mature personal application | 12–18 months | Hardened runtime, media, sync, stability |
| Full polished vision | 18–36+ months | Every platform, stronger isolation, complex visual editing and polish |

**Target rather than promise:** a useful personal version in approximately **six months** was discussed as an ambitious goal if the scope is constrained. Autonomy speeds parallel implementation, not architecture validation, security auditing or real-device testing.

## 12. Proposed sequence of development

### Stage 0: foundational proof of concept

- Web app with note files and CodeMirror editing.
- Markdown/MDX to React component preview.
- A custom inline syntax (`==highlight==`) and a typed block syntax (`:::slider`).
- Source-to-rendered preview and an editable preview for at least native text and one schema-defined component.
- Autosave and undo/redo; make round-trip preservation measurable.
- Minimal local/browser code execution sandbox.

### Stage 1: daily-usable personal editor

- Better structured document model, stable node IDs and history.
- AI-readable and AI-writable operations with diffs and rollback.
- Core file and PDF/image embedding.
- Desktop packaging with local runtime discovery and explicitly authorized execution.
- Integration and regression tests.

### Stage 2: portability and extensibility

- Android and iOS validation of editor, component runtime and WebView behavior.
- User-defined grammar schemas, extension packaging/versioning and typed inputs.
- More media viewers and additional language runtimes.
- Browser, cloud and/or connected-computer execution adapters, as justified.

### Stage 3: reliability and scale

- Local-first synchronization and conflict handling.
- Stronger component isolation and dependency management.
- Long-document performance, accessibility, backup/restore, installation and security hardening.

Stages are **proposals**, not an approved development backlog.

## 13. Deliberately deferred or not decided

- A full drag-and-drop visual component builder. The underlying extension API matters now, but the dedicated builder is **deferred**.
- Infinite canvas, reactive inter-note dataflow, adaptive learning, collaboration and a public component marketplace. Interesting future directions, **not in the confirmed seven-feature list**.
- Exact application name, visual design, collaboration model, backend/cloud provider, account/auth system and sync provider.
- Whether MDX source files or a more structured document model are the primary canonical storage format; the round-trip editing problem should decide this.
- Whether the first mobile release uses Tauri 2 or a separate web wrapper, pending prototype results.

## 14. Product decisions still needed

1. Define what “everything editable in rendered mode” means for third-party React components and what editing metadata is mandatory.
2. Choose the canonical representation: Markdown/MDX-first with source maps, AST-first with Markdown serialization, or a carefully separated hybrid.
3. Define the first custom syntax grammar, typing and precedence rules.
4. Specify trust levels and boundaries for JSX, AI-generated components and code execution.
5. Choose a minimal set of supported platforms for the first shipped daily-use milestone while preserving portability.
6. Write executable acceptance tests for source round-tripping, runtime capability discovery and offline persistence.

---

**One-sentence vision:** A fast, local-first, AI-native note-taking application where people can program their own Markdown syntax, embed and edit interactive React interfaces, run code on compatible execution targets, and use the same knowledge base across desktop, mobile and web.
