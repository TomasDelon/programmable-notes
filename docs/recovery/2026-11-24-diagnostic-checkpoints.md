# Native diagnostic interruption correction

The six-case TCG run reached five passing cases and closed the final preview
before expiry, but its outer 660s controller ended during the final recovery.
The command did not pass. The finally-only writer left no structured JSON for
completed cases; logs remained available. Controller exit status was unavailable
after cloud reattachment and is not reported as zero or an observed124.

The external observer now checkpoints after each completed case using exclusive
same-directory temporary files and rename, preserving complete previous/new JSON
across process interruption. It attempts native cleanup even if report writing
fails. This is diagnostic-artifact protection, not a durable document store or a
claim of machine power-loss safety. A partial report never implies full success.

A real Linux integration races 1 MiB replacement writes and reads, requires multiple
observed generations, SIGKILLs its owned Node writer and validates the remaining
JSON. A naive truncate/write implementation failed with partial JSON; atomic
replacement passed. Read-only review found no blocker; generation coverage was
strengthened following feedback. The test does not deterministically target every
write boundary.

The fresh full run retained a failed CPU-case checkpoint while later cases ran,
and finally wrote all six outcomes with recorded controller exit1. The unchanged
Stop/expiry/OOM assertions remained strict. See
[installed candidate, outcomes and hashes](../security-evidence/2026-11-24-current-package/README.md).

The heap availability observer also misclassified a missing OCR dependency as a
55s marker timeout. The CLI now checks Tesseract and English data before native
launch for `--pressure`; a missing-tool control exits 2/NOT RUN. The original
failure and painted marker screenshot remain retained. Installing a documented
VM prerequisite does not substitute for an actual OCR/heap/disk acceptance pass.
