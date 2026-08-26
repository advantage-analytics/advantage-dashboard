# docs/

| File | What it is | Read it when |
|---|---|---|
| [`pilot-branch-handoff.md`](pilot-branch-handoff.md) | **What the pilot branch does and what it leaves you**: the thirteen commits, the two applied migrations, the three files another branch also touches and how to resolve each, the invariants not to undo, and what is still open with the reason each one is | **You are merging `claude/pilot-program-roadmap-724bdb`, or picking up what it did not finish.** Start here before the two below |
| [`ui-revamp-guardrails.md`](ui-revamp-guardrails.md) | What the video pipeline needs from the UI: what must not be touched, which UI seams carry non-obvious invariants, the three inputs that silently attribute every statistic to the wrong player, and the open non-UI action items | **You are redesigning any part of the dashboard.** Read before touching the upload wizard, the matches list, or the match detail page |
| [`r2-and-webhook-overview.md`](r2-and-webhook-overview.md) | **Current state** of the video pipeline: Azure Blob storage and SAS URLs, the results webhook, quota, deletion, and what a UI redesign can safely touch. Filename is stale — source video moved off Cloudflare R2; rename it once the retired R2 code is deleted | You are working on anything SplitStep-related. Start here |
| [`email-system.md`](email-system.md) | **Current state** of transactional email: the product/auth sender split, the `EmailContent` model, the checklist for adding one, and the invariants that fail silently (missing preheader, no plain-text part, a send from client code, non-UTC expiries) | You are writing an email template, wiring a trigger that sends one, or changing the shell |
| [`ux-overhaul-brief.md`](ux-overhaul-brief.md) | Information-architecture and flow brief for the redesign: product thesis, personas, sitemap, key flows, sequencing, and the open founder decisions. **Point-in-time (2026-08-06)** — what to build still stands, its audit of what exists does not; the header lists what changed | You are planning the redesign. Pair it with `ui-revamp-guardrails.md` |
| [`onboarding-and-workspaces.md`](onboarding-and-workspaces.md) | Why only team workspaces are creatable, where the persona question should live, and why writing it to `users.role` would downgrade paying customers today. **Point-in-time (2026-08-18)** — §1–§2 are shipped behaviour, §3–§5 are open decisions | You are changing sign-up, the claim flow's questions, or anything that reads `users.role` |
| [`splitstep-integration-spec.md`](splitstep-integration-spec.md) | The original design spec. Kept for the reasoning; several sections are deliberately superseded and marked as such at the top | You want to know *why* something was built this way |
| [`roster-edit-and-people-search.md`](roster-edit-and-people-search.md) | Two roster changes — editing a player from the row menu (**built** as T1 on `claude/roster-edit-player`) and making people findable in the command palette (still unbuilt; the palette searches only `matches` today) — plus why roster filtering was declined. **Point-in-time (2026-08-25)**, and §1's "archived rows are editable" risk is superseded by migration `20260825131815` | You are picking up T1 on `claude/roster-edit-player`, or wondering whether the roster should be filterable |
| [`llm-setup.md`](llm-setup.md) | Configuring the `/api/chat` provider (Anthropic or OpenAI), keys, mock mode, rough costs | Setting up LLM features locally |

Also relevant, on the **`splitstep-derivation`** branch:

| File | What it is |
|---|---|
| [`splitstep-derivation.md`](splitstep-derivation.md) | **Current state** of the derivation engine: what runs in what order, the contracts that break silently when violated (coordinate frame, shot numbering, server-relative scores), the trust tiers, and the gates. Read before touching `derivation/`, the results webhook, or anything that averages `match_stats` |
| [`splitstep-vendor-questions.md`](splitstep-vendor-questions.md) | The open vendor questions, each backed by measurements from three real payloads. Supersedes §5 of the spec, with question numbers preserved so `TODO(splitstep-qN)` markers stay valid |

## Conventions

- The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep`
  is internal naming only, and nothing customer-facing attributes anything to SplitStep.
- A doc that describes current state says so and is kept current. A doc that captures a
  point-in-time decision says that too, and is allowed to go stale — but it must carry a
  header saying what superseded it. Status docs that drift silently are worse than no
  doc, which is why the old `splitstep-handoff.md` was removed rather than patched.
