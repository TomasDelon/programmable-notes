# Prefix-preserving multiline quoted text — 2026-11-19

A root blockquote containing exactly one literal paragraph/text leaf now supports
editing when every continuation line has an explicit marker. Logical editor text
excludes continuation prefixes; the raw source span still includes them. Changes
must retain line count. Prefix/indent/spacing bytes and every original LF/CRLF are
copied exactly. Full source revision, range/text/context and candidate reparse
checks remain required. Single-line-to-multiline, lazy, nested, formatted, escaped/
entity, blank-separated and JSX quotes remain unsupported. No preview message can
authorize editing or file operations; no native permission or grammar changed.

## Executed checks

Unit RED observed no editable range; real browser RED reached working React and
heading editing, then failed at the absent editable quote. After implementation,
25 focused mapping tests and the new real browser interaction passed. The complete
local check passed **75 unit /31 Chromium tests**, formatting, lint and strict
TypeScript. Tests include mixed endings, BOM/Unicode, exact markers, forged/stale
context, no-op/history, unsafe pending input, save/reopen and React interaction.
Fresh read-only review found no Important/Critical issue in raw-span integration.

The installed optimized app passed the complete expanded fidelity command:
actual React counter; unchanged save; Source/Split/Visual; existing single-quote
checks; multiline quote normalization-only no-op with exact disk/history checks;
real Unicode clipboard/Shift+Enter input; changed-line-count rejection with pending
text retained and Save blocked; exact prefix/mixed-ending save/Undo/Redo/mode0640;
old paragraph/list cases; dirty-close Cancel/OK; actual process restart; explicit
unsaved recovery; invalid UTF8 rejection/deletion and unchanged original. No old
gate was skipped. The actual synthetic saved file is retained as raw text.

The independent native IPC suite also passed on this exact ELF: Root positive
controls including connection reads, production private network/automationoff/
NoNewPrivs/effective limits/Stop, all privileged command/recovery-action denials
from preview, absent plugins, actual Counter2, DOM/storage and HTTP/file CSP
denial. Automated ACL probing and ordinary production namespace observations
retain separate scopes. This does not replace full malicious pressure tests.

## Failed final-close observation and driver correction

The first complete native attempt passed the new editing/history cases and
recovery observations, then failed final close enumeration with X11
`BadDrawable`, opcode14 `X_GetGeometry`. That entire command exited1; it is not a
full pass. The driver previously retried enumeration's transient BadWindow only.
It now re-queries this narrowly identified geometry/drawable race within the same
original deadline. It never treats an X error as absence or retries an acknowledged
click; other query errors remain failures.

A real GTK delayed-acceptance fixture plus an injected recorded query-error
response reproduced old-driver failure after the dialog actually accepted and
closed, with source/mode unchanged. The fixed driver passed the once-only error
case. A persistent error was still refused at the deadline (driver exit1, no false
dismissal). These are actual GTK controls with external command-response faults,
not a claim that the controlled run induced the original X-server race itself.
The full native command then passed with the fixed driver, including final close.
Raw old/new observations and exact driver/observer sources/hashes are retained.

## Exact production package

- Debian SHA256: `287692f1b214457eee73120efa0230c4d91f407f8e5da1fa83a9790fee5bca2c`.
- Installed ELF: `fd151c78178f79eef7de8cebffa5beca7f419365fab8519ad7a2c0a76781a516`.
- Size6,827,608bytes; optimized custom-protocol build, no security-test CLI.
- Fidelity observer: `a3f431cff2a82bad7aeccd83345e20cbc34781155ff9d3535095ca11706183f9`.
- Fixed dialog driver: `9fb7305b21012ebe35a5bdbecb75326dcbabddf191666c5a6d754627f14ba5ca`.
- Host/builder application source and host/guest observer parity are recorded.
- Disposable Ubuntu24.04 full-system QEMU TCG, real systemd/cgroupv2,
  WebKitGTK2.52.6, authenticated Xvfb/Openbox, supported software-rendering flags.

Native backend/policy source is unchanged; preceding Rust backend/policy tests
retain their separate executed scope. This is no new complete pressure matrix,
physical GPU/Wayland/IME validation or production security readiness. Prior
long-document renderer SIGSEGV, intermittent startup/blank and memory-before-expiry
acceptance failures remain unresolved. Hosted CI is separately blocked before
runner steps by account billing; check the exact pushed head after commit.

## Reproduce

Follow documented Linux prerequisites, install the optimized package and start
an external native driver. Use a disposable profile and fresh fixture environment:

```sh
NATIVE_DISPOSABLE_PROFILE=1 python3 scripts/native-dialog-regression.py --query-fault-once
NATIVE_DISPOSABLE_PROFILE=1 python3 scripts/native-dialog-regression.py --query-fault-persistent
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes
# Independent native IPC suite uses another fresh fixture environment:
node scripts/native-webdriver.mjs
```

The persistent-query regression expects its inner driver to fail closed; the
regression runner exits0 only after checking that refusal, real GTK acceptance and
unchanged fixture bytes/mode. Default no-fault GTK delayed-acceptance regression
remains available. None of these controls grants document code a filesystem API.
