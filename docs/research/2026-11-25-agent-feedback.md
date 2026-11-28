# Public-source agent engineering research and evaluation

Retrieved 2026-11-25. Scope: development feedback, skill design and evidence handling for Programmable Notes. This is an original local synthesis, not a lab-endorsed method or an objective ranking of the “best” researchers. The evidence is public material in OpenAI's and Anthropic's organization repositories; individual staff authorship and private internal adoption were not established.

## Verified primary sources

Pinned HTTP-200 source bytes were compared with the versions actually read; all four matched. The snapshots remain in the ignored research cache, not bundled into application code or imported as executable plugins.

| Source                                                                                                                                                                                 | Supported method                                                                                                                                                                                                                                    | Evidence limits                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenAI frontend-testing-debugging](https://github.com/openai/plugins/blob/981b02c0c44058b595f3b4180002c3ae3c806d40/plugins/build-web-apps/skills/frontend-testing-debugging/SKILL.md) | Define one target interaction, make the smallest useful edit, inspect rendered state, and collect the cheapest proof after each UI action. Its wording is “collect the cheapest proof that the next state is correct.”                              | Published in OpenAI's curated plugin repository; this does not establish individual authorship or measured speedups. Plugin-specific browser routing is not this environment's tool policy.              |
| [Anthropic skill-creator](https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/skill-creator/SKILL.md)                                            | Compare with-skill and baseline runs, use objectively verifiable assertions and scripts, inspect non-discriminating assertions and variance, iterate from feedback. It says “Keep the prompt lean. Remove things that aren’t pulling their weight.” | A documented evaluation recipe, not a controlled study proving this project's protocols improve productivity. Human feedback and quantitative checks serve different purposes.                           |
| [Anthropic webapp-testing](https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/webapp-testing/SKILL.md)                                          | Reconnaissance → inspect rendered DOM/screenshot → act → observe. Reuse lifecycle helpers and inspect their interface before loading large implementations into context.                                                                            | Its generic Chromium/network-idle/fixed-wait advice is not suitable as a universal rule for our multi-engine editor. We retain state-based readiness, pinned engines and existing test/server ownership. |
| [OpenAI plugin-creator](https://github.com/openai/plugins/blob/981b02c0c44058b595f3b4180002c3ae3c806d40/.agents/skills/plugin-creator/SKILL.md)                                        | Package narrow capabilities with explicit structure and optional scripts/resources; distinguish local/shared installation. The repository itself uses `.agents/skills`.                                                                             | Packaging evidence, not performance evidence. Its global/personal marketplace actions are not needed or authorized by reading it. We create only repository-local skill files.                           |

The [older OpenAI skills catalog](https://github.com/openai/skills) explicitly reports deprecation and points to `openai/plugins`. We did not install a stale catalog or load a complete third-party framework.

### Access limitations

Direct requests for OpenAI's harness-engineering/eval-skills/skills web pages and Anthropic's engineering articles were blocked by the environment proxy with HTTP 403. Escalated requests remained pending and were abandoned when the accessible official repository sources sufficed. Their content, bylines and claims are not cited as verified. No downloaded script was executed, global skills modified, marketplace installed or paid API invoked.

## Local adaptation

Two narrowly triggered skills implement a short outcome/invariants/witness/done contract and milestone evidence review. Three operating protocols cover targeted-to-final feedback, worker/watch ownership and consistent evidence records. AGENTS.md routes to them without loading all references on every task. Existing source fidelity, revision authorization, recovery, native permissions and sandbox gates remain unchanged.

The new `scripts/check-agent-evidence.mjs` validates declared requirements and supplied results. It rejects stale subjects, compilation/runtime kind substitutions, duplicates/missing gates, failed/blocked/unexecuted/flaky outcomes and undeclared skips. It neither executes commands nor opens logs. This is a consistency aid: fabricated records can pass; it cannot prove execution, adequate coverage, correct UX or security. Actual tool observations remain required.

## Evaluation performed

Before writing the feedback skill, five independent fresh-context control agents received the same synthetic WebKit-failure scenario. Five fresh-context agents then received that scenario plus the finished skill. Every response was read manually. These are reasoning exercises, not actual browser work or a statistically powered performance benchmark.

| Observation                                                                          | No new skill | With feedback skill |
| ------------------------------------------------------------------------------------ | ------------ | ------------------- |
| Reject another duplicate full check/manual status polls                              | 5/5          | 5/5                 |
| Test the actual affected WebKit behavior on new build B                              | 5/5          | 5/5                 |
| Keep build-A evidence distinct from build-B evidence                                 | 5/5          | 5/5                 |
| Refuse native runtime safety claims from compilation alone                           | 5/5          | 5/5                 |
| Native GUI entry in proposed test list explicitly conditional on task/native changes | 0/5          | 5/5                 |

The first four criteria already passed without the new skill; they do not demonstrate an incremental safety benefit. The final row measures output scope/wording, not observed elapsed time or fewer executed tests. The scenario's native scope is limited, so that result is exploratory, not proof of a general improvement. No token counts, speedup factor or zero-error guarantee is claimed. See the retained [scenario and criteria](../../.agents/skills/close-feedback-loop/evals/scenarios.json) to repeat and expand the exercise.

The mechanical checker was tested first: **30 cases failed before implementation** against an unimplemented fallback. After implementation, **30/30 Node tests passed**, zero failures/skips; targeted ESLint/Prettier passed. Cases include stale identity, compile/runtime mismatch, failure/flakiness/blocked status, duplicate or absent evidence, skip limits, malformed input and CLI non-disclosure of sentinel values. Full repository validation is recorded in the draft PR after execution, not inferred from these focused results.

Two additional held-out exercises checked shared-file ownership/completed-worker restart and actual use of the evidence CLI. The worker chose exclusive file ownership, the harness follow-up operation and unchanged isolation. The synthetic browser record returned exit 0; a compilation/runtime mismatch returned exit 1 with `KIND_MISMATCH`. The worker correctly reported consistency only, executed no recorded sentinel command and read no fictional log. These are limited protocol/reference checks, not real application or deployment validation. Individual reasoning responses were not archived for independent rescoring; retain that limitation when interpreting the small qualitative comparison.

## Next measurement

On future real milestones, record time to first reproducer, failed correction cycles, duplicate builds/polls, end-to-end duration and escaped regressions. Compare similarly scoped work and distinguish model/environment changes from protocol effects. Keep only instructions that improve results. CI concurrency separation, immutable build reuse and cache improvements remain separate engineering changes; this work does not claim to implement them.
