# Bound browser file reads before loading a selection

Current browser Open checks each file's500KB limit, but only checks aggregate
32file/8MiB workspace limits after reading and decoding every selected file.
A large explicit selection can consume unbounded transient memory before its
inevitable rejection. Native permission/IO behavior is outside this milestone.

1. Add failing hook tests using real File metadata and observed arrayBuffer calls:
   over-count, aggregate-byte and later-oversized files must reject before reading
   any file and preserve current source/selection/history; cancelled input is inert.
2. Preflight selection metadata plus current workspace count/UTF8 byte budget,
   reusing existing shared constants. Keep strict UTF8/BOM decode and final
   addDocuments validation against latest workspace after asynchronous reads.
   No new source-size allowance or silent partial import.
3. Test accepted exact bytes and async source growth refusal, actual browser
   oversized/count import, error recovery and subsequent valid import. Full checks,
   read-only review, precise browser-only scope; docs/evidence/commit/push/draftPR.
