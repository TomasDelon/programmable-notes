# Source-extension case consistency

Base40e253c. Reproduce uppercase MDX preview selection before changing code.
Current case-sensitive checks span workspace entry, visual/draft eligibility,
compiler MDX/TSX loading, native grants and snapshot names. Browser chooser accepts
extension case variants; showing another note's preview is unsafe UX.

Support ASCII case variants of the existing six source formats, preserving every
original path/name byte and case-sensitive virtual/file identity. Normalize only
extension classification, never entire paths, package names or import lookup.
Keep exact imports case-sensitive and reject unsupported formats before browser
reads. Share frontend classifiers and native format whitelist; native picker
filters should include all ASCII case spellings, not arbitrary file types.

TDD: workspace uppercase-entry/case-distinct keys, actual browser MDX+TSX imports,
case-mismatched import denial, exact visual/export/draft behavior. Native store and
snapshot round trips preserve mixed-case names/content while EXE remains rejected.
Run all Rust/browser checks, build optimized package, real picker/runtime/save/
reopen/recovery and IPC acceptance. No new native capability or path-taking IPC.
Review specifically for accidental path folding/format widening. Document results,
limits/old-reader behavior, commit/push/draftPR, continue independently.
