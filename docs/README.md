# Documentation

PaperScout CV — local single-user web app that collects ~30 recent CV papers per run, scores them with a two-stage LLM pipeline, and surfaces a ranked top-10 with explanations.

## Index

| File | What it's for |
| --- | --- |
| [`PRD_v1.md`](./PRD_v1.md) | Product requirements — the *why*. Read when scoping new features or resolving requirement questions. |
| [`STATE.md`](./STATE.md) | Current implementation truth — what's built, per-phase outcomes, current task. **Start here for status.** |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Tech stack, conventions, ranking semantics, V1 acceptance. The rules of the codebase. |
| [`AGENT_GUIDE.md`](./AGENT_GUIDE.md) | Read-order, contract pointers, rules of engagement. **Start here if you're a new agent or contributor.** |
| [`data-contract.md`](./data-contract.md) | Field-by-field reference for `data/sample/{candidates,evaluations}.json` — the skill output contract. |
| [`roadmap/`](./roadmap/) | Forward-facing plans, one file per phase. Currently: Phase 5 (feedback + library filters) and Phase 6 (user workspace infrastructure). |
| [`log/`](./log/) | Append-only decision records, one file per work day (`YYYY-MM-DD.md`). |

## Quick navigation

- **"What's the status?"** → [`STATE.md`](./STATE.md)
- **"What's next?"** → [`roadmap/phase-5-feedback-library.md`](./roadmap/phase-5-feedback-library.md) or [`roadmap/phase-6-user-workspace-infra.md`](./roadmap/phase-6-user-workspace-infra.md)
- **"How is X built?"** → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **"How do I run a collection cycle?"** → [`../COLLECT.md`](../COLLECT.md)
- **"What shape does the skill output have?"** → [`data-contract.md`](./data-contract.md)
- **"Why did we decide X?"** → newest file in [`log/`](./log/)
