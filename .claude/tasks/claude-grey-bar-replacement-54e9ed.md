# Tasks — claude/grey-bar-replacement-54e9ed

> Scope: Replace the grey court-guide info box in the upload wizard's video requirements panel with a help-centre link.

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

## T1 · Replace the court-guide box with a help-centre link

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/VideoRequirements.tsx
- **done when:**
  - [ ] The `CourtGuide` function, its inline SVG and the `bg-[var(--surface-subtle)]` wrapper are deleted from `VideoRequirements.tsx`; the wizard's video step renders no grey box between the spec line and the `REQUIREMENTS` list.
  - [ ] In its place, the panel ends with a single inline text link (a `next/link` `<Link>`) reading "View all requirements" that points to `/dashboard/help#advantage-intelligence` — the existing help-centre section whose `id` is already `advantage-intelligence` — styled with the DS link treatment (`text-[var(--blue)]`, hover `--blue-hover`, `text-[12px]`), not a button.
  - [ ] The `REQUIREMENTS` row "Elevated, centered, behind one baseline" no longer says "see the court guide below"; its `rest` copy instead carries the framing rule itself: both baselines and the far service line in frame, with some space beyond the court on every side.
  - [ ] The "A guide, not a check — nothing here confirms the framing." disclaimer appears nowhere in the wizard; the doc comment at the top of the file is updated so it no longer describes a court-framing guide or an inline SVG.
  - [ ] `npm run typecheck` and `npm run lint` pass with no new findings in the changed file.
- **notes:** Destination is confirmed, not guessed — MAP.md lists `/dashboard/help` (`src/app/dashboard/help/page.tsx`) and its Advantage Intelligence section has `id="advantage-intelligence"` with an `INTELLIGENCE_REQUIREMENTS` list (singles, 1080p, 30 fps, complete games). That section says nothing about camera framing, which is why criterion 3 keeps the framing sentence in the wizard rather than letting it vanish. Adding framing guidance to the help page itself is out of scope here (different surface — own task if wanted). `VideoRequirements` is deliberately not `"use client"`; `next/link` is fine in a Server-Component-compatible file, so do not add the directive. No measured outside-court margin exists in the provider's docs — keep "some space", don't invent a number. Do not touch `FileStepContent.tsx` or the wizard's player-assignment inputs (see `docs/ui-revamp-guardrails.md`).

## T2 · Keep the trim rail from painting over the wizard footer

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/WizardShell.tsx, src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx
- **done when:**
  - [ ] The sticky footer in `WizardShell.tsx` owns a stacking context above the scrolling content (`z-10` or equivalent on the `sticky bottom-0` div, and `getComputedStyle(footer).zIndex !== "auto"`), so that when the trim step is scrolled such that the rail's y-range overlaps the footer's, the footer's white bar covers the rail, bracket and handles rather than the reverse. Verified by a Playwright screenshot or `getBoundingClientRect` + `document.elementFromPoint` at a point inside the footer's box returning a footer descendant, not a rail element.
  - [ ] The rail's `relative` wrapper in `TrimStepContent.tsx` reserves the 2px overhang of the selection bracket and both drag handles (e.g. `py-0.5` on the wrapper, or `isolate` + explicit inner padding) so the bracket's and handles' `getBoundingClientRect()` top/bottom fall inside the wrapper's rect; the `-top-0.5 -bottom-0.5` look is preserved, not clipped by `overflow-hidden`.
  - [ ] With the trim step scrolled to the bottom at 1440×900 and 375×812, the gap between the lowest trim-step element's bottom edge and the footer's top edge is at least 16px (content column bottom padding in `WizardShell.tsx` raised from `pb-10` to cover footer height + gap, e.g. `pb-24`, or an equivalent spacer). Measured via `getBoundingClientRect`.
  - [ ] Both trim handles remain fully draggable after the change: dragging the right handle leftward updates the END timecode and the "x of y" header, and dragging the left handle rightward updates START — no pointer-event regression from the new stacking/padding.
  - [ ] `npm run lint` and `npm run typecheck` pass; the Provider, Match, Video and Confirm steps render with the same footer position as before (no visual change outside the trim step and the shared bottom padding).
- **notes:** Root cause is two-fold: (1) the footer has no `z-index`, so the rail's `z-[1]`/`z-[3]` bracket and handles — which sit in the root stacking context because their `relative` ancestor sets no z-index — paint above the sticky footer once they scroll into its band; (2) the content column's only bottom buffer is `pb-10` (40px), less than the 64px footer, so the trim step's last row can sit under the footer at rest. Do not use `overflow-hidden` on the rail wrapper — that clips the intentional 2px handle/bracket overhang. Keep `RAIL_HEIGHT_PX = 52` unchanged. Read `docs/ui-revamp-guardrails.md` first; the wizard's three critical inputs are out of scope and must not be touched.

## T3 · Guard the wizard roster fetch so a thrown error surfaces instead of hanging

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts
- **done when:**
  - [ ] The async body of the roster-loading `useEffect` (~lines 1335–1412) is wrapped in `try/catch` (or `.catch`), and the catch branch calls the same failure setter the existing `rosterError` path uses, so `whoPlayed.loadFailed` becomes `true` when any of the three `Promise.all` calls rejects — not only when one resolves with an `error` field
  - [ ] The failure state is reset (`setRosterLoadFailed(false)`) when a fresh load begins, so `reloadRoster()` (~line 1458) can go from "The roster couldn't be loaded." back to a successful list rather than sticking on the error
  - [ ] A stale-response guard is in place: if the effect re-runs (workspace change / unmount) before an in-flight fetch settles, the settled result does not overwrite the newer state (existing cancelled-flag pattern if one is present, else add one)
  - [ ] `npm run typecheck` and `npm run lint` pass; no change to `SourceStepContent.tsx` is needed because the existing `roster === null && loadFailed` branch already renders the error copy
- **notes:** Symptom fix only — converts the permanent "Loading the roster…" into the existing "couldn't be loaded." copy when the fetch throws. Root cause for ZZ Test Program is T4. Do not touch the RPC or any migration in this task.

## T4 · Find and fix why the ZZ Test Program roster never resolves in the upload wizard

- **status:** done
- **model:** fable
- **needs:** T3
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, supabase/migrations/20260822090500_program_roster_full.sql (reference — live DB is truth), src/lib/workspace/active-workspace-server.ts, src/lib/workspace/types.ts
- **done when:**
  - [ ] The actual failing call is identified and named in the commit message with evidence: either (a) the `program_roster_full` RPC / `program_invites` / `program_players` query returns an error or rejects for the ZZ Test Program owner (captured via `execute_sql` as that user or from the browser network tab), or (b) `eligibilityWorkspace.kind` resolves to something other than `"team"` for the program so the effect returns early — with the specific value observed
  - [ ] With the ZZ Test Program workspace active, the wizard's "Who played" step renders either the member list or the roster empty-state within one load — "Loading the roster…" is no longer the terminal state (verified via the dashboard screenshot harness or a logged-in browser session, screenshot attached)
  - [ ] If the fix touches `program_roster_full` or any RLS policy / `user_program_ids()`, the DDL is applied to the live database AND committed as a new file under `supabase/migrations/`, and the RPC still returns zero rows for a user who is not a member of the program (checked with `execute_sql`)
  - [ ] Program members who are not the current user still appear in the roster after the fix (the fix does not silently narrow results to the caller's own row)
- **notes:** ZZ Test Program (recreated 2026-08-26) has clajersongimena as sole owner and no matches — an empty roster is legitimate, but must resolve to `[]`, not hang. Verify schema against the live DB via Supabase MCP, not the migrations folder. Read `docs/ui-revamp-guardrails.md` first — "who played" is one of three wizard inputs that silently misattributes stats when wrong.

## T6 · Stop a malformed auth cookie from crashing the session-refresh proxy

- **status:** done
- **model:** fable
- **files:** src/lib/supabase/middleware.ts (the bare `await supabase.auth.getClaims();` at line 58 inside `updateSession`), tests/ (new node-only spec, e.g. `tests/session-refresh-bad-cookie.spec.ts`), src/proxy.ts (reference only — should not need to change)
- **done when:**
  - [ ] `updateSession` no longer lets a rejection from `supabase.auth.getClaims()` escape: a request carrying a Supabase auth cookie whose access token has no `exp` claim resolves to a `NextResponse` instead of throwing, and the function still returns the same `supabaseResponse` object that the `setAll` cookie hook writes into — no new `NextResponse` is built in the catch path and no redirect is issued (the "refresh only, never redirect" contract in the file header and in `src/proxy.ts` is unchanged).
  - [ ] The catch is scoped to the value `getClaims()` actually throws — the `@supabase/auth-js` `getClaims` returns `{ data: null, error }` for every `AuthError` (network, expired, invalid-signature) and only _rethrows_ non-`AuthError`s, i.e. the plain `Error("Missing exp claim")` / `Error("JWT has expired")` from `validateExp` — so the branch handles only a cookie that cannot be validated; it does not swallow the `{ error }` return path and does not blanket-catch the `createServerClient` construction or the cookie hooks.
  - [ ] The catch branch does NOT clear, rewrite or expire any cookie and does NOT treat the request as authenticated: it logs one `console.warn` carrying the error message and `request.nextUrl.pathname` (never a cookie value or token) and falls through to `return supabaseResponse`. Decision recorded in the code comment: downstream `getUser()` in the owning layouts already rejects the bad token, so clearing here would only add a second place that decides session validity.
  - [ ] With that same malformed cookie on a dev server, `GET /dashboard` returns the dashboard layout's existing `redirect("/login")` (a 307, `location: /login`) rather than a 500, and `GET /` and `GET /login` return 200 — captured as status lines in the commit message or PR description. If `getWorkspaceContext()`'s own `auth.getUser()` also throws on that token, the fix must extend there too, or the criterion is not met.
  - [ ] A new node-only Playwright spec (pattern: the existing browser-less specs in `tests/`, no `page` fixture) builds a `NextRequest` with dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` and an `sb-<ref>-auth-token` cookie whose session JSON has an access token with no `exp`, asserts `updateSession` resolves to a response with status 200, and asserts a request with no cookie at all still resolves the same way; `npm test`, `npm run typecheck` and `npm run lint` pass.
- **notes:** Root cause is SDK-internal: `node_modules/@supabase/auth-js/dist/module/lib/helpers.js` `validateExp` throws a _plain_ `Error`, and `GoTrueClient.getClaims` rethrows anything that is not an `AuthError` — so a stale/foreign-project/hand-made cookie takes down every route in `src/proxy.ts`'s matcher (everything but `api/webhooks`, `api/cron`, `_next/*`, images) for that browser until the cookie is gone. No network is involved before the throw (`getSession` reads the cookie, `decodeJWT` then `validateExp` run before `fetchJwk`), which is why the spec can run without a server. The `wizard-reproduction` 404 in the same log is NOT a leftover to delete: `/wizard-reproduction` is the fixture route for the committed, opt-in spec `tests/upload-score-regression.spec.ts` (`WIZARD_REPRODUCTION_BASE_URL`), is listed in `MAP.md`, and is 404-gated only in production builds — removing it breaks that spec and `npm run map`; leave it alone. Do not add route protection or a `/login` redirect to the proxy (see the header comment's drift history); do not touch `src/proxy.ts`'s matcher. Auth-sensitive: the reviewer should confirm the catch cannot be reached by a _valid_ session and that no branch returns a response other than `supabaseResponse`.

## T7 · Focus into tiebreak cells and leave them only on Enter

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx, tests/upload-score-regression.spec.ts
- **done when:**
  - [ ] When a game digit makes a set a tiebreak set (`isTiebreakSet` true for the typed value plus the other row's existing value — 7-6, 6-7, 1-0 in either row), `setDigit` sends focus to that set's **player** tiebreak cell (`key("p", i, true)`) instead of the next set's player cell; a game digit that does not complete a tiebreak pair still advances exactly as today (player → opponent, opponent → next set / ghost).
  - [ ] Typing in a tiebreak cell never moves focus on its own: `1` then `0` in the player tiebreak leaves the cell focused with value `10`; the tiebreak `ScoreInput` continues to call `onTiebreakChange` directly and is not routed through `setDigit`.
  - [ ] Pressing Enter in a tiebreak cell (`preventDefault`ed so no form submits) advances: player tiebreak → the same set's opponent tiebreak (`key("o", i, true)`); opponent tiebreak → the next set's player cell (`key("p", i + 1)`) when `i + 1 < displayed || ghost`, otherwise focus stays put. Enter advances whether the cell is empty or filled. Enter in a regular set cell and in the ghost cell still does nothing (the existing `opponentThird.press("Enter")` assertion keeps passing).
  - [ ] `tests/upload-score-regression.spec.ts` "score cells keep corrections, ghost sets, tiebreaks, and the final cell focused" is updated: after `opponentFirst.press("6")` (set 1 becomes 7-6) it expects the **player set 1 tiebreak** focused rather than `playerSecond`; it types `10`, presses Enter, expects the opponent tiebreak focused, types `8`, presses Enter, expects `playerSecond` focused. `npm test -- upload-score-regression` passes.
  - [ ] The hint line under the rows (currently "Digits move on · tiebreak cells appear on their own") says that Enter leaves a tiebreak cell, e.g. "Digits move on · Enter leaves a tiebreak cell".
- **notes:** All focus logic is local to `ScoreBlock.tsx`; `onTiebreakChange` plumbing (DetailsStepContent → UploadMatchFlow → useUploadMatchWizard) is untouched. Add an optional `onEnter?: () => void` prop to `ScoreInput` wired to `onKeyDown` (pattern: `edit-match-dialog.tsx`'s `ScoreCell`) and pass it only from the tiebreak instance. Focus-in timing: `focusKey` is `setTimeout(..., 0)`; the tiebreak input mounts in the commit triggered by `onScoreChange` before that macrotask fires, so the ref is populated — if it is not in practice, fall back to focusing from a `useEffect` keyed on a "pending focus" ref rather than lengthening the timeout. `ghostDigit` needs no change (a single digit with the other row empty can never be a tiebreak pair). `ScoreBlock` is also rendered by `src/components/dashboard/schedule/score-only-flow.tsx`, so the schedule score-only flow inherits the behaviour — intended, not a regression. Interpretation flagged for the reviewer: Enter on an _empty_ tiebreak cell advances (Enter is the explicit "done here" gesture; a blank tiebreak is a legitimate skip). The "regular cells keep single-digit auto-advance" constraint from the clarification is criterion 1's second clause.
