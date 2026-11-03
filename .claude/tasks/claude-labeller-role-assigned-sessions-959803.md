# Tasks — claude/labeller-role-assigned-sessions-959803

> Scope: a "labeller" role so an external vendor can clean an assigned match in the label console at /label, submit it for admin review, and never reach /admin.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Migration: labeller role, assignment, submitted status, beats, submissions

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_labeller_role.sql (new; guess)
- **done when:**
  - [ ] The migration adds `users.is_labeller boolean not null default false` with NO `grant update` of it to `authenticated` or `anon`, extends the `users_block_admin_self_update` trigger (20260914100000) to raise on an `is_labeller` change made outside `service_role`/`postgres`, and grants `select (is_labeller)` to `authenticated` only if the live `information_schema.column_privileges` shows SELECT on `public.users` is column-scoped — the migration's header comment records what was found live.
  - [ ] `label_sessions` gains `assigned_to uuid references public.users(id) on delete set null`, `assigned_at timestamptz`, `submitted_at timestamptz`; the status CHECK becomes `status in ('labelling','submitted','complete')` (drop + re-add by its live constraint name, verified live); the `(status = 'complete') = (completed_at is not null)` CHECK is kept; a new CHECK holds `(status = 'submitted') = (submitted_at is not null)`.
  - [ ] `label_sessions_one_open_per_job` is recreated as `where status in ('labelling','submitted')`, and `claim_label_publish_lease` is recreated to match `status in ('labelling','submitted')` so Mark complete can publish a submitted session; `undo_label_op`/`redo_label_op` are left matching `status = 'labelling'` (a submitted session takes no edits).
  - [ ] New table `public.label_work_beats (session_id uuid references label_sessions on delete cascade, user_id uuid references users on delete cascade, minute timestamptz not null, primary key (session_id, user_id, minute))` and new table `public.label_submissions (id uuid pk default gen_random_uuid(), session_id uuid references label_sessions on delete cascade, submitted_by uuid references users on delete set null, submitted_at timestamptz not null default now(), rows jsonb not null)` with an index on `session_id`; both have RLS enabled, no policies, and `revoke all ... from anon, authenticated` so only `service_role` reads or writes.
  - [ ] The migration header lists every live column of `label_sessions` and `users` it touches as verified against the live DB (Supabase MCP) on the day it is applied, and the Rollback block drops everything it created in reverse order.
- **notes:** The live DB is the source of truth — the migrations folder is ~100 behind. Deviation from the dictated intent, on purpose (author approved 2026-11-03): an `authenticated` UPDATE grant on `is_labeller` would let any user self-promote exactly as 20260914100000 closed for `is_admin`; the column is written service-role by the admin assign action (T7) only. Do NOT add labeller RLS policies on label_* tables — every read and write stays service-role behind the app guard (T2).

## T2 · requireLabelActor guard and session resolver

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** src/lib/services/programs/admin-guard.ts, src/lib/services/labels/label-actor.ts (new), tests/label-actor.spec.ts (new) — guesses
- **done when:**
  - [ ] `admin-guard.ts` exports `requireLabelActor(sessionId, deps?)` returning `Promise<{ id: string; kind: "admin" | "labeller" } | null>`: an admin (`checkAdmin()` ok) is `kind: "admin"` for any session without a session read; otherwise the caller's `users.is_labeller` must be true AND the session (read service-role) must have `assigned_to = uid` AND `status = 'labelling'`, giving `kind: "labeller"`; anything else is `null`. `deps` is an injectable `{ checkAdmin, createClient, createAdminClient }`-shaped object with a default.
  - [ ] `label-actor.ts` exports `resolveLabelSessionId(db, target)` for `target: { sessionId } | { pointId } | { shotId } | { pointIds } | { shotIds }` that reads the owning `label_sessions.id` service-role (one query per target) and returns `null` when the rows name more than one session or none, plus `requireLabelActorFor(target, deps?)` that composes the two.
  - [ ] `requireAdminOrNotFound` and `checkAdmin`/`requireAdmin` are unchanged in the diff (`/admin` stays 404 for a labeller).
  - [ ] `tests/label-actor.spec.ts` runs offline with fake clients and asserts: admin passes on an unassigned session; a labeller is refused (`null`) when unassigned, when assigned but `status = 'submitted'`, when `status = 'complete'`, and when `is_labeller` is false though assigned; a labeller assigned to a `labelling` session gets `{ kind: "labeller" }`; `resolveLabelSessionId` returns `null` for shot ids spanning two sessions.
- **notes:** Mirror `checkAdmin`'s `cache()` only for the admin branch; the labeller branch varies on `sessionId` so cache per `(uid, sessionId)` or not at all. Refusals stay `null` (the services turn it into a sentence) — do not throw.

## T3 · Swap label services onto requireLabelActor

- **status:** done
- **model:** fable
- **needs:** T2
- **files:** src/lib/services/labels/edit-session.ts, src/lib/services/labels/operations-session.ts (`gated`), every src/lib/services/labels/_-session.ts, add-missing-shots.ts, undo-session.ts, open-counts-session.ts, and the tests/label-_.spec.ts that inject `requireAdmin` — guesses
- **done when:**
  - [ ] `LabelWriteDependencies.requireAdmin` is replaced by `requireLabelActor: (target: LabelActorTarget) => Promise<LabelActor | null>` (default `requireLabelActorFor` from T2); `gated(deps, work, what, target)` takes the target and passes `actor.kind` through to `work`; every per-row/per-session service in `src/lib/services/labels/` (edit, operations, reset, game-operations, site-removal, suggestions, point-insert, game-shift, point-split, point-combine, player-swap, session-fields, undo/redo, add-missing-shots, open-counts) calls it with the right target.
  - [ ] `seedLabelSession`, `completeLabelSession` and `reopenLabelSession` still call `requireAdmin` (or refuse any actor whose `kind !== "admin"`) — a labeller can never seed, publish or reopen; a spec asserts each of the three refuses `{ kind: "labeller" }`.
  - [ ] `readSessionGate` returns a distinct sentence (exported constant, e.g. `SUBMITTED = "This session has been submitted for review, so its labels can no longer change."`) for `status = 'submitted'`, and `FROZEN` for `complete`; a spec asserts both.
  - [ ] `ADMIN_REQUIRED` is only returned where the actor must be an admin; the generic gate refusal becomes a new exported `ACTOR_REQUIRED` sentence ("You don't have access to this session.") so a labeller is not told to become an administrator.
  - [ ] `npm run typecheck` and `npm test` pass with every existing label spec updated from `requireAdmin: async () => …` fakes to `requireLabelActor: async () => …` fakes — no spec is deleted or skipped.
- **notes:** This is the security boundary for the whole feature, so route high. ~30 `gated(` call sites across 12 files plus three directly-gated services; keep each change mechanical. `withLabelOp` and the service-role writes are untouched — the gate decides who, the service-role client still does the writing.

## T4 · Submit-for-review service and admin status paths

- **status:** todo
- **model:** fable
- **needs:** T2
- **files:** src/lib/services/labels/submit-session.ts (new), src/lib/services/labels/session-status-session.ts, src/app/admin/labels/actions.ts, tests/label-submit.spec.ts (new) — guesses
- **done when:**
  - [ ] `submitLabelSession(sessionId, deps)` (gated on `requireLabelActor`, accepting `kind: "labeller"` or `"admin"`) refuses unless `status = 'labelling'` and no publish lease is held, inserts one `label_submissions` row whose `rows` jsonb holds the session's points and shots as `readLabelSessionRows` returns them, then updates `label_sessions` to `status = 'submitted'`, `submitted_at = now`, `labeller = actor.id`, matched on `status = 'labelling'` (raced → `racedMessage("session")`); never writes `matches`, `points` or `shots`.
  - [ ] `writeLabelSessionReopen` accepts `status in ('complete','submitted')`: from `submitted` it sets `status = 'labelling'`, `submitted_at = null`, matched on `status = 'submitted'`, and does NOT call `unverify_match`; from `complete` it behaves exactly as before. A spec asserts the rpc is not called on the submitted path.
  - [ ] `writeLabelSessionComplete` accepts a `submitted` session: `checkSessionOpen` is bypassed for admins only when `status = 'submitted'` (lease and publish unchanged), and the close UPDATE also sets `submitted_at` unchanged (the submission row remains for the diff); a labeller actor is refused before any read.
  - [ ] `src/app/admin/labels/actions.ts` exports `submitLabelSessionAction(sessionId)` (outside `withLabelOp`, like complete) and the `LabelSessionStatusResult.status` union includes `"submitted"`; `LabelSession.status`, `LabelJobRow.session.status` and `DbSessionRow.status` types include `"submitted"`.
  - [ ] `tests/label-submit.spec.ts` runs offline over a fake client: submit on `labelling` writes the snapshot then the status; submit on `submitted`/`complete` is refused with the T3 sentences; reopen from `submitted` returns `{ ok: true, status: "labelling" }`.
- **notes:** The snapshot is the baseline a later admin review is diffed against; the diff view itself is out of scope here. Decision (author approved 2026-11-03): a submitted session is frozen for everyone — admins review read-only, then either Mark complete (publishes as-is) or Reopen (back to labelling, which also lets the assigned labeller edit again). No DB function other than `claim_label_publish_lease` (T1) learns about `submitted`.

## T5 · /label area: layout, assigned-sessions list, 404 gate

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/app/label/layout.tsx (new), src/app/label/page.tsx (new), src/lib/data/label-assignments-server.ts (new), MAP.md (regenerated), tests/label-routes.spec.ts (new) — guesses
- **done when:**
  - [ ] `src/app/label/layout.tsx` gates once with a new `requireLabelViewerOrNotFound()` beside `requireAdminOrNotFound` in admin-guard.ts: no session → `redirect(await loginRedirectPath("/label"))`; signed in but neither `is_admin` nor `is_labeller` → `notFound()`. The layout renders a minimal header (product mark, "Labels" title, link to `/label/guide`, sign-out) and imports nothing from `@/components/admin/admin-header` or `admin-nav-server`.
  - [ ] `listAssignedLabelSessions(deps)` in `label-assignments-server.ts` reads service-role the sessions where `assigned_to = viewer.id` and `status in ('labelling','submitted')`, returning `{ id, status, assignedAt, submittedAt, checked, total, openCounts }` — no `match_id`, player names, program or job id in the returned type.
  - [ ] `/label` lists those sessions as rows linking to `/label/[sessionId]`, labelled by assignment date and status ("In progress" / "Submitted"), with an empty state "No matches are assigned to you yet." and no `href` under `/admin` anywhere in the rendered markup; an offline spec renders the list with the vm-modules loader and asserts the two row states, the empty state, and that the markup contains no `/admin` string.
  - [ ] `npm run map` is run and MAP.md's route table lists `/label`, `/label/[sessionId]` (placeholder page allowed until T6) and `/label/guide` (placeholder until T9) — the map test passes.
  - [ ] `tests/label-routes.spec.ts` (offline, fakes injected) asserts `requireLabelViewerOrNotFound` calls `notFound` for a signed-in user with both flags false and returns `{ id, kind }` for an admin and for a labeller.
- **routes:** labeller:/label
- **notes:** `/label` is deliberately outside `/admin`; `src/proxy.ts` refreshes sessions for it already (no matcher change expected — verify). Follow the admin-page column widths and `advantage-analytics-design` tokens; no admin nav, no workspace switcher.

## T6 · Labeller console view at /label/[sessionId]

- **status:** todo
- **model:** opus
- **needs:** T3, T4, T5
- **files:** src/app/label/[sessionId]/page.tsx (new), src/app/label/actions.ts (new), src/components/admin/labels/label-console.tsx, tests/label-console-labeller.spec.ts (new) — guesses
- **done when:**
  - [ ] `LabelConsole` takes `viewerKind?: "admin" | "labeller"` (default `"admin"`). With `"labeller"` the header renders no avatars, no `{player1Name} vs {player2Name}` heading, no `ProgramCrest`/program line and no `derivation` line; `sideNames` resolves to the labels "Near player" / "Far player" everywhere the rail and tray print a side; and no `Mark complete`/`Reopen` button is rendered even when `operations.completeSession` is passed — instead a `data-submit-review` button "Submit for review" (confirm dialog, disabled while `saveStatus.pending > 0`) calls `operations.submitSession`. With `"admin"` the rendered header markup is byte-identical to today's for a `labelling` session (spec diffs the two).
  - [ ] Admin header shows `· Submitted for review` (`data-session-submitted`) when `status === "submitted"`, with Reopen available and Mark complete available; the labeller view on a submitted session is read-only (`editable` false) and shows "Submitted — waiting for review" in place of the button.
  - [ ] `src/app/label/[sessionId]/page.tsx` calls `requireLabelActor(sessionId)` first and `notFound()`s on `null`, then loads with `getLabelSession(sessionId, { ...sessionDefaults, requireAdmin: async () => actor })`, passes `upload={null}`, `viewerKind="labeller"`, a `headerAction` linking to `/label` ("Back to my matches"), and `initialExpandedPointId` set to the first amber stop (first of `openFlags(...)` non-`data` ∪ `slotStops(...)` ∪ score stop in rail order, via `stepFlag(..., null, 1)`), falling back to the console default when none is open.
  - [ ] `src/app/label/actions.ts` ("use server") re-exports every per-row/per-session action the console needs (the same list `admin/labels/[sessionId]/page.tsx` wires minus `completeSession` and `reopenSession`) plus `submitLabelSessionAction`; each is the T3-gated service, so a non-assigned caller gets `ACTOR_REQUIRED`; the page never imports from `src/app/admin/`.
  - [ ] `tests/label-console-labeller.spec.ts` renders the console offline (vm-modules loader, `labelSessionFixture`) with `viewerKind="labeller"` and asserts: the markup contains neither fixture player name nor `/admin`, contains "Near player" and "Far player" and `data-submit-review`, lacks `data-mark-complete`/`data-reopen-session`; and that with a fixture whose only amber stop is point 3 the expanded point on first render is point 3.
- **routes:** labeller:/label/[sessionId]
- **notes:** Keep `maxDuration` modest (no publish here). "Near/Far" is fixed per session in the console today (`tiebreakHitterHalf … ?? "near"`), so a changeover does not flip the words — kept as dictated; "Player 1"/"Player 2" is the alternative if the vendor finds it confusing.

## T7 · Admin assignment control and submitted indicator

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/labels/assign-session.ts (new), src/app/admin/labels/actions.ts, src/lib/data/labels-server.ts, src/components/admin/labels-board/label-job-row.tsx, src/components/admin/labels/labels-board.tsx, tests/label-assign.spec.ts (new) — guesses
- **done when:**
  - [ ] `assignLabelSession(sessionId, userId | null, deps)` is `requireAdmin`-gated (never `requireLabelActor`), refuses a `userId` whose `users.is_labeller` is false or who does not exist, refuses when `status = 'complete'`, and writes `assigned_to`, `assigned_at = now()` (both null on unassign) service-role; `listLabellers(deps)` returns `{ id, name, email }` for `users where is_labeller = true`; `assignLabelSessionAction` and `listLabellersAction` are exported from `admin/labels/actions.ts`.
  - [ ] `LabelJobRow.session` gains `assignedTo: { id; name } | null`, `assignedAt`, `submittedAt`, and `status` includes `"submitted"`; `listLabelJobs` fills them in the same query (no N+1 beyond the existing joins); `jobState` maps `submitted` to the "doing" group with its own pill text "Submitted for review".
  - [ ] Each session row of the Labels list has an `Assign` control (a `FilterMenuPill`-style menu listing `listLabellers()` plus "Unassigned") that calls `assignLabelSessionAction`, shows the assignee's name when set, and is rendered only when `job.session` exists; the row's `Link` navigation is not triggered by opening the menu (`stopPropagation` or the control sits outside the link).
  - [ ] `tests/label-assign.spec.ts` (offline, fake client) asserts: non-admin refused; non-labeller target refused; complete session refused; happy path writes `assigned_to` and `assigned_at`; unassign writes both null.
- **routes:** /admin/labels
- **notes:** `LABEL_GRID`/`LABEL_COLUMNS` get an "Assigned" column — update both so header and rows stay aligned. Minutes worked is T8, not here.

## T8 · Active-time heartbeat and minutes worked

- **status:** todo
- **model:** opus
- **needs:** T2, T7
- **files:** src/lib/services/labels/work-beats.ts (new, pure), src/lib/services/labels/work-beats-session.ts (new), src/components/admin/labels/use-work-beat.ts (new), src/components/admin/labels/label-console.tsx, src/app/admin/labels/actions.ts, src/app/label/actions.ts, src/lib/data/labels-server.ts, src/components/admin/labels-board/label-job-row.tsx, tests/label-work-beats.spec.ts (new) — guesses
- **done when:**
  - [ ] `work-beats.ts` exports pure `shouldBeat({ now, visible, lastInputAt, lastBeatAt }, { interval = 60_000, idleAfter = 150_000 })` returning true only when the document is visible, input happened within `idleAfter`, and `interval` has passed since the last beat; a spec covers hidden tab, idle, too-soon and the happy case.
  - [ ] `recordLabelWorkBeat(sessionId, deps)` is gated on `requireLabelActor` (admin or assigned labeller), inserts `{ session_id, user_id: actor.id, minute: date_trunc('minute', now()) }` into `label_work_beats` with `onConflict` ignore, returns `{ ok: true }` on both insert and duplicate, and never throws; exported as `recordLabelWorkBeatAction` from both actions files (outside `withLabelOp`).
  - [ ] `useWorkBeat(sessionId, record)` in `use-work-beat.ts` tracks `visibilitychange`, `keydown`/`pointerdown` on `document`, ticks every 60 s and calls `record` only when `shouldBeat` says so; `LabelConsole` mounts it when `operations.recordWorkBeat` is supplied (both the admin and labeller pages supply it).
  - [ ] `listLabelJobs` adds `minutesWorked: number` (count of `label_work_beats` rows per session, one query grouped by `session_id`) to `LabelJobRow.session`, and the Labels row renders it as "N min" beside the Assigned column (T7); `0` renders "—".
  - [ ] `tests/label-work-beats.spec.ts` asserts the dedupe (two records in one minute make one insert attempt that is `onConflict`-ignored), the gate refusal for an unassigned labeller, and the `minutesWorked` count through a fake client.
- **notes:** One row per (session, user, minute) is the PK from T1, so dedupe is the database's — the service just ignores 23505. Minutes = beat count by design (a beat is sent at most once a minute).

## T9 · Labeller guides at /label/guide

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/app/label/guide/page.tsx (new), src/lib/labels/guide-content.ts (new), tests/label-guide.spec.ts (new) — guesses
- **done when:**
  - [ ] `guide-content.ts` exports `GUIDE_VERSION` (a date string, e.g. "2026-11-03") and two typed section arrays rendered by the page; the page prints "Guide v{GUIDE_VERSION}" and is reachable inside the `/label` layout (so T5's `requireLabelViewerOrNotFound` admits admins and labellers and 404s everyone else — a spec asserts the page module imports nothing from `admin-guard` beyond what the layout provides).
  - [ ] The How-to section has headings, in order: "Video controls", "The rail", "Keys", "Combine and split points", "Game boundaries" (covering split game, pull points, shift overflow), "Players at the wrong end", "Set the server", "Undo and redo", "Submit for review"; the Keys subsection is generated from `label-shortcuts.ts`'s groups (not retyped), so it lists `]`, `[`, `'`, `;`, `⌘Z`, `⌘⇧Z`.
  - [ ] The Cleaning standard section contains, verbatim as list items: "Structure and amber flags first, then grey, then forced/unforced error marks."; "Watch the whole match: a clean flag count does not mean a correct match — a hitter swap raises no flag."; "Never delete a rally. If you are unsure, it is a point."; "Do not adjust shot coordinates."; "Leave anything you cannot resolve flagged."; "Done means: no amber stops, and the score matches."
  - [ ] `tests/label-guide.spec.ts` renders the page's content component offline and asserts the nine How-to headings in order, the six standard sentences, the version string, and that the markup contains no `/admin` link.
- **routes:** labeller:/label/guide
- **notes:** Plain prose page using the design system's text tokens; no video embeds. Both guides live on one route with an in-page nav (two `<section id>`s) unless the author prefers two routes.

## T10 · Eyes-on labeller verifier: harness prefix and seed script

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** scripts/eyes-on/path-spec.mjs, scripts/eyes-on/capture.mjs, scripts/eyes-on/seed-labeller-session.ts (new), .env.example, tests/eyes-on-path-spec.spec.ts (new or existing) — guesses
- **done when:**
  - [ ] `parsePathSpec` accepts a `labeller:` prefix alongside `team:` and returns `{ team: false, labeller: true, path, clicks }`; a path under `/label` is `labeller: true` without the prefix; a spec covers `labeller:/label/guide`, `/label`, `team:/dashboard/team`, and a bare `/dashboard`.
  - [ ] `capture.mjs` signs in with `EYES_ON_LABELLER_EMAIL`/`EYES_ON_LABELLER_PASSWORD` for `labeller: true` paths using a separate storage-state file, exits 2 with "EYES_ON_LABELLER credentials unset" when a labeller path is requested without them, and leaves non-labeller paths exactly as today; `.env.example` documents both variables under the existing Eyes-on block, including "an `is_labeller` test user, never a real vendor login".
  - [ ] `scripts/eyes-on/seed-labeller-session.ts` (dry-run default, `--write`, `--cleanup`, `--cleanup --write`, like `seed-failure-classes.ts`) sets `is_labeller = true` on the `EYES_ON_LABELLER_EMAIL` user, creates one throwaway `label_sessions` row (`kind = 'analyst'`, `status = 'labelling'`, `assigned_to` = that user) with a few `label_points`/`label_shots` on an Eyes-on seed match (marker `tournament_name = "Eyes-on seed · labeller"`), and refuses to run when the configured match id is `93d85299-f71b-4a90-a40f-709854e59172` or the session id is `7a249f73-f2ad-4d54-a7d7-bd330d05dddd` (Cj vs Suhail), or when the session would be on a match that is not an Eyes-on seed.
  - [ ] `.claude/skills/pr-check/SKILL.md` Stage 3b names the `labeller:` prefix beside `team:` in the paragraph that explains how `routes:` lines reach `capture.mjs`.
- **notes:** The /label tasks carry `routes: labeller:/label…` lines that only work once this lands; run it before `/pr-check` on this branch. Never point the seed at the real Cj vs Suhail session.
