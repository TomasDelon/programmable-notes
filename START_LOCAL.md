# Start here: continue development on Linux

28 November 2026. Development is moving from Codex Cloud to the owner's Linux
computer. This handoff prepares that transfer; it does **not** certify the app as
finished or production secure. No further cloud VM cycle is needed to begin.

- Repository: https://github.com/TomasDelon/programmable-notes
- Branch: `fix/preview-markdown-input`
- Open draft: [PR #9](https://github.com/TomasDelon/programmable-notes/pull/9)
- Last application-code checkpoint: `f02db0d8b1662b225c0ecc7805f977230e7fc0ab`

All current source, original technical handoff, research, design ZIP, architecture
and retained evidence are tracked in Git. Clone the branch with its history;
there is no need to publish the cloud environment or copy its cache.

```sh
git clone --branch fix/preview-markdown-input https://github.com/TomasDelon/programmable-notes.git
cd programmable-notes
```

If a checkout already exists, preserve its edits and inspect it before switching
or pulling. Never reset it to make these instructions easier.

Read [the local development handoff](docs/LOCAL_DEVELOPMENT_HANDOFF.md), then give
Codex running **on your Linux computer** this prompt:

> Continue TomasDelon/programmable-notes locally on fix/preview-markdown-input.
> Read AGENTS.md, START_LOCAL.md and docs/LOCAL_DEVELOPMENT_HANDOFF.md first.
> Preserve existing local edits, personal notes and recovery data. Set up the
> pinned Node/npm/Rust versions and this machine's native dependencies. Use this
> computer for edits, builds, tests and GUI feedback; do not start more cloud VM
> debugging cycles. Reuse compatible code and the shared ProductRoot; do not build
> another application or clone Obsidian. First reproduce the current packaged
> vault-picker flow and verify the trusted Home initialization, then actual
> source/preview editing, automatic disk writes, undo/redo, close/reopen and
> explicit recovery. Use disposable data; destructive native probes need a
> disposable account/VM, not my normal desktop session. Preserve source fidelity
> and isolation, and keep general native React disabled until its documented
> security/integration gates pass. Work in small verified commits, keep the draft
> PR updated, and ask only for genuine access, security or product decisions.
> Do not merge, publish a release, change visibility, overwrite my data or weaken
> sandboxing. Start with a short machine/checkpoint inspection, then run the app.
