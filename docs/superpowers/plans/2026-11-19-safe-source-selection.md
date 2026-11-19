# Safe source selection and repeated filenames

Basebc9a21d; existing checkout. Preserve provisional design, native grants, source
keys/bytes, compiler grouping, history and all sandbox restrictions.

Current select accepts unknown keys, including a closed source from a delayed
callback and inherited names such as toString. This violates selected/entry file
membership. Source options also strip group prefixes, so separately opened files
with the same name have identical labels.

1. Reproduce stale/unknown/prototype selection with hook tests and repeated-name
   ambiguity with a real browser opening separate synthetic MDX documents.
2. Check Object.hasOwn against the latest workspace inside the functional updater;
   ignore invalid values without changing state. Add presentation-only option
   ordinals so every source remains distinguishable; values/IDs stay unchanged.
   Ordinals describe current list positions, not persistent file identities.
3. Browser test choose each same-named source by visible label, edit one, verify
   separate exact exports and independent undo/redo/reopen. Pending inline guards
   and forged preview-message denial remain. Full checks and read-only review.
4. Build/install optimized Linux artifact; use synthetic same-name files in separate
   directories, real chooser/keyboard/save and independent exact disk comparisons.
   Preserve modes and grants; repeat core native fidelity/IPC when appropriate.
5. Document actual results/limitations, coherent commit/push/update draftPR. No
   aesthetic redesign, filesystem API expansion, merge or release.
