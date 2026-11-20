# Architectures for “Programmable Notes”

**Summary:** Programmable Notes must start with a robust MDX+React core, deferring any custom syntaxes to later. The system will treat plain MDX/JSX/TSX as first-class content, rendering React components in a live preview. The editor has two modes: code (MDX source) and rich view (rendered). Key sub-systems include an MDX parser/bundler (compiling MDX to React code), a code editor component, a React runtime UI, and local file storage (Git-based). We summarize current best practices, libraries, and trade-offs. 

## 1. MDX Parsing, Compilation, and Bundling

- **MDX Compiler:** The official MDX compiler (`@mdx-js/mdx`) can turn MDX (Markdown with JSX) into a JS/React module【1†L84-L93】【1†L108-L117】. It supports full JSX/TSX syntax, imports/exports, and JSX runtime (React/Preact/etc.) by configuration【10†L47-L56】【10†L74-L83】.  Any valid React component code (state, hooks, etc.) inside the MDX file is supported. 
- **Standalone vs Bundler:** For a custom editor, we can call `@mdx-js/mdx` at runtime to compile MDX strings into React components【16†L62-L71】. Alternatively, for a packaged app we can use bundler plugins (Vite/Rollup) to handle `.mdx` files via `@mdx-js/rollup` or similar【12†L1-L4】【12†L69-L77】. Both approaches let authors write imports from npm modules or local files. Dynamic `import(…)` is supported by the JS environment (browser or Node) and would be handled by the bundler or runtime loader.  
- **Bundler Choice (Vite/Rollup/Esbuild):**  
  - *Vite/Rollup:* The `@mdx-js/rollup` plugin works for Vite or Rollup, seamlessly handling MDX compilation into JSX【12†L1-L4】【12†L69-L77】. Vite (with `@vitejs/plugin-react`) is a common choice for fast HMR and familiar ES module loading.  
  - *Esbuild:* There is an `@mdx-js/esbuild` plugin if we want Rust-based speed. However, esbuild currently has more limited JSX-TS support (no type-checking, fewer plugins).  
  - *SWC:* SWC (the Rust-based TS/JS compiler) can also compile JSX/TSX to JS and is very fast; it could serve as a bundler backend. Official MDX tools don’t yet provide a first-party SWC plugin, but MDX output can be fed into SWC.  

  In practice, **Vite + `@mdx-js/rollup`** is battle-tested and developer-friendly. It supports code-splitting, source maps, TSX, and HMR. We would need to configure it so MDX compilation happens *before* React processing (e.g. `enforce: 'pre'`). Official docs recommend forcing MDX plugin to run first if also using React plugin【12†L69-L77】. 

- **MDX Features & Limitations:** MDX (v3+) is quite mature. It supports frontmatter, math, LaTeX (via remark/rehype plugins), and custom components out of the box【8†L254-L262】. It serializes everything via unified/rehype to an ESTree-compatible JS AST, then uses a fast generator (`astring`)【6†L1106-L1114】. By default it handles standard Markdown (including GFM) plus JSX. **Known limitation:** MDX does not auto-sandbox imports or limit side effects – it assumes you trust the MDX code or run it in a controlled environment.

- **Hot Reload & Caching:** With Vite/esbuild, editing an `.mdx` file will trigger incremental recompilation. Vite’s dev server can handle TSX imports and show compile errors live. We should plan to use an in-memory cache of compiled components for fast updates. All output should have source maps to tie errors back to MDX lines.

## 2. Code Editor: CodeMirror vs Monaco vs Others

- **CodeMirror 6:** A modular, lightweight code editor for the web. It is fully open-source, tree-shakable (basic build ~50–100 KB) and used in production by Firefox DevTools, Replit, etc【21†L99-L108】【21†L116-L124】. It supports many languages via extensions, including Markdown. There are third-party packages (`@codemirror/lang-markdown`, `@codemirror/lang-javascript`) and even MDX syntax support. It has very good performance on low-end devices and strong accessibility (keyboard, theming)【21†L99-L108】【21†L116-L124】. It has a React wrapper (e.g. `@uiw/react-codemirror`) which eases integration【16†L35-L43】.  

- **Monaco (VSCode editor):** Provides full IDE features (TypeScript IntelliSense, multi-cursors, go-to-definition). However, it’s heavy (2–5 MB gzipped) and requires loading Web Workers for TS/JS language service【21†L99-L108】. Its mobile/touch support is weaker. For a note editor, Monaco’s overhead seems excessive. It would only be warranted if we needed full TS development features in-document.

- **Sandpack:** CodeSandbox’s bundle (React+CM6+embedded Node). It can run React/JS code *in the browser* (via WebContainers). Sandpack includes an editor (CodeMirror under the hood) plus a Node-like runtime sandbox【21†L105-L112】. This could allow executing code snippets without a server. However, it’s quite specialized to web scenarios and may not fit our desktop/local-first model (and has size/complexity overhead).

- **Recommendation:** **CodeMirror 6** is the pragmatic choice for editing MDX/JSX text. It’s light, extensible, and supports live syntax highlighting. We can enable Markdown mode plus JSX mode (it has TSX mode for embedded JSX) to handle MDX grammar. The blog [16] demonstrates a MDX playground using CodeMirror 6 with React and live preview. 
  - We should ensure the editor preserves the exact markdown AST (no silent reformatting). For plain text editing, CodeMirror naturally preserves all whitespace/comments, since it works on raw text.
  - For features like autocomplete or linting, we could plug in remark-lint or a simple outline plugin. But advanced IDE features (IntelliSense) are not needed initially.
  - **Pro:** Very fast startup, modular (only include Markdown, JS modes), good mobile/touch support. **Con:** No built-in VSCode-style language server.

- **Visual/WYSIWYG Editing:** After code editor, a more complex “rich text” editing layer could be considered for pure Markdown content. Options include Lexical or ProseMirror-based editors:
  - *Lexical (by Meta):* A modern headless editor; has a Markdown synchronization extension. It can sync a WYSIWYG view with Markdown text. But Lexical does not natively understand JSX/MDX. It can handle *plain MD* (through @lexical/markdown or @lexical/mdast) fairly well. It can preserve text-level edits, but embedding real React components or complex MDX would require a heavy custom extension.  
  - *ProseMirror/Tiptap:* Tiptap (ProseMirror wrapper) has an MDX bridge (tiptap-mdx) that **round-trips JSX verbatim**【19†L326-L335】【19†L338-L347】. It does this by keeping JSX “atoms” as opaque placeholders and only editing content nodes. This approach guarantees no accidental MDX corruption (JSX is preserved textually). However, Tiptap and its MDX bridge are complex and less maintained. Implementing a production-ready ProseMirror schema with all our custom components is very involved.  
  - *Round-trip concerns:* As [14] shows, many editors corrupt certain Markdown constructs on round-trip (lists, blank lines, escapes). Any visual editor must carefully preserve unedited blocks【14†L35-L44】【14†L75-L83】. We must treat unknown JSX blocks as opaque.  
  - **Recommendation:** Start without a full WYSIWYG. Focus on source-mode editing plus a "preview editing" mode limited to native elements (e.g. clicking text toggles a text edit overlay). Real HTML nodes (<h1>, <p>, etc.) can be contenteditable; React components without an editing adapter are atomic. For advanced structured editing, consider Lexical or Tiptap later. But this is a huge sub-project (essentially building a custom rich-text Markdown editor with JSX support).

## 3. Packaging and Platforms

- **Desktop Framework:**  
  - **Tauri 2:** Written in Rust, bundles a tiny (3–5 MB) app that uses the system webview (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux)【23†L75-L83】【23†L97-L104】. It has built-in security (CSP, isolated Rust backend) and low memory footprint (~50–100 MB)【23†L95-L104】【23†L108-L117】. Tauri can hot-reload with Vite and has plugins (for file-system, Git, etc.).  
  - **Electron:** Bundles Chromium (~80–150 MB) plus Node, which simplifies packaging (just web tech everywhere) but at cost of size/memory【23†L95-L104】【23†L108-L117】. For a document editor, 100+ MB is probably too heavy. Electron does offer full Node APIs in renderer (dangerous) and a mature ecosystem.  
  - **Decision:** **Tauri** is recommended for a lightweight, secure desktop build【23†L95-L104】【23†L108-L117】. The developer experience is similar (Tauri works with Vite, React, etc.) and it produces much smaller binaries. (Cordova/Capacitor could target mobile, but priority is desktop/Web first.)

- **Cross-Platform:** We target Linux, macOS, Windows initially, with plans for Web (browser PWA) and later iOS/Android. Tauri covers desktop; a PWA build (or a simpler React app deployment) could serve the web. Mobile could use a WebView-based wrapper (e.g. Capacitor) reusing the web UI, but that’s lower priority.

- **Local-First Storage:**  
  - Documents will be saved as plain files (likely `.mdx` for MDX files). This makes them accessible to other tools and to version control. Attachments (images, PDFs, data) can be stored in a folder next to the note or in a subfolder (similar to Obsidian’s attachments).  
  - We should support optional workspace metadata in a config file (e.g. `workspace.json`) if needed, but keep it minimal.  
  - **Versioning with Git:** The application should have built-in Git support. Users can enable a Git repo in their notes folder. We can use [isomorphic-git](https://isomorphic-git.org/) in the frontend (JS) for browser/desktop or **git2-rs** (Rust libgit2 bindings) in Tauri backend for performance. Either can commit snapshots, diff, revert, etc. Merging and conflict resolution can rely on Git’s model.  
  - **Sync:** We can allow pushing to GitHub (via CLI or API) or saving to Google Drive (via APIs). Initially, **GitHub sync** via private repos covers most use cases. Drive/Dropbox can be added later.  
  - **Offline-first:** All data lives locally. Sync is manual or background optional. Auto-save writes to file; Git commit is user-initiated (but we can prompt for commit messages, etc.). 

## 4. Security and Sandboxing

- **Untrusted Code:** By design, authors can write arbitrary React/JSX, which may include malicious code (e.g. infinite loops, data exfiltration). On the desktop (Tauri) and web, **the editor runs in the same origin as the user**, so JS code can do anything the user could (network, DOM, local files if permitted).  
  - **Renderer Isolation:** Tauri’s webview by default does *not* expose Node or Rust APIs to the frontend, so MDX code cannot call native file/OS APIs unless we explicitly expose an `invoke` command【23†L77-L86】【23†L108-L117】. We should keep a strict whitelist of RPC calls. We should use Tauri’s CSP (Content-Security-Policy) to restrict external scripts. 
  - **Preview Sandboxing:** If we allow “preview” mode in the same window, that content is not sandboxed (it's the app). We could embed preview in an `<iframe>` with a restricted origin, or run user JS in a Web Worker. However, React components often need the DOM (events, hooks), so full isolation is hard.  
  - **Explicit Permissions:** We should present a clear security model: by default, notes are local and no network is accessed. If the user writes `fetch('http://...')` or `<iframe src="...">` in MDX, we should warn them or disable it. We may disable network fetches in preview unless user opts-in. We must restrict component loading: either bundle trusted components or use import maps limited to known sources.  
  - **Code Execution (Python, etc.):** For code blocks that run (e.g. Python), we must sandbox. On desktop we can run code in a separate process or container. On web, we could use Pyodide or similar (with heavy limits). This is a separate sandboxing challenge.  

- **Threat Model:** The *user’s own documents* are trusted by default. The risk is code or components *downloaded from the internet* or generated by AI. We should treat third-party extensions with caution. Ideally, all components and code are local or from trusted registries. Network access should be behind explicit API calls, not automatic by default.

## 5. AI Integration

- **Programmatic Editing:** We plan to allow AI agents (locally or via API) to propose edits. Technically, we should treat AI-suggested changes the same as any user edits. That means: an AI change goes through our document model (AST), produces a diff or patch, and we apply it. Diffs should be tracked in version control.  
- **Permissions & Scope:** The AI can be given structured prompts or “commands” (like “refactor section 3 into a numbered list”). We must ensure the AI can only modify the document content, not arbitrary files or code (so no shell commands from AI).  
- **Structured API:** Internally, we should expose a document API (e.g. a tree of nodes for text, headings, components). AI tools would send patches in a high-level form (replace node X with Y, or edit text). We then serialize back to MDX source.  
- **Local vs Cloud:** Ideally, users run a local LLM or a closed API. We must handle data privacy (notes contain user’s content). We'll leave the specifics open, but design the editor so that any edit (AI or human) is tracked equally.

## 6. Rich Media and Extensibility

- **Embedding Media:** MDX can embed arbitrary components. We'll include built-in components for images (`<img>` with lightbox), PDFs (via [pdf.js](https://mozilla.github.io/pdf.js/)), audio/video (native `<video>`/`<audio>` or preview plugins), diagrams (Mermaid, [d3](https://d3js.org/), Vega, etc.), math (KaTeX/MathJax via remark plugin).  
- **Performance:** Large media should be lazy-loaded. We should use virtual scrollers if necessary for long documents. On mobile, we might hide heavy content or show placeholders.  
- **Output Cells:** For code execution output (plots, tables), we can serialize results into static media (images/JSON tables) attached to the note.

## 7. Future Grammar Extensions (Planned)

- **Custom Markdown Syntax (Later):** We will *not* hardcode a DSL like `#form()[…]` as core. Instead, we can allow user-defined syntax after the MDX engine is running. For example, a plugin could transform `#form()` text into `<Form>…</Form>` MDX before compilation. These plugins would run in a preprocessing pipeline (possibly using unified remark plugins).  
- **Versioned Grammar:** Any custom syntax should be versioned and reversible. We could follow the tiptap-mdx approach: unknown JSX is kept verbatim, container components can define how to serialize their children【19†L324-L333】【19†L345-L354】. But building a full parser extension system is complex. The key is: **defer this**, ensure first that the MDX runtime works perfectly. Then add a mapping layer: e.g. use remark plugins or a simple text preprocessor to recognize special tokens. This is explicitly out of scope for the initial MVP.

## 8. Relevant Open-Source Projects

- **Fluster (by flusterIO)**: An existing local-first MDX-based knowledge app built with Tauri. It focuses on research notes, citations, and math. (It has ~500 commits and MIT license【26†L189-L198】.) Fluster is a real-world example: its architecture uses Rust/Tauri for the core, MDX for content, and a custom UI. We should study it for lessons on packaging and React integration (though it isn’t primarily an editor UI).  
- **VSCode Markdown (builtin):** VSCode’s editor can edit MDX if a plugin is installed, but it has no interactive live preview by default.  
- **Obsidian:** Uses plain Markdown (no React) and local storage. It has a plugin model, but not code execution or JSX. We aim to go far beyond it.  
- **Notebooks (Jupyter, Visual Studio Code Notebooks):** These allow code cells and markdown, but not arbitrary React in docs. They show one model of code+doc but aren’t MDX-centric.

Each relevant project has trade-offs: most either lack live React or use a centralized service. Programmable Notes is unique in being local-first, MDX+JSX, and AI-capable. No single project fully covers our scope, so we must integrate multiple tools ourselves.

## 9. Recommended Stack & Architecture

Based on the above, a candidate stack is:

- **Frontend/UI:** React (JSX) with **CodeMirror 6** as the source editor. 
- **MDX Handling:** `@mdx-js/mdx` compiler for parsing MDX. Use **Vite** as the dev server/bundler (with `@mdx-js/rollup` plugin), or call the compiler dynamically in an isolated context for live preview.
- **Runtime:** React 18+ with either the JSX runtime. Components can be imported or in the MDX file.
- **Desktop Shell:** **Tauri 2** (Rust) for Linux/Mac/Windows. Tauri invokes our web app and provides filesystem/Git APIs via Rust. CI/CD can build auto-updates.
- **Git Integration:** Use Rust’s `git2` (libgit2) in Tauri or `isomorphic-git` in JS for version control.  
- **Sandboxing:** The editor UI runs in Tauri’s WebView with strict CSP. Component code executes in that environment; potentially isolate arbitrary JS via a `<iframe sandbox>` or Web Worker if needed.  
- **AI Platform:** Later, integrate an LLM via a plugin or API (e.g. OpenAI with user’s key, or local model) that manipulates our document AST. The core system already tracks changes via Git.

**Component Model:** Components will be plain React code. We should create a plugin API so users can add new components by dropping files into a “components” directory or via config. The MDX compiler can resolve them.

## 10. Roadmap, Milestones, and Risks

1. **Prototype “MDX+Live Preview” (Proof-of-Concept):** Build a simple React+Vite app (or Next.js) with CodeMirror editing an MDX string, using `evaluate` or `compile` from `@mdx-js/mdx` to render it. Verify that importing a React component and using hooks works. **Acceptance:** Edit MDX source → immediate React render; error in JSX shows cleanly. (This is like [16] but local-first.)  
   - *Risk:* Ensuring fast hot-reload of MDX (we can throttle/debounce as in [16]).  
2. **Basic Desktop App:** Package the prototype in Tauri. Add file open/save (read `.mdx` into editor, save on demand or autosave). Implement basic Git commands (commit, diff). **Acceptance:** The app opens a local file, edits/preview, and Git can commit changes.  
   - *Risk:* Configuring Vite with Tauri (should be straightforward with Tauri’s Vite support).  
3. **Visual Editing + Components:** Add a simple visual-edit mode (e.g. double-click text to edit) and a few built-in React components (e.g. `<button>`, `<Slider>`, maybe a simple form component). Each component can specify whether it is content-editable or atomic. **Acceptance:** Users can edit normal text in preview without breaking MDX, and components render with state.  
   - *Risk:* Designing the “editing contract” for each component. We should keep components atomic (non-editable) unless we explicitly handle their children via special syntax.  
4. **AI & Execution:** Integrate a toy LLM (or rules) that applies a change and ensure it goes through our diff+Git system. Add a safe code execution environment (e.g. a limited Python sandbox or WASM) to run code blocks, capturing output in the doc. **Acceptance:** A code cell runs and displays output; an AI suggestion can modify text/structure and be undone.  
   - *Risk:* Security issues with running code and AI-sourced changes. Keep permissions minimal.  
5. **Polish & Cross-Platform:** Test on Linux/Mac/Windows. Optimize performance (lazy load large content). Add features like multi-pane, search, plugin registry. Prepare mobile/web prototypes if needed.  
   - *Risk:* UI complexity and ensuring stable Git-based syncing without data loss.  

## 11. Conclusion

In summary, **Programmable Notes** will be built on proven tools: MDX for parsing MDX/JSX, React for rendering, CodeMirror for editing, and Tauri for distribution. Its innovation is layering interactive React on top of Markdown and offering AI-driven edits. The architecture should avoid reinventing parsers: use `@mdx-js` and unified as the core. Visual editing will handle only what we model explicitly. Security and local storage rely on Tauri’s strengths (CSP, Rust backend, Git). 

We should start by proving the MDX+React editing loop works reliably. Only after that should we consider advanced grammar extensions or a full WYSIWYG engine. By following the phased plan above and monitoring risks (especially around round-trip consistency and sandboxing), we can iteratively build a solid editor. 

**Next steps:** Set up a prototype repo with Tauri+Vite, install CodeMirror and `@mdx-js/mdx`, and write a simple MDX+React demo (e.g. live Counter component). Confirm edits propagate correctly and source is preserved. That will validate most core assumptions. 

**Sources:** Official MDX documentation【1†L84-L93】【10†L49-L58】, MDX Playground guide【16†L62-L71】, editor-comparison research【21†L99-L108】【21†L116-L124】, Tauri vs Electron analysis【23†L95-L104】【23†L108-L117】, and round-trip editing guidelines【14†L75-L83】【19†L326-L334】. These informed the above trade-offs and design.