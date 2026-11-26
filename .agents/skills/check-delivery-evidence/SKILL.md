---
name: check-delivery-evidence
description: Use when aggregating test results for a milestone, reviewing completion claims, reusing earlier validation, or distinguishing compilation success from actual browser or native runtime verification.
---

# Check delivery evidence

Tie each claim to an executed observation of the relevant inputs. Define required gates and permitted skips before running them.

For a product delivery, derive those gates from `docs/PRODUCT_CONTRACT.md` and
`docs/PRODUCT_ACCEPTANCE.md`, not only from tests selected by the implementer.
Do not omit a blocked requirement to make the consistency checker pass. A setup
or internal engineering milestone can complete without completing the application;
label that scope explicitly and keep product acceptance pending. Agent ADRs and
green builds do not establish owner acceptance.

For a milestone, create an ignored JSON evidence record using the [schema and example](../../../docs/AGENT_WORKFLOW.md#evidence-record). From the repository root run:

```sh
node scripts/check-agent-evidence.mjs .cache/agent-evidence.json
```

The dependency-free checker rejects missing or duplicate gates, mismatched subjects or verification kinds, blocked/failed/flaky outcomes, nonzero failures, and unapproved skips. It emits generic diagnostic codes without echoing record values. It never executes recorded commands or opens recorded logs.

A subject identifies relevant source, tests, build settings, security configuration and environment. A branch name, stale cache or matching application bundle alone is insufficient. Preserve evidence for identical relevant inputs; invalidate affected gates when inputs change.

Inspect actual command results and referenced evidence before reporting completion. This checker validates supplied-record consistency; fabricated records can pass. It does not attest execution, calculate identities, establish test adequacy, prove security, or authorize deployment. Native compilation cannot satisfy a native-runtime gate.

Keep one watcher for each running job. Read its final outcome, inspect failures and artifacts once, and distinguish passed, failed, blocked and unexecuted work in the handoff. Apply the repository's mandatory checks; this skill does not replace them.
