# Public repository remediation

Status: **in progress; no public-remediation sign-off**. The owner intentionally
made this repository public. Visibility will not be reversed or treated as a
pending approval. Shared history, important evidence and draft PR1 are preserved.

## Confirmed exposure and immediate mitigation

- **Historical contact metadata:** one non-noreply personal-provider address
  occurs in86 reachable commits at baselineb8402d1. Its value is withheld here.
  The local configuration now uses the owner's verified GitHub noreply identity
  for future commits. Existing Git objects remain accessible. A mailmap or new
  commit would not erase that exposure. Owner authorization is required before
  any shared-history rewrite; accepting historical exposure is also an owner
  decision. No rewrite has been performed.
- **Private original-source pointer:** the current research-provenance document
  now withholds its private document reference. Research bodies and public
  citations remain intact. Historical versions remain accessible; removing the
  current pointer does not revoke access or remove historical copies. Review the
  source document's sharing permissions separately. No private value is included
  in this report.
- **Future accidental disclosure:** ignore rules now cover common local signing
  material, provider configuration, audit reports and unbundled release output.
  These rules cannot remove already tracked or historical data.

## Audit completed so far

The recovered audit enumerated88 reachable commits including both remote heads
and PR1 head/merge refs,1,812 local Git blobs (92,086,844 bytes),10 historical ZIP
blobs and288 logical archive members (115 distinct members). Bounded extraction
reported no encrypted/oversized/uninspected archive member. No archive contents
were executed.

Official Gitleaks8.30.1 was verified against its release checksum. History and
all exported blobs, including supported archive traversal, each produced four
matches. All four were independently identified as public X.509 kernel-module
signing certificate fingerprints in disposable Linux journals, not private keys
or API credentials. No live credential has been confirmed. This is not a claim
that automated scanning can prove the absence of all sensitive data. Raw audit
reports and private originals remain ignored outside tracked evidence.

Remaining audit work includes visual/media review, redistribution notices,
workflow hardening, clean-clone verification and final documented test results.
The earlier media inventory contains eight distinct recordings; no complete
media-review claim is made yet.

## Licensing and redistribution work still required

No project open-source license has been selected. Public visibility alone does
not grant a general reuse license; none will be invented or assigned here.
The owner must decide the licensing position and confirm publication rights for
supplied research/design materials. Third-party licenses remain independent.

The existing browser review archive needs complete dependency redistribution
notices. The preserved design reference includes a font notice pointing to OFL
but lacks the full corresponding license text. Additive notices and corrected
future packaging are being prepared without deleting or silently rewriting
historical evidence. Wry's license texts and fork attribution are retained.

## Actions and billing

A fresh rerun of44610581513 on public baselineb8402d1 has started executing steps
in both standardubuntu-24.04 jobs. Thus the former pre-run billing refusal is not
blocking this attempt. No successful hosted completion is claimed yet. No paid
runner, service, subscription or spending commitment is authorized or introduced.

## Owner-controlled actions

History rewriting, source-document sharing changes, licensing decisions and
publication-rights approval remain outside automatic remediation. Do not merge,
rewrite history, publish a release or promote PR1 from draft automatically.
A final remediation recommendation and precise outstanding actions will replace
this interim status after the remaining audit and verification.
