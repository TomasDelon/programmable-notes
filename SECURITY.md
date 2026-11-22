# Reporting security concerns

Programmable Notes is an experimental editor. It executes user-authored React in
an isolated preview, but does not claim production security readiness. Read
[the native security contract](docs/NATIVE_SECURITY.md) and
[current limitations](docs/IMPLEMENTATION_STATUS.md) before testing documents.

Do not post credentials, personal documents, private paths, exploit payloads or
unredacted diagnostic archives in public issues. If GitHub shows **Report a
vulnerability** under this repository's Security tab, use that private channel.
Private vulnerability reporting is not assumed to be enabled. Otherwise contact
the maintainer through a privately available channel to arrange secure delivery;
public issues may request a contact method without disclosing the vulnerability.
No dedicated private reporting endpoint or response-time guarantee is offered.

Future contributors should run `bash scripts/scan-secrets.sh` before pushing.
The pinned scanner checks reachable Git history and historical ZIP members. Its
reports stay in ignored `.cache/` and must not be uploaded. The synthetic-key
regression verifies refusal without printing key material. This check supplements
manual privacy/media review; it cannot certify that arbitrary files are safe.

Do not disable sandboxing, IPC authorization, resource limits, or revision checks
to work around a bug. Preserve failed evidence and reproduce in disposable test
environments. See [public remediation](docs/PUBLIC_READINESS.md) for historical
exposure and owner-controlled decisions.
