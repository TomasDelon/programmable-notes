# Fixed MDX/React fixture: compiler and browser control

27 November 2026. Preparation for
[inline-react-v1](../../plans/native-inline-react-v1.md), REACT-01 / SECURITY-01.
This packet contains a fixed compiler fixture and browser control, not a native
host, guest run, containment result or production application acceptance.

## Inputs and artifact identity

The versioned [document.mdx](../../../scripts/native-inline-react-v1/document.mdx)
uses actual React `useState`/`useEffect` for a counter and controlled input. The
[compiler](../../../scripts/native-inline-react-v1/compile.mjs) exports only
`compileFixture()`, accepting no payload or path arguments and returning HTML and
manifest bytes. There is no CLI, output-file API or privileged runtime interface.
Compilation/bundling does not evaluate generated code in the Node host.

Installed dependency versions must match the repository lock and direct pins:
`@mdx-js/mdx` 3.1.1, esbuild 0.28.2, React/ReactDOM 19.3.1 and the locked scheduler
0.28.0. The manifest records installed package-metadata hashes, Node version,
source/compiler/package/lock SHA-256 hashes, compiled-MDX/JavaScript/HTML hashes
and byte sizes. Repeated compilation under identical inputs produces identical
bytes. Esbuild retains inline legal comments; the existing
[third-party notices](../../demo/THIRD_PARTY_NOTICES.txt) preserve the applicable
React, ReactDOM and scheduler license texts.

The HTML bundles its dependencies and carries a restrictive CSP. Browser control
uses an iframe with `sandbox="allow-scripts"` and no referrer. These restrictions
are not proof of native process, namespace, filesystem or aggregate resource
containment.

## Observed browser behavior

The root task's corrected matching-browser run passed one test in 2.9 seconds:
two real button clicks produced React Count 0→Count 2; a real field click produced
the explicit focus receipt; only then did `page.keyboard.type('hello')` send one
typing sequence. Both the actual input value and bounded title receipt confirmed
`hello`, with Count 2 retained and an empty error code. No DOM focus/click or
JavaScript value injection was used to establish input behavior.

The first launch attempt omitted the matching browser-cache environment and did
not launch a browser. It was an infrastructure/setup failure, not a failed
product interaction test. The corrected run is the browser observation above.
This packet makes no claim that the concurrently running full check completed.

Title receipts contain fixed profile/readiness/count/focus fields, at most 16
UTF-16 input units and a sticky fixed error code, with a 256-byte UTF-8 ceiling.
They are spoofable document-controlled diagnostics. They convey no source/file
authority and never authorize host actions. Manifest and browser receipts keep
`nativeTested: false`.

## Reproduction and report attachments

From the repository root, using the pinned Node/npm versions and installed locked
dependencies, run the focused compile controls:

```sh
node --test tests/tooling/native-inline-react-fixture.test.mjs
```

Those controls check reproducible hashes and package identities, HTML parsing
with script execution disabled, generated-script syntax through `node --check`,
preserved policy/legal comments, rejected compiler arguments and absence of
generated bootstrap evaluation in the host. They do not execute React input.

Build the standard browser test server inputs, then run the actual browser spec
with Playwright's matching installed Chromium:

```sh
npm run build
env -u PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright test tests/e2e/native-inline-react-fixture.spec.mjs --project=chromium
```

The cache path above is this cloud workspace's location; a standard runner uses
its matching Playwright installation. The spec attaches `fixed-fixture-manifest`
and `browser-fixture-receipt` JSON to Playwright reports. Where CI retains those
reports, inspect these attachments for the exact artifact and observed state;
attachment generation does not itself establish an uploaded or passing CI run.
Their scope is `fixed-fixture-build-only` / `browser-fixture-control-only`.

No native host/driver, SSH transfer, VM, namespace admission, Stop/expiry observer,
hostile CPU/memory test or production permission check was implemented or run by
this packet. Native payload execution still depends on successful reviewed stock
OS admission and the remaining fixed-profile plan gates. The earlier deviating
native result remains unchanged.

## Native host source preparation

The isolated `host/` crate embeds only these fixed compiler artifacts through its
trusted build script. It reuses the reviewed GtkSocket/Plug and Supervisor path;
stdin remains blocked until actual resource/namespace checks pass, before WebKit
starts. Own-Plug native sentinel/title metadata is bounded to256 UTF-8 bytes and
never dispatches actions. Runtime UID1001 and exact arguments are required.
Navigation/download/devtools restrictions, clipping and trusted native Stop remain.

All235 registry lock records match the application lock. The actual Rust build
script compiled and generated fixed public artifacts; Node-specific preload
options are removed while registry/proxy/CA settings remain. This is not general
build-environment sanitization or host evaluation of the generated document.

Three host tooling groups passed. The complete local regression packet passed
**793 unit, 119 tooling / zero skips, 153 Chromium, 9 Pages and 4 inactive-cloud
cases**, plus formatting/lint/types/build. GTK host compilation is not a local pass:
GLib development metadata is missing. A locked release build was added to the
existing native CI job, reusing its target/cache without another job or installer.
No native host execution, driver, containment or product acceptance is implied.
