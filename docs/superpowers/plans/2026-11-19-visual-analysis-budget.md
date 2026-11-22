# Conservative visual-analysis fallback for dense Markdown

Base144da10. Isolated Node probes timed out after3s on quote/bracket-heavy inputs
within500KB. Actual Chromium100001-byte bracket input selected the intended file,
then Visual transition took5073.5ms with2943.8ms heartbeat gap. First probe used a
virtualized CodeMirror text-content readiness check and failed before transition;
keep that failure separate. These are input/rendering costs, not native crash or
capability-escape evidence.

Smallest safe correction: fail closed for synchronous visual mapping above a
conservative structural-marker budget. Count square brackets and greater-than
characters in a linear scan that exits after4096; retain existing500000UTF16 size
bound. Above either bound, no editable ranges or candidate patches, and display
one escaped read-only original-source block plus explicit Source fallback. No
source truncation/normalization, runtime compiler/parser replacement or privilege
change. This addresses measured classes; it is not a formal universal wall-clock
bound. A dedicated cancellable visual-analysis worker remains the stronger future
option if other expensive classes appear. Do not claim all parserDoS solved.

TDD: exact-bound accepted literal source, over-bound read-only whole-source span,
no unsafe patch, originalBOM/CRLF/source bytes unchanged. Actual browser dense input
must remain read-only, allow trusted exact Source navigation and exact export,
correct/reopen ordinary source, React still isolated. Preserve source size limits
and all previous fidelity/history tests. Fullcheck, fresh read-only review and
actual optimized installed native fallback/fidelity/recovery/IPC where feasible.
Keep earlier SIGSEGV/memory/startup failures and precise package scopes.
