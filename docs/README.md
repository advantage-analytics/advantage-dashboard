# docs/

| File | What it is | Read it when |
|---|---|---|
| [`r2-and-webhook-overview.md`](r2-and-webhook-overview.md) | **Current state** of the video pipeline: R2, the Cloudflare Worker, the results webhook, quota, deletion, and what a UI redesign can safely touch | You are working on anything SplitStep-related. Start here |
| [`splitstep-integration-spec.md`](splitstep-integration-spec.md) | The original design spec. Kept for the reasoning; several sections are deliberately superseded and marked as such at the top | You want to know *why* something was built this way |
| [`llm-setup.md`](llm-setup.md) | Configuring the `/api/chat` provider (Anthropic or OpenAI), keys, mock mode, rough costs | Setting up LLM features locally |

Also relevant, on the **`splitstep-derivation`** branch:

| File | What it is |
|---|---|
| `docs/splitstep-vendor-questions.md` | The thirteen open vendor questions, each backed by measurements from two real committed payloads. Supersedes §5 of the spec, with question numbers preserved so `TODO(splitstep-qN)` markers stay valid |

## Conventions

- The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep`
  is internal naming only, and nothing customer-facing attributes anything to SplitStep.
- A doc that describes current state says so and is kept current. A doc that captures a
  point-in-time decision says that too, and is allowed to go stale — but it must carry a
  header saying what superseded it. Status docs that drift silently are worse than no
  doc, which is why the old `splitstep-handoff.md` was removed rather than patched.
