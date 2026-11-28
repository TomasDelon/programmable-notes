# Agent work: product discipline and specification maintenance

Retrieved/reviewed: 26 November 2026. Scope: operating rules, not application
implementation. These are project adaptations of public guidance, not a laboratory
endorsement, a ranking of researchers, or evidence of measured token savings.

## Verified primary material

The following official repository documents returned HTTP 200 and were actually
read. Source snapshots remain in the ignored research cache; nothing was installed
or executed from them. Main-branch URLs can change; the recorded content hashes
identify the consulted versions.

| Source                                                                                                                                             | Specific support                                                                                                                                                                         | SHA-256 of fetched bytes                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [OpenAI Cookbook: Using PLANS.md for multi-hour problem solving](https://github.com/openai/openai-cookbook/blob/main/articles/codex_exec_plans.md) | Plans are living, self-contained documents. Keep decisions/progress current; explain user purpose first; acceptance must describe observable behavior beyond compilation.                | `a8f7bac9c378e853e09268518a2b4e59b8113c9f95cd53cb4144ca0d9534dc52` |
| [OpenAI AGENTS.md repository](https://github.com/openai/agents.md/blob/main/README.md)                                                             | A predictable repository entry point supplies agent context and instructions. It is a format, not an enforcement mechanism or a replacement for the product specification.               | `60ec51c226560aaf2c49a0b8a2452c8cf24459c37a816764979dc917076c7afb` |
| [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)                                            | Compare outcomes against a baseline, inspect non-discriminating assertions, combine qualitative feedback with objective checks, explain why and remove unproductive prompt instructions. | `dcd4803e61e913e6fc27294184cd3a71f09f5e924ff20c8a9a20173e7b3c2bcf` |

Short supporting excerpts:

- OpenAI: “ExecPlans are living documents, and it should always be possible to
  restart from _only_ the ExecPlan and no other work.”
- OpenAI: “Acceptance should be phrased as behavior a human can verify”.
- Anthropic: “Keep the prompt lean. Remove things that aren't pulling their weight.”
- Anthropic explicitly discusses assertions that always pass regardless of the
  skill as “non-discriminating”, and says advanced blind comparison is optional.

The OpenAI recipe allows temporary parallel implementations during a controlled
migration. That does not authorize a different product or override the owner's
rejection of a separate native interface. Its historical model recommendation
and multi-hour anecdote are not used as performance evidence here.

Direct access to the OpenAI developer AGENTS guide and Claude Code best-practices
page returned proxy HTTP 403. They were not read and are not cited as evidence.
Accessible independent official publications were sufficient; no fetch proxy,
external script, paid API, marketplace or global skill installation was used.
One supplementary researcher could not retrieve Anthropic's engineering article
on effective agents (HTTP 403; its escalated retry was aborted). That article is
also excluded from consulted evidence. Normal agent token usage still applies;
no cost or savings figure is inferred from these attempts.

## What failed locally

The prior [feedback protocols](../AGENT_WORKFLOW.md) already required an observable
outcome, targeted reproduction and honest evidence. Their existence did not stop
the wrong native interface from being delivered. This is an execution and
acceptance failure as well as a specification-maintenance gap. Another larger
skill catalog would not establish that the problem is fixed.

The preserved handoff intentionally records its original date. The mistake is
not preserving that archive: it is failing to maintain a clearly authoritative
current contract for later owner corrections. Agent-authored ADRs described what
was implemented and were treated too much like product approval.

The implementer and workers checked the new native shell against its own design.
The baseline product had different behavior. Passing tests therefore established
internal consistency without establishing the requested product parity. The
owner's rejection remains valid regardless of the number of passing tests.

## Applied project rules

The current [product contract](../PRODUCT_CONTRACT.md) now records active owner
requirements, reasons, provenance and unresolved/deferred status. It is an initial
ledger, not a claim of complete historical reconciliation. AGENTS.md points to it
before implementation plans. ADR024 is explicitly marked as a rejected approach;
its historical body remains preserved.

[AGENT_WORKFLOW](../AGENT_WORKFLOW.md) adds product gates to the existing feedback
loop: requirements before implementation, baseline interaction before a port,
independent review against owner intent, and actual-entry/artifact acceptance.
Workers receive bounded requirements and file ownership; no fixed agent count or
automatic full-history duplication is prescribed. Unchanged-input evidence is
retained without weakening mandatory tests or security requirements.

## Counterexamples the rules must reject

| Candidate                                                          | Why it fails before delivery                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Old technical native interface that compiles and saves files       | PRODUCT-01 requires the existing product, not merely a functioning native backend.                    |
| New shell with matching colors but extra Split/X and missing hover | UX-01 and baseline interaction inventory reject the changed behavior. CSS similarity is insufficient. |
| An ADR marked implemented used to justify a rejected interface     | Requirement authority is separate from implementation history. Owner rejection wins.                  |
| Browser IPC mocks used to claim installed Linux runtime validation | The observation does not establish the target platform behavior. Report the missing gate.             |
| A remembered bug immediately implemented despite “later”           | The contract records deferred work; remembering is not execution authorization.                       |

These are manual consistency checks against observed failures, not controlled
agent trials or proof of future compliance. No speedup, token reduction or
zero-error claim is made. Evaluate the rules on subsequent real work using escaped
requirement failures, rework and duplicate operations, with actual cost/time data
only when available. Remove rules that add effort without helping.

Only documentation/instructions are changed in this review. The application,
hover, mode selector, storage, security policy and workflows remain untouched.
