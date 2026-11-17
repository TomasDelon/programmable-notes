# Programmable Notes | Current Product Specification

**Status:** Consolidated decisions through 2026-11-17. This document supersedes the priority ordering in the historical overview and the oldest brainstorming proposals.

## Product thesis

A **local-first, cross-platform, AI-native MDX editor**, in which the author can write and render *real React components directly in the document*. It combines notebook-like expressive power with Markdown authoring and eventual rendered editing. It should be usable without configuring custom components or a grammar.

## Capabilities by priority

| Priority | Capability | Expected behavior |
|---|---|---|
| P0 | Native MDX/React authoring | `.mdx` content with Markdown, JSX, JavaScript expressions, ESM import/export and authored React components. Full React state/hooks/events; clear behavior for external TSX modules and typed source. |
| P0 | Interactive live preview | Compile changes from editor buffer, render component tree, show errors precisely, preserve a working editor during failures. |
| P0 | Local documents | Save, reopen and manage local `.mdx`; ordinary `.md` notes supported. Original text is authoritative for source editing. |
| P0 | Source editor | Fast, reliable text editing with Markdown/JSX syntax support, undo/redo and source preservation. |
| P0 to P1 | Security boundaries | Treat imported/user-authored/AI-generated JS as untrusted; no privileged app access by rendering. |
| P1 | Dual source and rendered editing | Begin with source mode; progressively edit rendered text where source mapping can be proven, and add adapters for custom elements. Interactive state is not automatically document editing. |
| P1 | Git/GitHub | Local Git history, optional opt-in GitHub synchronization; auto-save is not auto-commit; Google Drive secondary/future. |
| P1/P2 | AI-native workflows | AI can inspect, propose, diff, review, patch and revert document changes through explicit permissioned operations. |
| P2 | Code execution | Explicitly authorized code cells/runtimes and output artifacts, separate from passive React preview; browser/local/optional remote depending on capabilities. |
| P2 | Rich media | PDF, images, SVG, LaTeX, diagrams, audio, video, data and optional 3D through lazy-loaded viewers/adapters. |
| P2 | Cross-platform | Share web-compatible core; Linux desktop is practical first test target, followed by browser/macOS/Windows and later mobile with device-specific validation. |
| Future | Reusable/customizable React components | Built-in registry and user packages; no need to invent custom markup to define a React component. |
| Future | Programmable Markdown shorthand | Optional declarative/contextual syntax such as `#form()[...]` lowers to the SAME MDX/React system. Standard Markdown redefinition not required. |

## Accepted product decisions

- Local files are the source of truth; Git history and GitHub synchronization are optional.
- Authors can **write JSX/React directly**. This is the core of the application.
- Components may be authored in the document or imported, including interactive state and nested composition.
- A source editor and interactive preview are essential; full rendered editing is a product objective, not an assumed technical capability.
- Ready-made components should be available eventually; users must not be forced to define forms or grammar rules to use the editor.
- Advanced users may edit component code and future syntax mappings as files.
- Custom syntax is an **extension after** MDX/React functions reliably, not a prerequisite.
- Existing Markdown semantics need not be arbitrarily overridable.

## Definitions that prevent ambiguity

- **Source editing:** modifying `.mdx` text, imports, props, JSX or Markdown characters.
- **React interaction:** button clicks, input changes, hook state. These do *not* necessarily modify the source document.
- **Visual document editing:** edits to rendered text/components that generate safe, reversible source changes.
- **Component editing adapter:** an opt-in contract that can map an explicitly editable field/prop to source without rewriting arbitrary React code.
- **Code execution:** authorized invocation of language runtimes/shells/compilers, distinct from in-preview React rendering. Rendering alone must never run host shell commands.

## Honest guarantees and limits

- The `.mdx` extension identifies the native authoring source. MDX/React use is intended to be first-class. `.md` interoperability is a distinct format compatibility goal.
- MDX accepts JSX and JavaScript expressions. **Arbitrary TypeScript annotations inside `.mdx` ESM are not automatically guaranteed** by the baseline MDX parser. Test and document whether typed syntax is supported via preprocessing, or initially in imported `.tsx` modules.
- Arbitrary npm imports are a feature target but must be resolved and bundled explicitly and safely. Dynamic runtime installation is not automatic.
- There is no generic inverse from React's rendered DOM into the author's JSX or original MDX. Unknown components remain atomic in visual editing, with source editing always available.
- The future custom syntax is not yet finalized. `#name(args)[children]` is an illustrative/approved direction but subject to collision and parser tests.

## UX acceptance story

An author creates `lesson.mdx`, writes Markdown and a `Counter` React component with a hook, sees a live interactive rendered result, edits its source, sees the preview update, handles a deliberate syntax error without losing any content, saves the file, closes it and reopens it with identical bytes. That is the first actual product capability to prove.
