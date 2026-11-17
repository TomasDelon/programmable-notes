# Programmable Notes | Engineering Handoff

**Prepared:** 2026-11-17  
**Target repository:** `TomasDelon/programmable-notes` (private, `main`)  
**Purpose:** Transfer product decisions, prior research, technical uncertainties, executable acceptance criteria, and the next task to Codex Cloud.

## Where to start

1. Read [`CODEX_START_HERE.md`](CODEX_START_HERE.md) and [`product/CURRENT_PRODUCT_SPEC.md`](product/CURRENT_PRODUCT_SPEC.md).
2. Read [`architecture/DECISIONS_AND_OPEN_QUESTIONS.md`](architecture/DECISIONS_AND_OPEN_QUESTIONS.md), [`architecture/MDX_BUILD_PIPELINE.md`](architecture/MDX_BUILD_PIPELINE.md), and [`architecture/SECURITY_MODEL.md`](architecture/SECURITY_MODEL.md).
3. Run the experiments in [`implementation/SPIKES_AND_ACCEPTANCE.md`](implementation/SPIKES_AND_ACCEPTANCE.md).
4. Treat `research/reports/*ORIGINAL.md` and `research/original/*ORIGINAL.md` as historical **source documents**, not newer requirements. Several earlier recommendations have been superseded.
5. Use [`research/SOURCE_INDEX.md`](research/SOURCE_INDEX.md) and [`research/FACT_CHECKS.md`](research/FACT_CHECKS.md) to inspect the referenced projects and official docs.

## Non-negotiable product priority

**Write real MDX/JSX/React directly in `.mdx` files**: real React state, hooks, events, ESM imports/exports and compositional components. A custom `#form()[...]` syntax is *not* foundational, is optional, and must not derail the early compiler/runtime/editor. Source editing must remain reliable even before visual editing exists.

## Delivery scope

This is a **handoff bundle**, not working application source code. The included MDX samples are fixtures, not an implemented system. No compilation, sandbox proof, performance benchmark, browser acceptance, or local desktop test is claimed.

## Research provenance and caveats

- Two recovered Deep Research reports are included with their text preserved verbatim. Inline numbered citations are those of the original reports.
- The original product overview was recovered from the earlier conversation file. Its contents are preserved for provenance, but **it predates critical priority corrections**.
- Citation URL metadata was recovered and converted into an index. The original research artifacts did not contain an export of individual search queries (`source_searches` was empty); do not claim an exhaustive historical search log.
- Some original reports contain oversimplifications and untested claims. See `research/FACT_CHECKS.md` before implementing them.
- Check the live repository before editing. The repository may have changed since this bundle was assembled.
