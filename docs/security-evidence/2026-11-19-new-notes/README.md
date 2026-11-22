# Creating notes without replacing existing documents

New note creates a uniquely named empty MDX buffer, reveals Source mode and places
the caret there. It is unsaved and has no native grant or saved-baseline entry.
Existing buffers, saved revisions, grants and histories remain intact. A functional
workspace update preserves source input queued in the same event batch. Empty
creation adds no source bytes; the existing 32-document bound is retained. At the
limit the action is disabled rather than replacing another source. Original-source
saving, Save As and private recovery keep their existing authorization paths.

## Executed checks

Red tests demonstrated the missing workspace action and hook operation. Final
formatting, ESLint, TypeScript, **45 unit and 23 Chromium tests passed**. The first
format check failed on the newly added browser test; formatting was corrected
before the successful complete run. Unit tests cover queued edits, independent
blank buffers, unchanged prior bytes/grants, no filesystem call and the file cap.
Actual Chromium checks creation/focus, sibling switching, exact CRLF preservation,
independent undo/redo, saving both notes and reopening downloaded bytes in another
page without discarding the first page's documents.

The optimized production package was installed in the disposable Ubuntu/WebKitGTK
VM with no test feature or policy relaxation:

- deb SHA-256: `8d2d4f416aa39720dd6cd2ae742d6ae4aeb950c0c54a0e9b97b021898c5ef655`
- ELF SHA-256: `4ee8319b15479778aec60bef1f3d003b4f0c3c1bcf9644f04f677bda1a51283a`

Real native acceptance first repeated compiler navigation, exact disk save/mode
0640 and undo. It then created a new note, verified no native binding, cancelled
Save As, typed through real X keyboard events, selected a fresh path in the native
picker, checked exact disk bytes and reopened it. The original BOM/CRLF/emoji file
was unchanged. The process closed cleanly. Automatic recovery was paused during
this focused persistence test; a new-note-specific automatic restart run is not
claimed. Earlier recovery and resource tests retain their exact binary scope.

Reproduce with the documented installed-app fixture environment and disposable
profile:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-diagnostics.mjs --new-note
```

New notes have their own explicit import group. Previously opened unrelated
modules are not implicitly granted to them; save/open an explicit note/module
selection when needed. Native startup reliability, hardware compatibility and
hosted-CI billing limitations remain as recorded in IMPLEMENTATION_STATUS.md.
