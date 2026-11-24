# Cloudflare Pages preparation — 24 November 2026

Scope: repository preparation for the existing browser editor, separate from
recovery PR #6 and validation PR #7. No Cloudflare project, account authorization,
DNS, certificate, deployment, merge, release or readiness change was performed.
The permanent origin and project name in the owner guide remain proposals.

## Changes and review

- Optional Pages build produces deterministic transport/cache policy with no new
  dependencies. Default/native build does not emit Pages configuration.
- Offline ASSETS excludes the two consumed root control files, but their bytes
  remain in the release digest, including header-only changes.
- Production-header acceptance covers actual MDX React interaction and enforced
  sandbox refusal, source/rendered edits, exact BOM/CRLF exports, undo/redo,
  browser persistence/reopening and offline reopening.
- The existing CI workflow can validate a later explicit HTTPS deployment in
  fresh browser profiles; ordinary browser/native jobs stay mandatory for PRs.
  npm11.9.0 is pinned explicitly rather than assuming Node's bundled npm version.
- A read-only independent whole-branch review found one Important issue and no
  Critical or other actionable findings: Pages' canonical `/index.html` redirect
  made cached HTML responses unsuitable for service-worker navigations.

## Reproductions and evidence

1. Tooling RED: the original offline generator included `_headers` and
   `_redirects` in fetches. Both generated-build regression tests passed after
   excluding these files while retaining their versioning effect.
2. Transport RED: ordinary Vite preview lacked the required `nosniff` header.
   The Pages-compatible preview applies the exact generated policy; all three
   Chromium acceptance cases passed before adding canonical redirect emulation.
3. Independent reviewer reproduced redirected cached HTML refusal in a fresh
   Chromium profile. Adding Pages' canonical redirect to local acceptance then
   reproduced `page.reload: net::ERR_FAILED` in the real persistence/offline case
   (two other cases passed). This was not an infrastructure failure.
4. Normalize only redirected navigation responses, preserving body/status and
   every header. The same three acceptance cases then passed, including both
   controlled online and offline reopening. No CSP or sandbox restriction was
   removed. Header metadata remains excluded from offline requests.

The complete check before the redirect correction passed 287 unit and 87
Chromium cases; tooling reported 12 passes and two scanner prerequisites skipped.
An earlier invocation omitted the cloud's system Chromium override and could not
launch the matching browser; it is not counted as a successful browser run.
Final verification uses the documented system Chromium and explicitly supplies
the pinned scanner so its negative Git/archive fixtures execute too.

Local acceptance is not evidence of actual Cloudflare edge routing, headers,
build quotas, domain ownership, DNS/TLS or account permissions. These remain
pending owner connection and the documented deployed-site workflow. Native
resource/startup gates and native redistribution restrictions are unchanged.
Raw logs, traces and account-sensitive cache files remain ignored. The owner
procedure and reproducible commands are in [the setup guide](../CLOUDFLARE_PAGES.md).

## Final local verification

- `npm run check` with system Chromium, two workers and explicit
  `PN_GITLEAKS_BIN`: EXIT0; formatting, lint, strict TypeScript, **287 unit**,
  **14 tooling (zero skipped)**, **87 production Chromium** and **3 hosting
  Chromium** tests passed.
- From a separate clean staged-source snapshot without generated runtime, dist
  or node_modules: exact Pages commands `npx --yes npm@11.9.0 ci` then
  `npx --yes npm@11.9.0 run build:cloudflare` both EXIT0. No new dependencies.
- Independent reviewer rechecked the redirected response fix and resolved the
  Important finding; all response policy headers are preserved.
- New-policy Firefox/WebKit and actual deployed-site acceptance have not run
  locally. The opt-in deployment workflow provides their reproducible procedure.
  Existing prior hosted browser/native results do not certify this new host.

GitHub checks for this new commit and any deployment branch promotion must be
verified separately before owner setup. Complete-history/archive secret scan
passed before commit and is required again before pushing the new history.

## First real deployment observation

The owner deployed commit `73b3b6e` and supplied
`https://programmable-notes.pages.dev/`. Live three-browser dispatch
[45442020674](https://github.com/TomasDelon/programmable-notes/actions/runs/45442020674)
failed; its artifact was retained, but both normal and escalated downloads of
GitHub logs/artifacts return proxy Forbidden in this cloud environment. Direct
site HTTP also returns proxy CONNECT403; Playwright's direct lookup reports
EAI_AGAIN, including outside the local sandbox. Those infrastructure failures
are not evidence of the site's actual behavior.

Enable Playwright's standard GitHub reporter alongside list/HTML so actual
failure details are available as check annotations through the accessible API.
A local failing network probe verified the annotation includes the failing test,
line and actual error. Keep deployed-check concurrency separate from baseline
build checks so diagnosing an existing deployment cannot cancel its candidate's
native/browser gates. No assertion or sandbox policy is changed. Full local
check passed again (287 unit, 14 tooling, 87 baseline + 3 hosting Chromium cases).
The deployed failure's cause is still undiagnosed at this checkpoint.
