# Literal mathematics during authoring

User requirement: unmatched `$` / `$$` is ordinary editable literal text, without
red feedback, notifications or a document lock. A completed delimiter pair enables
mathematics; invalid closed TeX stays raw/red. This supersedes the earlier delimiter-
refusal UX. Keep stale revisions, ambiguous source maps, JSX opacity and all sandbox
controls enforced.

- Share paired-only block parsing and literal draft tokens between the core math
  compiler and source analysis. Use the existing Markdown/MDX tokenizer context so
  imports, JSX attributes and code fences are not reparsed as mathematical text.
- Render literal draft spans as unframed editable source with normal feedback;
  complete pairs retain existing KaTeX validation and caret behavior.
- Replace only an exact validated old span when delimiters are added/removed.
  Preserve physical breaks and every byte outside the span. Dollar typing in
  mapped ordinary text can explicitly create a supported math span.
- Add parser, source-patch, editor integration and real-browser regression cases
  for the supplied differentiable-function example, inline text, incomplete/opening
  and closing markers, correction, continued editing, saving/reopening and history.
- Update superseded tests/documentation, run complete local and hosted browser
  checks, retain real evidence, and update the existing draft PR. Do not promote
  a candidate with failing browser acceptance or weaken permissions.

The earlier composition-history correction is committed separately. Its hosted
verification may finish while this authoring follow-up is implemented.
