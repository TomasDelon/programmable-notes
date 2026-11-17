# Suggested AGENTS.md content to merge, not blindly overwrite

Codex: keep the **Programmable Notes** priority ordering correct. Authors directly write `.mdx` Markdown/JSX/React with hooks and imports; custom Markdown syntax is deferred.

Before work: read actual repository and `README.md`, current `AGENTS.md`, handoff's CURRENT_PRODUCT_SPEC, DECISIONS_AND_OPEN_QUESTIONS, SECURITY_MODEL and SPIKES_AND_ACCEPTANCE. Do not rely on outdated original overview where later user decisions disagree.

- Changes must be minimal, testable, branch/PR-friendly and reversible.
- Preserve original document source bytes unless user explicitly edits that range.
- Treat all rendered code as untrusted. Never expose Tauri IPC or filesystem privileges to preview.
- Show compilation/runtime errors honestly and distinguish source editing from component interactivity and document editing.
- Do not claim CI, browser, native, security or benchmarks passed unless you actually executed them and retained results.
- Use no secrets in source or committed fixtures.
- Explicit approval before making repositories public, purchasing services, granting broad permissions or force-pushing history.
- Document tradeoffs and unverified platform constraints in ADRs.
- Do not over-engineer custom grammar or visual editing before the core interactive React runtime passes.
