# ADR-002: Layered browser preview boundary

Status: prototype, not approved for arbitrary hostile documents or native distribution.

All document code and import-time side effects execute in an iframe with exactly `sandbox="allow-scripts"`. The frame has an opaque origin, no same-origin capability, popup/top-navigation/download permissions, native bridge, or parent operations API. The iframe's CSP defaults every resource type to none; connect, image, media, font, worker, child frame, object, base and form destinations are denied. Only a SHA-256-authorized inline bundle can execute. Inline styles are allowed inside the isolated frame. There is no unsafe-eval or blob script permission in the preview.

The parent additionally declares `frame-src 'none'`. Chromium permits the srcdoc preview but blocks its own URL navigation. This parent policy matters: an initial negative probe proved that the child CSP alone did NOT block iframe self-navigation. The layered policy fixed that observed failure, and the retained security-gate probe verifies it. Never remove this parent restriction because the child has a sandbox.

Messages from previews are untrusted. The sole accepted message is a bounded diagnostic object from the current frame window with origin `null`, exactly two keys, and a string of at most 2000 characters. It can set displayed error text only. It cannot mark a build successful, save files, install packages, or call privileged functionality. Sender-origin checking alone is insufficient because opaque origins share the string `null`.

The compiler worker parses but does not evaluate user modules. Its resolver has no filesystem, host package-loading, or network-fetch fallback. The privileged shell never evals, imports, or renders the generated document module. Runtime scripts are hash-authorized only in the preview. HTML script end tags are escaped before hashing/embedding.

Observed Chromium tests deny parent DOM/storage, opaque-origin storage, external/loopback fetch, external scripts/images, popup, top navigation, forged privileged messages, and iframe self-navigation. Playwright emits request events even for CSP-blocked resources; tests assert their CSP failure, not merely an absent successful response. No Tauri runtime exists here: absence of native globals in a browser is NOT a Tauri capability test.

A disposable-process infinite-loop probe found the parent UI responsive in this Chromium build. This does not establish hard memory/CPU quotas, loop termination, portability across browser process models, or WebKitGTK behavior. Stop cancels scheduled compilation and removes an existing frame when the host can respond; it is not an OS process kill guarantee. High-memory pressure remains unrun. Browser vulnerabilities and side channels remain out of scope for this prototype's assurance.

Security go/no-go: desktop/hostile-code readiness is BLOCKED on a real unprivileged Tauri webview with enforced capabilities, actual WebKitGTK tests, CPU/memory budgets and reliable termination. Spike C is deferred because the complete Spike B matrix has not passed. The UI explicitly labels the prototype experimental; do not use it to open hostile notes as a shipping security boundary.
