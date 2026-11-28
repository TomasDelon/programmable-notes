# Shared document navigation leaf

Outcome: PRODUCT-01/UX-01/DATA-01 gain a shared presentation row consumed by the
existing web app and the controlled NativeWorkspace/DocumentSurface host. This
is a step toward one product root, not a new native shell or product activation.

Invariants: preserve existing rendered row DOM, classes, icon, accessibility,
indentation, selection, drag/drop callbacks and draft-leave admission. No new
source/history owner, browser persistence fallback, native invoke, file mutation,
full-text search or fake Recent state. Native inventory paths and opaque loaded
session IDs remain distinct.

Witness: the web app immediately consumes the extracted leaf with unchanged
handlers; a controlled native host uses that same leaf and DocumentSurface for
asynchronous inventory selection. Delayed opens leave the old source selected,
loaded selection does not acquire a second grant, histories survive switching,
and late writes update only their originating session. Existing real browser
navigation/drag/draft tests remain required. Injected-port UI tests are not
installed filesystem evidence.

Done: focused meaningful tests, independent contract/source review, frozen-source
full checks, scans, coherent commit/push and updated status. No native bootstrap,
installer promotion or security-readiness claim.

## Small interface

Extract only the existing ordinary document row into
`src/workspace/DocumentNavigationRow.tsx`; defer folder/search/Recent composition.
Pass title, selected flag, depth, icon, extra drag class, onOpen and optional
explicit drag button handlers. Return the existing button and children directly,
without a wrapper or data model. The component owns no key/path/session, source,
selection, command, permissions, async operation or persistence.

`WebApp.navDocument` keeps its existing document lookup and JSX icon selection,
then supplies the existing callbacks and styles through that leaf. Leave
`openDocument`, `canLeaveDraft`, tree ordering/drop admission, Recent actions,
search, menus and settings in the existing host. Do not pass NativeWorkspace
through a browser-state-shaped shim.

The controlled native host derives navigation rows from validated inventory;
clicks call its existing asynchronous open use case and project its structural
subscription. It passes the selected opaque session to the existing
useDocumentSession/DocumentSurface/SourceEditor composition. Test-only host code
is not a newly shipped native interface.

## Sequence and ownership

- [x] Implementer first writes meaningful row tests, sees RED, extracts the
      presentation and immediately replaces the existing web row. Preserve focus,
      keyboard activation, selection and trusted drag event forwarding.
- [x] Separate test author extends controlled native surface tests for real
      controller async opening, reuse, history and late saves. No component stubs or
      mocked source ownership; injected OS ports remain explicitly identified.
- [ ] Independent review compares current web DOM/handlers and owner contract;
      root runs final checks after both packets freeze, then scans/commits/pushes.

The successful fixed Debian diagnostic remains distinct from shared-product
integration, full native security/geometry and installed vault acceptance.

Focused evidence: three behavioral row controls and ten controlled surface cases
passed independently. The integration author encountered the row already landed,
so no initial missing-module RED is claimed; omitting it from the controlled host
made exactly the three new cases fail while the original seven passed. Ten real
Chromium navigation/tree-drag cases passed against a fresh production build.
The combined frozen-source full gate then passed814 unit,133 tooling/zero
skips,153 Chromium,9 Pages and4 local cloud cases. The first attempt stopped
at the new workflow-step oracle gap; its stricter correction and complete
rerun are recorded in the implementation status. No installed native UI
acceptance is inferred.
