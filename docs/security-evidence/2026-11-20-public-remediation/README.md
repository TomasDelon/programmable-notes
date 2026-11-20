# Public remediation evidence — 2026-11-20

The repository is intentionally public. No history rewrite, visibility change,
release or PR promotion was performed. See [PUBLIC_READINESS](../../PUBLIC_READINESS.md).

- `baseline-hosted-jobs.json`: actual standard Ubuntu hosted run 44694104501,
  head 8a8e44c, both jobs passed. It predates the revised credential guard workflow.
- `archive-alias-red.log`: synthetic unused private key existed only inside a ZIP
  also committed as a non-ZIP alias. The original path-based exporter returned
  false success; the refusal test failed (exit1). No fixture key data is logged.
- `archive-alias-green.log`: content-based discovery refuses both plain Git and
  aliased ZIP keys, without printing their values. Two tests passed.
- `secret-scan-summary.log`: full current reachable history and archive scans
  returned zero findings after exactly four independently verified historical
  public-certificate exceptions. Raw reports stay private/ignored.
- `demo-verification.log`: fresh notice-bearing browser demo passed real extracted
  Chromium interactions plus manifest/CRC and ten malformed-artifact refusal cases.
  This is not native GUI validation or a license grant for the project.

Media audit decoded all 2,096 frames of eight videos, OCRed 2,095 distinct image
contents and checked image metadata. No configured candidate class matched.
59 original distinct images were viewed on contact sheets. This is a limited
automated/thumbnail review, not proof of absence or human review of every frame.
Private audit originals/reports and OCR are deliberately not attached.
