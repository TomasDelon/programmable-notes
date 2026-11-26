# Engineering feedback protocols

These development protocols implement the owner's request for faster, evidence-based autonomous work. They add no application features, permissions, community plugin support or paid service. Existing security, privacy and repository checks remain authoritative.

The repository skills are [close-feedback-loop](../.agents/skills/close-feedback-loop/SKILL.md) and [check-delivery-evidence](../.agents/skills/check-delivery-evidence/SKILL.md). They use the standard `SKILL.md` structure and are explicitly routed from AGENTS.md. A compatible Codex client can discover repository `.agents/skills`; this does not claim that an already-running cloud skill catalog refreshes automatically. Existing debugging and verification skills remain useful when relevant; do not load every methodology for every task.

## 1. Task and feedback contract

Start a meaningful change with four short lines:

- **Outcome:** the observable user result, including the intended interaction.
- **Invariants:** source fidelity, revision checks, recovery, isolation and scope restrictions that must survive.
- **Witness:** the smallest real action and observation that distinguish success from failure.
- **Done:** the required gates and deliverable, excluding unrelated optional work.

For example: typing an unmatched dollar remains ordinary document text; the witness is real caret typing and unchanged focus geometry in the affected browser, not an input component or a successful compile. Preserve existing MDX fixtures byte-for-byte outside the authorized patch.

Use one hypothesis → one discriminating probe → one minimal correction → the same probe. If the hypothesis fails, revise it before stacking more changes. Keep routine decisions autonomous. Escalate genuine security problems or consequential unresolved product choices under the existing authorization rules.

## 2. Validation and execution ownership

During development, run the smallest affected unit/browser case. Use the pinned browser and the actual affected engine early. Capture native selection/input order when that is the failure; use rendered DOM, interaction and screenshot evidence for UX claims. Wait for observable application state rather than a fixed delay or universal network-idle rule.

After relevant inputs stabilize, run the repository's required final checks, including `npm run check` before committing. Tests and security configuration are relevant inputs, not just application source. Preserve trustworthy evidence for identical inputs; rerun affected gates after a change, failure or new concern. Define repeat counts for actual races and do not accept a passing retry as a clean result.

One owner controls each writable file set, browser server/port and status watcher. Delegate independent research, implementation, tests or review only when the harness/user permits it and coordination is worthwhile. A worker brief contains scope, exclusive files, required output/evidence and stop condition. Restart completed workers with the harness's follow-up operation. Inspect the diff and results before integration.

Use one completion watcher per job and consume its final conclusion/artifacts. Record the process/run ID, input identity, last verified outcome and next action in the ignored task log. Keep user updates concise and compatible with the harness's communication requirements. Persist a short durable handoff at a milestone, not a full transcript.

Independent CI gates may overlap only when their concurrency groups and resource ownership permit it. The stabilization workflow separates same-ref editing, deployment, browser-QA and ordinary-build groups, with editing taking precedence for mixed requests. Run titles expose the actual event/ref/group. Automatic PR refs may already differ from dispatch refs; source inspection alone does not establish historical cancellation or measured savings. Hosted overlap/supersession evidence is required before calling this operationally verified. Shared build reuse and cache optimization remain separate pending work.

## 3. Evidence record

For milestones with several gates, the optional consistency checker consumes this shape:

```json
{
  "version": 1,
  "subject": "identity-of-relevant-source-tests-config-and-environment",
  "required": [
    { "gate": "webkit-caret", "kind": "browser", "allowedSkips": 0 }
  ],
  "evidence": [
    {
      "gate": "webkit-caret",
      "kind": "browser",
      "subject": "identity-of-relevant-source-tests-config-and-environment",
      "command": "the actual executed test command",
      "log": "the retained evidence reference",
      "status": "passed",
      "exitCode": 0,
      "failed": 0,
      "flaky": 0,
      "skipped": 0
    }
  ]
}
```

This is a schema example, not a claim that the example test was executed. Put actual records in `.cache/`, then run:

```sh
node scripts/check-agent-evidence.mjs .cache/agent-evidence.json
```

Supported kinds: `unit`, `browser`, `tooling`, `native-compile`, `native-runtime`, `security-runtime`. Gates must be unique, complete and exact-kind matches. Outcomes must pass with zero exit/failure/flaky counts; only predeclared skips are allowed. A blocked or unexecuted required gate prevents an all-passed record. Report its infrastructure blocker separately; never disable isolation or increase skips to obtain green results.

**Trust limit:** this validates supplied-record consistency only. It neither executes commands nor reads logs, computes identities, assesses test adequacy, proves security or authorizes deployment. Fabricated inputs can pass. Derive the identity from the relevant source, tests, configuration and environment, and inspect real tool results. Native compilation never substitutes for native runtime evidence. No sensitive values belong in records; diagnostics do not echo their contents.

## Feedback on these protocols

The [research and evaluation record](research/2026-11-25-agent-feedback.md) states what was verified and what was not. Improve the protocols from concrete failures and representative evaluations; remove instructions that add no value. Measure time to first reproducer, failed correction cycles, duplicate builds/polls, end-to-end elapsed time and escaped regressions over future milestones. Do not claim a speedup or error elimination from a small reasoning exercise.
