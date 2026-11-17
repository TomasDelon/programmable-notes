# Research Provenance

## Recovered historical reports (2026-11-17)

1. **Broad Deep Research:** `reports/01_Architectures_for_Programmable_Notes_ORIGINAL.md`. Topics: MDX compilation, editors, native packaging, sandboxing, AI editing, media, open-source projects, architecture and roadmap.
2. **Targeted Deep Research:** `reports/02_Targeted_React_Execution_ORIGINAL.md`. Topics: malicious MDX/React isolation, unsaved-buffer compilation/imports, source-preserving visual edits, engineering spikes.
3. **Original product overview:** `original/programmable_notes_overview_ORIGINAL.md` and corresponding Drive source [overview.md](https://drive.google.com/file/d/1LOQ_M7qCemVvzawMbaIJdLas05l-zL-d/view). This predates the later decision to prioritize direct MDX authoring.

The two Deep Research report bodies were copied **verbatim**, including their numbered citations, from recovered report documents. Their citation metadata is reproduced in `SOURCE_INDEX.md` and `citation_sources.json` (only public-source reference fields).

## Research prompts: thematic record, not raw search log

- Broad study: select MDX/React compiler/runtime, CodeMirror/Monaco and WYSIWYG options, Tauri/Electron/PWA packaging, Git local-first storage, malicious-code sandboxing, AI edit interfaces, media extensions, other open-source projects, implementation milestones and tests.
- Targeted study: three specific blockers: (1) security for untrusted MDX/JSX and imports, especially Tauri IPC/iframe/CSP; (2) live compilation of unsaved `.mdx` source with actual ESM imports and offline dependencies; (3) lossless/surgical source-to-rendered editing contracts and their tests.

**Limitation:** The recovered original report artifacts contain `source_searches: []`, not raw search request histories. Therefore this ZIP contains all recovered reports and citation/source links, **not an exhaustive query-by-query browser log**. The thematic briefs above are a faithful summary, not claimed verbatim research prompts.

## Source reliability

- Historical reports are research outputs, not verified implementation results.
- Source links include official documentation, open-source repositories, blogs and secondary comparison sites. Their quality differs; priority should be official docs + source code + actual tests.
- The newer `research/FACT_CHECKS.md` corrects known errors and includes official references independently checked for the handoff.
