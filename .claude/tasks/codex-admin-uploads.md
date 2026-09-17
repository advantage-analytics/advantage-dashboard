# Tasks — codex/admin-uploads

> Scope: Admin Console Phase 2b — team-scoped file/video uploads, dual/tournament results, explicit console provenance, retryable saves, and submission history.
> Base and PR target: splitstep-integration. All tasks begin as todo; creating this queue does not execute them.

Run one by reading `.claude/skills/task-next/SKILL.md` and following it with this queue's Codex dispatch override. Use the tracked `.claude/tasks/` queue, not the stale `.Codex/tasks/` path in the local skill mirror.

To drain the file, loop a plain-text instruction — not `/loop /task-next`:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every iteration, and the runner only rewrites a task's `status:` line. Mark a task `next` to jump the queue.

Status values: `todo`, `next`, `doing`, `done`, `blocked`, and `later`. A task with unmet `needs:` is not eligible; `later` tasks are not selected automatically. The log is the runner's append-only record.

## Model routing

These are workload equivalents, not exact model equivalences:

| Original | Codex model     | Work                                                |
| -------- | --------------- | --------------------------------------------------- |
| Fable    | `gpt-6-astra`   | Security, database contracts, architectural changes |
| Opus     | `gpt-5.6-sol`   | Feature implementation and integration              |
| Sonnet   | `gpt-5.6-terra` | Small, fully specified changes                      |

**Queue dispatch override (explicit user instruction):** Pass each task's exact Codex model ID to the subagent tool. This overrides the task skills' Anthropic names and Sonnet fallback. If a named model is unavailable, report it instead of silently substituting. This changes agent routing only, not the application's LLM provider. Supply the task's context explicitly when using a model override; use a supported history setting rather than a full-history fork that forbids model overrides.

## Task routing

| Task                                   | Model | Dependencies            |
| -------------------------------------- | ----- | ----------------------- |
| T1 · Verify live contracts             | Astra | —                       |
| T2 · Persist console provenance        | Astra | T1                      |
| T3 · Resolve admin workspace           | Astra | T1                      |
| T4 · Scope wizard lookups              | Astra | T3                      |
| T5 · Guard analysis attachments        | Astra | T2, T3                  |
| T6 · Integrate file submissions        | Astra | T4, T5                  |
| T7 · Authorize video submissions       | Astra | T5                      |
| T8 · Add admin wizard variant          | Sol   | T4, T6, T7              |
| T9 · Extract schedule writes           | Astra | T1                      |
| T10 · Save retryable dual results      | Astra | T2, T3, T9              |
| T11 · Save tournament results          | Astra | T10                     |
| T12 · Build upload entry route         | Sol   | T3, T8                  |
| T13 · Build dual result form           | Sol   | T10, T12                |
| T14 · Build tournament result form     | Sol   | T11, T13                |
| T15 · Load submission history          | Astra | T6, T7, T10, T11        |
| T16 · Render submission history        | Sol   | T12, T15                |
| T17 · Add team shortcut                | Terra | T12                     |
| T18 · Verify authorization and retries | Astra | T6, T7, T10, T11, T15   |
| T19 · Verify flows and design          | Sol   | T13, T14, T16, T17, T18 |
| T20 · Complete release checks          | Astra | T19                     |

## Queue-wide requirements

- All tasks initially use `status: todo`.
- Read the design skill before UI work; trace dashboard routes before editing shared components.
- Preserve upload attribution, trimming, scoring, and vendor validation invariants.
- Console history includes member and non-member admins; ordinary dashboard activity is excluded.
- Preserve successful partial saves and retry failed items without duplication.
- Existing coach-created results permit analysis attachment, not score or identity changes.
- Apply the normal completion, RLS, and pipeline review gates. Push and merge remain separately authorized.
- Desktop scope; no Activity tab, bulk import, full tournament draw editor, or general processing monitor. Do not claim an owner activity-log surface exists.
- The live database is the schema authority. T1 must verify it before dependent implementation; do not substitute old migration bodies for live evidence.

## Planning and design references

The approved task criteria below supersede conflicting details in the earlier Phase 2b draft, particularly membership-based audit triggers and the assumption that coach-created matches cannot receive analysis.

- Earlier local plan: `/Users/cjgimena/.claude/plans/synchronous-cuddling-phoenix.md`, Phase 2b.
- Extracted approved frame: `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/UploadForTeam.dc.html` (markup 1098–1252). This is an external local reference, not a tracked artifact; verify it remains available before visual work.
- Repository guidance: `MAP.md`, `AGENTS.md`, `.skills/advantage-analytics-design/SKILL.md`, and `docs/ui-revamp-guardrails.md`.

## T1 · Verify live Phase 2b database contracts

- **status:** done
- **model:** gpt-6-astra
- **files:** Best guesses: `docs/admin-uploads-contracts.md`; relevant live Supabase objects.
- **done when:**
  - [ ] The contract note records the Phase 2a baseline and timestamped live evidence for relevant match, schedule, processing, audit, policy, trigger, and RPC behavior.
  - [ ] It specifies permitted writes for provenance, retryable results, and analysis attachment while identifying protected result fields.
  - [ ] It distinguishes verified facts from assumptions and identifies fresh migration timestamps; missing live access blocks completion.

## T2 · Persist explicit console submission provenance

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: new submission migration, `src/lib/admin/uploads/types.ts`, database contract tests.
- **done when:**
  - [ ] Durable submissions record operation ID, actor, program, kind, linked records, and per-item status.
  - [ ] Admin-gated writes explicitly record console origin for member and non-member admins; ordinary dashboard writes do not.
  - [ ] Successful additions and existing-match attachments produce one audit entry; repeated operation/item IDs return prior outcomes.
  - [ ] Non-admin callers cannot forge provenance, and policies do not grant unrestricted match updates or deletion.

## T3 · Resolve a guarded admin team workspace

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: `src/lib/data/admin-upload-server.ts`, workspace helpers and tests.
- **done when:**
  - [ ] A server-only loader checks admin authorization and resolves the selected program, eligible roster, status, and video allowance.
  - [ ] Authorized non-member admins succeed; non-admin callers and invalid program IDs receive explicit refusals.
  - [ ] The context preserves the session actor without changing workspace cookies; service-role reads follow the guard and expose no credentials.

## T4 · Add explicit program scope to wizard lookups

- **status:** done
- **model:** gpt-6-astra
- **needs:** T3
- **files:** Best guesses: `src/lib/wizard/actions.ts`, scoped workspace resolver, action tests.
- **done when:**
  - [ ] Admin roster, event-line, opponent, and supporting lookups use an explicitly authorized program.
  - [ ] Client-supplied program or admin-mode values cannot bypass server authorization.
  - [ ] Existing dashboard callers retain their workspace permissions, with tests covering legitimate admin access and refused cross-program requests.

## T5 · Prepare analysis attachments without rewriting results

- **status:** done
- **model:** gpt-6-astra
- **needs:** T2, T3
- **files:** Best guesses: `src/lib/data/add-video-server.ts`, admin attachment service, scoped RPC and tests.
- **done when:**
  - [ ] Admins can prepare analysis for an eligible coach-created match in the selected program.
  - [ ] Creator, program, event linkage, player identities, score, and recorded result remain unchanged.
  - [ ] Existing analysis, in-flight processing, wrong-program targets, and stale eligibility produce explicit refusals.
  - [ ] Repeated preparation cannot create duplicate matches or competing reservations; tests reject forged protected fields.

## T6 · Integrate admin match-file submissions

- **status:** done
- **model:** gpt-6-astra
- **needs:** T4, T5
- **files:** Best guesses: `useUploadMatchWizard.ts`, admin file submission service, relevant upload action and tests.
- **done when:**
  - [ ] Admin file submission creates a selected-program match or attaches analysis to an authorized existing result.
  - [ ] The existing SwingVision validation, parsing, and processing pipeline remains authoritative.
  - [ ] Player or score mismatches produce actionable refusals without modifying recorded results.
  - [ ] Submission/processing states link to the durable operation; retry tests show no duplicate matches or audit entries.

## T7 · Authorize admin video submission and program billing

- **status:** done
- **model:** gpt-6-astra
- **needs:** T5
- **files:** Best guesses: video upload-URL and jobs handlers/routes, submission service, authorization tests.
- **done when:**
  - [ ] Video authorization supports verified admin attachments to coach-created matches while retaining job ownership checks.
  - [ ] Eligibility and billing derive from the target program, preserving status, roster, quota, trimming, and vendor validation.
  - [ ] Repeated requests do not create duplicate jobs; operation state reflects processing outcomes.
  - [ ] Tests cover member/non-member admins, unauthorized actors, wrong-program attempts, and target-program charging.

## T8 · Add the shared wizard’s admin variant

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T4, T6, T7
- **files:** Best guesses: `UploadMatchFlow.tsx`, wizard provider/footer, `useUploadMatchWizard.ts`.
- **done when:**
  - [ ] Admin mode consumes the server-resolved workspace and scoped actions, with explicit exit and success destinations.
  - [ ] Draft saving and workspace switching are hidden; preserved result fields are read-only and refusals are visible.
  - [ ] Allowance displays consistently reflect the target team.
  - [ ] Existing dashboard entrypoints retain drafts, navigation, and provider step order.

## T9 · Extract reusable schedule writes

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: `src/lib/schedule/actions.ts`, server-only schedule services, existing schedule tests.
- **done when:**
  - [ ] Required event, lineup, score, and outcome logic is reusable from server-only modules.
  - [ ] Member-facing actions retain their existing role and workspace authorization; internal helpers are not exposed as unguarded actions.
  - [ ] Schedule regression tests pass, including cross-program refusal.

## T10 · Save dual results with durable retries

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T2, T3, T9
- **files:** Best guesses: admin result actions/services, verified RPC migration, retry tests.
- **done when:**
  - [ ] Guarded submission supports existing/new duals and validates all submitted lines before writing.
  - [ ] Event setup occurs once; each line records an independent durable success or failure.
  - [ ] Retries preserve prior successes without duplicating events, matches, or audit entries.
  - [ ] Conflicting entry/round writes are serialized or rejected as stale; coach-created scores remain protected.

## T11 · Save tournament results through the retry contract

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T10
- **files:** Best guesses: admin tournament submission service/actions and tests.
- **done when:**
  - [ ] Guarded submission records one player’s round in an existing/new tournament and entry.
  - [ ] Program, participant, round, format, and score validation precedes persistence.
  - [ ] Durable IDs prevent duplicate setup/results on retry; existing results and concurrent conflicts are handled without overwriting.

## T12 · Build the admin upload entry route

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T3, T8
- **files:** Best guesses: `src/app/admin/uploads/new/page.tsx`, admin upload shell/components, `MAP.md`.
- **done when:**
  - [ ] The guarded route provides team selection and the four upload kinds, preserving team/kind in the URL.
  - [ ] File/video choices mount the shared admin wizard with the resolved team; invalid selections are recoverable.
  - [ ] The shell follows the approved frame and primitives, with cancellation and integration slots for result forms.
  - [ ] The generated route map includes the route.

## T13 · Build dual entry, review, and retry states

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T10, T12
- **files:** Best guesses: admin dual form and shared result review/status components.
- **done when:**
  - [ ] Existing/new duals use a compact nine-line form with current lineup, format, score, and outcome helpers.
  - [ ] Coach-recorded results are read-only; invalid fields show feedback; Confirm requires valid changes.
  - [ ] Review identifies the team, event, and submitted lines.
  - [ ] Partial completion identifies saved/failed lines and retries failed work while retaining inputs and successes.

## T14 · Build tournament entry and review

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T11, T13
- **files:** Best guesses: admin tournament form and shared review/status components.
- **done when:**
  - [ ] The form supports existing/new tournaments and entries for one player and round.
  - [ ] Validation and read-only recorded results are visible; review shows team, tournament, player, round, and score.
  - [ ] Failure preserves inputs and operation identity; success links to the result and admin destination.

## T15 · Load paginated console history

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T6, T7, T10, T11
- **files:** Best guesses: `src/lib/data/admin-uploads-server.ts`, history types and tests.
- **done when:**
  - [ ] An admin-guarded loader returns newest-first Date, Team, Kind, What, Added by, and State data.
  - [ ] All console submissions appear, including member-admin activity and existing-result attachments; dashboard submissions are excluded.
  - [ ] Partial-save and processing states derive from persisted evidence and existing analysis-status rules.
  - [ ] Pagination has a deterministic tie-breaker, tested with equal timestamps.

## T16 · Render console submission history

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T12, T15
- **files:** Best guesses: `src/app/admin/uploads/page.tsx`, admin history table/content components.
- **done when:**
  - [ ] The placeholder is replaced with the six-column history and “Upload for a team” action.
  - [ ] Pagination and authorized result links work.
  - [ ] Empty, loading, error, processing, and partial-save states use current primitives and preserve analysis-status meanings.

## T17 · Add the team upload shortcut

- **status:** todo
- **model:** gpt-5.6-terra
- **needs:** T12
- **files:** Best guesses: admin team page and its header component.
- **done when:**
  - [ ] The team page shows “Upload for this team” using the appropriate existing action primitive.
  - [ ] Its URL contains that page’s program ID as the `team` parameter.
  - [ ] Existing header hierarchy, actions, and primary CTA styling remain intact.

## T18 · Verify authorization and retry concurrency

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T6, T7, T10, T11, T15
- **files:** Best guesses: admin authorization/retry specs and focused service corrections.
- **done when:**
  - [ ] Tests exercise actual authorization boundaries for program scope, provenance, and attachment permissions.
  - [ ] File/video attachment tests prove protected result fields survive.
  - [ ] Partial failures, double submissions, lost responses, and concurrent writes produce no duplicate records or jobs.
  - [ ] Program charging/status restrictions pass, and RLS review findings are resolved before completion.

## T19 · Verify all four flows and desktop fidelity

- **status:** todo
- **model:** gpt-5.6-sol
- **needs:** T13, T14, T16, T17, T18
- **files:** Best guesses: admin flow tests, `docs/admin-uploads-verification.md`, scoped integration corrections.
- **done when:**
  - [ ] Each submission kind completes and appears in history; schedule/report reads reflect saved results.
  - [ ] Existing-result attachment and partial-save retry are exercised end to end.
  - [ ] Personal/team dashboard regressions cover drafts, navigation, eligibility, and allowance displays.
  - [ ] Recorded desktop checks compare delivered screens with the frame; unavailable checks remain explicitly incomplete.

## T20 · Complete release checks and reviews

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T19
- **files:** Best guesses: verification documentation and narrowly scoped fixes.
- **done when:**
  - [ ] Relevant tests, lint, typecheck, production build, route-map freshness, and design-drift checks pass.
  - [ ] Final RLS-boundary and pipeline-guardrails reviews cover the complete branch, with findings resolved.
  - [ ] Required migration/deployment steps and outstanding live checks are separately documented.
  - [ ] The branch is ready for `/pr-check` against `splitstep-integration`, without claiming unperformed deployment or merge work.
