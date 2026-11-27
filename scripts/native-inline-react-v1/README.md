# Experimental inline React guarded v2

This historical source directory and the fixed binary/guest paths retain their
v1 names. The current compiler, host and closed driver/session/observer validators
accept only **`inline-react-guarded-v2`**, with a new embedded build frame and
source hashes for the canonical browser guards and native one-shot admission.
JSON structural `version: 1` fields retain their existing format meanings; the
exact profile identifies this changed execution contract. Earlier v1 artifacts,
receipts and runtime observations are not v2 evidence. Historical sources remain
available at their recorded commits.

V2 builds Wry with neither HTML nor URL. The host then installs the same per-view
GTK chooser/permission/dialog/print/fullscreen guards used by the Tauri child,
adds immediate download cancellation on its own incognito context, and attaches
failure/termination observation before native-owned one-shot `load_html`. Guard
or publication failure consumes admission and exits; no authored receipt can
publish HTML. Explicit native popup denial is installed by the builder. No Wry
fork change, new document IPC or general React activation is involved.

This is a foundation, not native security acceptance. The retained navigation
allowlist accepts exact `about:blank`, including authored same-URL navigation.
Its initial `load_html` policy-event sequence must be observed before tightening
admission; no full navigation-denial claim is made. Native handler denial and
dialog-continuation witnesses require a separate sealed Debian runtime phase:
real chooser, browser permissions, alert/confirm/prompt, print/fullscreen,
downloads, popups/navigation, genuine repeated React input, Stop and expiry.
The existing native snapshot observes construction/load/failure state; it does
not witness these authority handlers firing. Authored titles prove neither native
guard installation nor resource containment.

Preserve the unchanged Supervisor, fixed limits, GtkSocket/Plug embedding, normal
input, deadlines and share-free authenticated fixture boundary. General native
React remains disabled. Full application IPC, lifecycle/geometry, hostile CPU and
both memory workloads, recovery and packaged-product gates remain unresolved.
