# 1. Secure MDX/React Execution  

**Threat model:** Any user- or AI-authored MDX/JSX code is *untrusted*. It may import libraries, make fetch calls, spin CPU, or attempt to access local resources. The sandbox must prevent: (a) filesystem or OS access beyond the note’s workspace; (b) unauthorized network exfiltration; (c) access to application secrets (tokens, credentials); (d) cross-site scripting into host UI or other documents; and (e) denial-of-service (infinite loops, CPU exhaustion).  

**Browser sandbox:** A standard mitigation is to run the preview in a sandboxed `<iframe>`. We should set `sandbox="allow-scripts"` but **never** `allow-same-origin`【37†L269-L274】. That gives the iframe a unique opaque origin (null) so it cannot share cookies or localStorage with the host. The iframe can run scripts but cannot access the parent DOM or `window.top`【34†L154-L160】. In practice we would use either an `srcdoc` iframe or a dedicated file/webview on a separate origin. The preview frame must have a strict Content Security Policy (CSP) that disallows all external loads (`default-src 'none'`, allow only `'self'` or none)【37†L289-L294】. In short, **isolate execution**: use sandboxed iframe (or separate Tauri webview) with no `allow-same-origin` and a forbidding CSP【37†L269-L274】【37†L289-L294】.  

**Tauri integration:** In Tauri, the main editor window runs `file://` origin with full capabilities by default. We should treat user MDX content as untrusted frontend. Possible approaches:  
- **Iframe in main webview:** Embed an `<iframe sandbox="allow-scripts">` inside the editor UI to render the MDX/React output. This isolates the code from the parent. We must ensure the iframe’s base URL is not the app origin (use `srcdoc` or a blob URL) so that `allow-same-origin` remains unset. We would give it a CSP `<meta>` or HTTP header to forbid external resources.  
- **Separate Tauri webview/window:** Use `WebviewWindow` to open a second window for preview, then use Tauri’s capability system to lock it down (e.g. do **not** grant `fs` or network permissions). We can still apply CSP via HTML or meta tags. The advantage is that the preview’s JS runs in a different OS process. We would also avoid installing Node capabilities in that window.  

Either way, **no untrusted code should run in the same origin or process as the main app UI**. Tauri’s “Isolation Pattern” itself uses a sandboxed iframe for its IPC proxy【1†L239-L247】【34†L154-L162】, demonstrating this approach. We should adopt a similar principle for MDX execution. 

**Sandbox limitations:** Note that iframe sandboxing *alone* does **not** stop network calls. A `<iframe allow-scripts>` can still fetch to arbitrary hosts. We must use CSP (`connect-src 'none'`) or disable network permissions. Also, CPU-intensive scripts (infinite loops) are not prevented by the sandbox; we may need to watchdog them (e.g. `setTimeout` trick or Web Worker for heavy tasks, though React itself is single-threaded). Importantly, disabling `allow-same-origin` blocks cookie-based leaks, but JS can still encode data in requests (e.g. image `src` queries). So we should tighten CSP (no `img-src`/`connect-src`) and treat any network attempt as suspicious.  

**Tauri IPC pitfalls:** By default, Tauri exposes APIs via `window.__TAURI__`. We should ensure user code cannot call these. Either remove those APIs in the preview (e.g. don’t inject `@tauri-apps/api`), or intercept calls. The official docs suggest using an IPC isolation pattern. For V1, the safest is: in the preview frame, **do not include any Tauri API libs** at all. That way, even if code tries `window.__TAURI__.fs.readDir`, it’s undefined. The main UI can communicate with backend Rust; preview should not. If communication is needed (e.g. for saving output), use controlled message passing.  

**Supply-chain risks:** Dynamically importing NPM packages opens Trojan risk. For V1, we should either disallow arbitrary imports or require vetting. One approach: support only a whitelist of core libraries (React, Markdown helpers) and reject untrusted imports. Alternatively, use `npm ci` to lock dependencies and forbid runtime `import()` of new packages. In any case, *do not eval code fetched from the network*.  

**Recommended security policy (V1):**  
- Preview runs with sandboxed `<iframe sandbox="allow-scripts">` (or isolated Tauri window with no node features)【37†L269-L274】.  
- The iframe’s CSP: `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'` (as an example). Only React and bundled code run.  
- Tauri capabilities: disable all `fs:`, `shell:`, `http:` permissions for the preview. Only allow reading application’s own assets.  
- No `allow-same-origin`, no `allow-top-navigation`, no `allow-popups`.  
- Test cases: attempt `fetch('http://localhost')`, `window.top`, `document.cookie`, `postMessage` to parent, and confirm failures. Also test heavy computation in code to see if UI blocks (document as risk).  

【34†L154-L160】【37†L269-L274】【37†L289-L294】 outline these decisions (double-iframe and CSP). The DeepWiki model emphasizes never combining `allow-scripts` with `allow-same-origin`, and using double-iframe if possible【34†L154-L162】【37†L289-L294】. We adopt the conservative stance: by default, treat all MDX as untrusted, and use strict sandboxing.  

# 2. Live MDX Build Pipeline  

We need a fast “MDX → React” compilation pipeline for an unsaved editor buffer. This pipeline must handle MDX (Markdown + JSX) with React hooks, local imports, and project dependencies, without requiring a full dev server. Two feasible designs:

- **(A) Bundler-in-process (Esbuild/MDX):** Use a bundler library (esbuild or Rollup) with an MDX plugin. For example, integrate [`@mdx-js/esbuild`](https://mdxjs.com/packages/esbuild) or [`@mdx-js/rollup`](https://mdxjs.com/packages/rollup) in the app. On every edit (with debounce), we pass the current MDX string to the MDX compiler to produce JS (e.g. via `@mdx-js/mdx.compileSync`), then feed that to esbuild (with a plugin) to bundle it into a runnable module. Esbuild is very fast (written in Go)【26†L129-L137】, supports JSX/TSX natively, and can embed modules. This can run entirely in the Tauri app (Rust backend calling Node code via `@tauri/cli` or in a Web Worker with WebAssembly esbuild). Since MDX is compiled in-memory, this avoids writing files. 

  *Example:* Given `input.mdx`:
  ```mdx
  import React, {useState} from 'react';
  # Hello
  <MyWidget name="world" />
  ```
  We could do (pseudo-JS):
  ```js
  const jsCode = String(await compile(mdxSource, { jsx: true }));
  const bundled = await esbuild.build({
    stdin: { contents: jsCode, resolveDir: projectDir, sourcefile: 'input.mdx' },
    bundle: true, format: 'esm', write: false,
    // include MDX plugin if needed
  });
  ```
  Then take `bundled.outputFiles[0].text`, evaluate it in the preview.  
  **Pros:** No external server needed; very fast (Go). Source maps can be inlined for error reporting. Offline-friendly.  
  **Cons:** Needs careful setup (esbuild in Tauri might require cross-compiling or WebAssembly). Dynamic imports of `node_modules` must be resolved; esbuild can bundle NPM packages but we should limit or vendor them.  

- **(B) Vite Dev Server (HMR):** Launch an embedded Vite dev server that serves the project files, and load the preview from it. In principle, Vite watches the `.mdx` file (or an in-memory virtual file) and hot-reloads on changes. In practice, our editor content may not be saved yet, so we’d need a virtual file system or rewrite the file on every keystroke (costly). We could mount the workspace folder to Vite and save the buffer to disk on each change; Vite’s HMR would push updates. This approach uses Vite’s existing MDX plugins and React refresh. 
  **Pros:** Leverages mature HMR and plugin ecosystem (`vite-plugin-mdx`, etc.)【42†L55-L63】. Handles CSS, assets, and known modules easily.  
  **Cons:** Overhead of running a dev server inside the app. Not trivial to sync unsaved buffer to it. Harder to disable unintended features. 

- **(C) WebContainer / Sandpack:** Platforms like [WebContainers](https://www.stackblitz.com/) or CodeSandbox Sandpack run a real Node environment in the browser to bundle on-the-fly. They provide APIs to mount virtual filesystems. Integrating WebContainers could allow running Vite fully in-browser. However, this adds significant complexity (embedding WebContainers in Tauri) and licensing issues. It may be out of scope for V1. 

**Pipeline comparison:** Pipeline (A) is simpler and more self-contained. Esbuild can watch file changes very quickly and produce bundles in milliseconds【26†L129-L137】. Vite offers nice dev ergonomics but expects an actual project file structure. For our use (live preview of an unsaved MDX buffer), **Esbuild with MDX** is attractive. We should prototype both to compare: 
- Test building a small MDX file with `@mdx-js/esbuild` vs a Vite + vite-plugin-mdx dev setup. 
- Measure rebuild times and memory use. 
- Test editing a heading and see if the output updates immediately. 
A critical test is error handling: introduce a JSX syntax error and see how gracefully we can report it without crashing the app. We also need source maps so errors point to MDX lines. 

**Recommended pipeline (first spike):** Use `@mdx-js/esbuild` (or Rollup). For example, use the MDX processor to compile MDX to JSX (function-body or ESM output) then feed to esbuild's `buildSync`. We can use esbuild’s `stdin: { contents, loader: 'tsx' }` trick to compile string. Accept ES6 imports (we may restrict to relative paths and allow a few node modules). This works offline and has low latency. We will implement a minimal example:  
1. **Example file:** 
   ```mdx
   import { useState } from 'react';
   # Greeting
   <button onClick={() => alert("Hi")}>Say Hi</button>
   ```  
2. **Pseudo-code:** 
   ```js
   const { compile } = require('@mdx-js/mdx');
   const esbuild = require('esbuild');
   const jsxCode = String(await compile(mdxSource, { outputFormat: 'function-body' }));
   const result = await esbuild.build({
     entryPoints: ['-'],
     stdin: { contents: jsxCode, resolveDir: '/project', sourcefile: 'doc.mdx', loader: 'tsx' },
     bundle: true, format: 'esm', write: false,
   });
   const jsBundle = result.outputFiles[0].text;
   ```  
3. **Acceptance tests:** 
   - Changes to plain text (Markdown) update the React component with new HTML. 
   - Changes to JSX (e.g. add a `<Counter>` component from a local file) import correctly. 
   - Errors (unmatched braces) produce console messages with correct MDX line numbers.  
   
【42†L55-L63】【18†L399-L407】 support using MDX with modern bundlers. We note that MDX’s `evaluate` function uses `eval` directly (unsafe)【18†L399-L407】, so we avoid it; instead we compile and bundle. Also, *esbuild is written in Go*【26†L129-L137】 (contrary to an earlier assumption of Rust). Esbuild’s speed and TypeScript support make it ideal for this.  

Finally, after bundling we will load the resulting JS into the sandboxed preview (e.g. via a blob or `<script>` injection). We must clear the previous module state to rerender (e.g. use React’s hot-reload or unmount/remount mechanism).  

# 3. Lossless Source ↔ Visual Editing  

**Challenge:** Arbitrary MDX (Markdown plus JSX) is notoriously hard to edit visually without corrupting source. Most rich-text editors (ProseMirror/tiptap, Lexical, etc.) assume HTML-like structures and cannot round-trip raw MDX. In fact, current tools *do not* preserve MDX identity: Lexical MDXEditor will normalize formatting, and `tiptap-markdown` escapes JSX components【46†L268-L277】. The `tiptap-mdx` project exists precisely to address this: it guarantees *byte-for-byte identical round-trips* between MDX source and the internal doc model【46†L275-L282】. 

**V1 constraints:** We should **limit visual editing to what we can guarantee**. Explicitly:  
- **Editable zones:** Only plain Markdown content (paragraphs, headings, lists, block quotes, code blocks) should be editable by standard text operations in the preview. In those zones, adding/deleting text or changing formatting maps cleanly to Markdown AST edits. For example, editing a list item in-place or splitting a paragraph with Enter should work as usual.  
- **Atomic components:** Any `<Component />` or JSX tag that isn’t known to the editor should be treated as an atomic, opaque node. Users cannot edit its contents (since source code might break); they can only select or delete the entire node. Optionally, we can provide a custom UI for editing that component’s props (an “editing contract”), but by default, it remains non-editable.  
- **Input controls:** For built-in form inputs (e.g. `[Your name|]`), the rendered input is interactive, but its *value* must not rewrite the MDX. The source placeholder `[Your name|]` remains unchanged. (User input is stored separately as form state.) We treat these as controlled components, not source editors.  
- **Selection and deletion:** If the user places the cursor next to an atomic node and presses Delete/Backspace, we should delete the entire node in source (if the intent was to remove it). This must be tested: e.g. if the text cursor is immediately after a `#widget(...)`, hitting Backspace should remove the whole syntax or do nothing, not half-delete it.  
- **Cursor movement:** Navigating through text should skip over atomic nodes. For example, in rendered HTML, `<Component/>` might render as a `<div>` – when focused or traversed, the editor should jump from text before it to text after it, possibly selecting the node as a block.  
- **Undo/redo:** Any visual edit should map to a precise text diff on the MDX. We should record source changes (not raw HTML diff) so undo/redo is unambiguous.  

**Approaches:** Two broad models exist:  
- **AST-preserving editor (ProseMirror/Tiptap):** Use a editor like tiptap-mdx that actually parses MDX into a doc and ensures round-trip identity【46†L275-L282】. This is ideal because it understands JSX at syntax level. However, it’s experimental and implementing it is a major project.  
- **Overlay editor (Lexical/Slate):** Use a more generic rich-text editor with an MDX-aware plugin. These typically convert MDX to HTML-like nodes and back, often losing details (attribute order, whitespace, comments). Without serious effort, they corrupt MDX.  

Given that no stable solution exists, for **V1 we should defer full visual editing** of complex MDX. Instead:  
- Provide a robust Markdown+JSX *source editor* (CodeMirror 6) alongside the live preview. Users can always edit raw MDX.  
- Allow very basic visual edits in rendered Markdown: text entry, deletes in paragraphs.  
- Keep JSX components visually read-only (or with minimal “edit props” dialogs).  

This means the editing “contract” is strict: any change in preview must round-trip to MDX. We would implement “surgical edits” only where unambiguous. For example, converting a typed character in a paragraph to an insertion in the source MDX (as plain text) is safe. But trying to *modify* the HTML of a `<Component>` is not allowed.  

We will define and test this boundary with golden fixtures. For instance, given source  
```mdx
Hello, <NameInput />!  
```
If the user changes “Hello” to “Hi” in the preview, MDX becomes `Hi, <NameInput />!`. If they delete the `<NameInput/>` element in the preview, the MDX node is removed entirely. If they try to edit inside `<NameInput>`, nothing happens.  

We should build a small editor prototype: perhaps using CodeMirror with an overlay and custom decorations for components. Or use an off-the-shelf tool like tiptap-mdx as inspiration: in fact, tiptap-mdx’s invariant is exactly that **round-trip must be identity**【46†L275-L282】. For V1, we can mimic a minimal subset of that: e.g. use remark/rehype to parse MDX into nodes, manipulate text in text nodes only, and serialize back. 

**Acceptance tests:** We will create MDX samples that include all elements (text, lists, JSX tags, Markdown syntax). For each, simulate an edit in preview and verify the source text changes correctly (byte-for-byte where possible). Test cases include: Backspace at edges of components, splitting paragraphs, editing list items, inserting headings, etc. Cases that cannot be safely done (like editing JSX props visually) should be disabled or handled by a special editor widget.  

**Recommendation:** Focus on a highly reliable textual editing experience first. Provide a live preview for feedback, but postpone a full WYSIWYG editor until the core pipeline is rock-solid. When ready, consider using or integrating with tiptap-mdx【46†L275-L282】 or developing a custom AST-based editor.  

# 4. Spikes and Engineering Plan  

We now have the key unknowns identified. The next step is to prototype the hardest parts before full development. **Proposed spikes (1–2 weeks each):**

- **Spike 1: Sandbox POC**. Implement a minimal Tauri app (or plain HTML) that loads an `<iframe sandbox="allow-scripts">` and injects a simple React component. Verify isolation: the iframe can run `alert()`, but cannot access `window.top`, cannot read cookies, and cannot use any `@tauri` APIs. Test injection attacks: e.g. attempt `fetch("/etc/passwd")` or `window.__TAURI__.fs.readDir('/')` and confirm they fail or are blocked【37†L249-L257】【37†L289-L294】. If feasible, test a nested iframe pattern: the editor creates an outer sandbox and an inner React app iframe (double-iframe)【34†L154-L162】, further locking down. Document “good” and “bad” outcomes.  

- **Spike 2: Bundler POC**. Write a Node (or esbuild-wasm) script that compiles an MDX string with `@mdx-js/esbuild` (or `@mdx-js/rollup`) and loads it in a browser. For example, use `npx @mdx-js/esbuild` on an `.mdx` file, or write code with `esbuild.buildSync`. Measure build time on small MDX and larger MDX (~100 lines). Ensure TypeScript/JSX, CSS imports (if any), images (if needed) are handled. Check error reporting. Compare this to using `vite-plugin-mdx` in a local Vite project (time to reflect changes). Decide which is more reliable. For dynamic imports: confirm if we can do `import './module.js'` in the MDX (using esbuild’s `resolveDir`). Keep it simple for V1: allow only relative or known modules.  

- **Spike 3: Editing POC**. Using tiptap-mdx or a simpler approach, attempt a round-trip on an MDX doc. For instance, feed MDX into `tiptap-mdx`’s pipeline to get a ProseMirror document, then modify a text node, and serialize back. Verify identity aside from the edited text. Also try lexing MDX into an AST (with remark-mdx) and do a manual text-replace operation to simulate simple edits. The goal is to identify the minimal kernel: e.g. “we can safely insert text within text nodes” vs “we must keep JSX nodes atomic”. This clarifies what *editing operations* we support.  

After these spikes, we will finalize the architecture. We expect the core of V1 to take about **4–6 weeks total**: 
- 2–3 weeks for the MDX compilation/render prototype (spike 2 + integration into Tauri), 
- 1–2 weeks for sandbox integration and security hardening (spike 1 + testing), 
- 1–2 weeks for Editor integration (source editor UI + limited preview editing, spike 3).

**1–2 Week Handoff Plan:** Once spikes validate the approach, break the implementation into tasks:  
1. Set up Tauri app with React+Vite (or Wails/Webview) skeleton. (2 days)  
2. Integrate CodeMirror 6 as the MDX source editor, with on-change hook. (1 week)  
3. Implement MDX → JS compilation using esbuild (or Rollup) in the Tauri backend or a Web Worker. Wire it to the editor buffer. (2 weeks)  
4. Render the output in a sandboxed iframe within the app. Enable Hot-Reload: when compilation finishes, update the iframe content. (1 week)  
5. Add Git/GitHub integration and local file saving. (1 week)  
6. (Optional) Basic UI for component props editing (for built-in components).  
Each subtask will have unit/integration tests. We will automate the **acceptance tests** from the spikes: e.g., “editing this source yields this output”.

Throughout, we will track blockers: the main risks are performance of dynamic bundling and unforeseen sandbox escapes. We will address them immediately in spike tests.  

**Summary:** We will start by building a minimal MDX editor with live preview, securing it by sandboxing, then gradually add functionality. All technical decisions (iframe or separate webview, esbuild or dev-server, etc.) will be validated by these prototypes.  

**References:** We rely on MDX docs and bundler references【42†L55-L63】【26†L129-L137】【18†L399-L407】 for the compilation approach, and web security guides【34†L154-L160】【37†L269-L274】 for sandbox design. The tiptap-mdx project provides proof that lossless MDX editing is possible【46†L268-L277】, guiding our editing strategy. All final implementation will be tested against these documented best-practices.