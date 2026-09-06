# Plan — workspace-breadcrumb-hairline

Four steps. Three touch files; the fourth is the visual check that no gate can
run. Total surface: **two existing files, one new test.**

## Decision carried in from chat

The design's open question 1 — how to record that the hairline fix contradicts
DS v3's `Header (v3)` (`border-transparent` at rest, `#EBEBEB` as a *scroll
indicator*) — was answered at the stage-03 invocation: **"yes override it."**

Taken as: implement the permanent edge, and record the divergence the design's
recommended way — **option (a), a comment at the `border-b`**. A DS v3
CHANGELOG amendment (option b) is **not** part of this branch; it is raised at
the next DesignSync re-sync. Step 3 owns the comment.

The design doc itself is left as committed — stage outputs are read as the
human left them, so the resolution lives here rather than as an edit upstream.

## Scope guard

Every step below stays inside the brief. Nothing touches the sidebar,
`workspace-provider.tsx`, `header-greeting.tsx`, any page component, the
`--border-hairline` token, or `nav.ts`'s existing labels and routes. The
`/dashboard/settings/subscription` crumb gap the design noticed is **not** in
this plan — it is a separate branch per the branch-scope rule.

---

## Step 1 — the destination predicate, with its spec

**Files**
- `src/lib/dashboard/nav.ts` (edit)
- `tests/header-slot.spec.ts` (new)

**Change**

Add `DESTINATIONS` (a module-level const spreading `PERSONAL_NAV`, `TEAM_NAV`,
`PERSONAL_BOTTOM`, `TEAM_BOTTOM` — deliberately *not* `ALL_LINKS`, which folds
in `UNLISTED`) and `export function isDestination(pathname: string): boolean`,
an **exact** href match. Place both with `activeHref` / `navLabel`, the file's
other path-question functions.

Both need the comments the design drafted: why `UNLISTED` is excluded
(`team/upload` is named so a crumb can say "Upload video", but it is a step
inside a flow), and why duplicate hrefs across the four arrays are left alone
(`some()` short-circuits; de-duplicating would couple two menus `nav.ts` keeps
separate on purpose).

Then the spec, in the shape every file in `tests/` already takes — import the
function, assert, no rendering:

- every `PERSONAL_NAV` and `TEAM_NAV` href is a destination
- `/dashboard/settings` and `/dashboard/help` are destinations
- `/dashboard/team/upload` is **not** — the `UNLISTED` guard, and the case that
  regresses silently if someone later reaches for `ALL_LINKS`
- `/dashboard/matches/new`, `/dashboard/matches/abc123`,
  `/dashboard/team/schedule/new/dual`, `/dashboard/settings/usage`,
  `/dashboard/opponents/p1/pl2` are not
- `/dashboard/matches/` (trailing slash) and `/dashboard/match` are not —
  proves exact match, not `startsWith`
- an unrecognised path is not

**Verification**

`npm test` green (the new spec passes), `npm run lint` and `npm run build`
clean. Nothing consumes `isDestination` yet, so **no dashboard behaviour
changes in this step** — that is the point: it lands testable and inert.

---

## Step 2 — the header's slot rule

**Files**
- `src/app/dashboard/header.tsx` (edit)

**Change**

Delete the `WORKSPACE_TITLE_PATHS` `Set` and swap the predicate:

```
const title =
  !showGreeting && isDestination(pathname) ? workspaceTitle(active, viewer) : null;
```

`showGreeting` keeps its precedence, so Pa2's personal-Home greeting is
untouched.

Replace — not delete — the ~35-line block comment above it. The current one
justifies an allowlist that is going away; the new one states the rule (*a
destination already lights its rail row and names itself in its body, so the
slot's one useful fact is the workspace; a position inside a flow has a path
worth tracing and nothing else showing it*) and keeps the pointers to rounds
9g / 1a–1g and Platform Audit Pa2 — that history is why the greeting exception
exists, and the next reader will need it.

**Verification**

`npm run lint` + `npm run build` clean. Then, with the dev server up, the two
rail walks — full detail in Step 4; this step is not done until they are seen.
The single highest-value check: **`/dashboard/statistics` shows the workspace
where it used to show a "Statistics" crumb, and `/dashboard/matches/[matchId]`
still shows its three-part trail.** One page from each side of the boundary.

**Depends on Step 1** — `isDestination` must exist.

---

## Step 3 — the header's bottom edge

**Files**
- `src/app/dashboard/header.tsx` (edit)

**Change**

Collapse the two-state border to one always-drawn value:

```
border-b border-[var(--border-medium)]
```

`h-11`, `shrink-0`, `px-6`, `sticky top-0 z-30` all stay — each is load-bearing
per Platform Audit. `transition-colors duration-200` goes with the state it
animated.

Then delete what that makes dead: `scrolled` / `setScrolled`, `handleScroll`,
the `useEffect` binding and unbinding the parent scroll listener, `headerRef`,
and the `ref={headerRef}` attribute. `useRef` and `useCallback` have no other
consumer in the file — narrow the React import to `useState, useEffect`.

Add the divergence comment (the decision above): the resting edge is permanent
by product call, DS v3 specifies `border-transparent` here and treats `#EBEBEB`
as a scroll indicator, and that indicator is deliberately dropped rather than
overlooked. Name the DS section so the next reader can find what was overruled.

**Verification**

`npm run lint` + `npm run build` clean — the build is what catches a missed
reference to a deleted symbol. Visually: on an **unscrolled** dashboard page
the bottom edge is visible, and scrolling does not change it. Confirm no
console error from the removed listener on a page that scrolls (Matches) and
one that does not (Ask).

**Independent of Steps 1–2** — different lines, different defect. It can run
before them if the queue reorders; it must not be folded into Step 2, because
the two are separately revertable and the brief says either could ship alone.

---

## Step 4 — visual verification across both workspaces

**Files** — none.

**Change** — none. This is the gate for brief criteria 1–5, which no automated
check in this repo reaches.

Run the dev server (`npm run dev`) on **port 3000 or 3101** — the worktree is
already bootstrapped with `node_modules` and `.env.local`. Other ports fail
Azure CORS on upload paths only, so any port works for this change; 3000/3101
just avoids a confusing unrelated error if an upload page is opened.

There is **no checked-in screenshot harness** — `scripts/` has only the two
seed scripts, and past dashboard screenshotting on this repo used throwaway
session-local setups. Verification here is a logged-in walk, by eye.

**Walk 1 — personal workspace.** Home → Matches → Statistics → Ask.
Expect: greeting on Home; workspace title ("Personal" + viewer name) on the
other three. Previously Statistics and Ask showed crumbs.

**Walk 2 — team workspace.** Team Home → Schedule → Matches → Roster →
Opponents → Statistics → Ask. Expect: the program name on all seven.

**Walk 3 — flows are unchanged.** A match detail page (three-part trail),
`/dashboard/matches/new` ("Matches › New match"), a schedule create screen
("Schedule › New dual"), `/dashboard/settings/usage` ("Settings › Usage").

**Walk 4 — criterion 4.** On each page that moved to the title treatment, the
body still names itself. All six were audited in design (Statistics, Ask and
Opponents via `ComingSoonPage`; Help, Roster and Schedule with their own
`text-display` h1) — this confirms the audit against what actually renders.

**Walk 5 — the edge.** Any page, unscrolled: bottom edge visible. Scroll:
unchanged. A short page that cannot scroll at all (Ask) still has its edge —
this is the case the old behaviour never drew.

**Verification** — all five walks pass, then the full gate set below.

**Depends on Steps 2 and 3.**

---

## Test strategy

**Automated — what the repo can actually check.**

The only new automated coverage is `tests/header-slot.spec.ts`, and that is
deliberate. Every spec in `tests/` is a pure-function test run under
Playwright's runner; none render a component or drive a browser session, and
this change introduces no data, no I/O and no async behaviour worth a
component test. The predicate is where the logic lives, so the predicate is
what gets a spec — the header's job is one boolean call.

`isDestination` is exported and pure precisely so this is possible. Had it
stayed a `Set` inside `header.tsx` (design approach A1), the rule would only
have been reachable through a client component that calls `usePathname`,
`useWorkspace` and Supabase — untestable in this repo's style, which is the
main reason A2 won.

**Gates, run after every step:**

```
npm run lint
npm run build
npm test
```

`npm run map` is **not** needed — no route is added or removed, so the
generated table in `MAP.md` cannot go stale.

**Manual — what the gates cannot reach.** Brief criteria 1–5 are all "does the
right thing appear on the right page", and criterion 5 ("visible at normal
viewing distance") is a judgment made with eyes. Step 4's five walks are the
test. Criterion 5 is also the one open question the design could not close:
if `#E5E5EA` (1.26:1 on white) still reads as absent, the fix is a **new
token**, not a bare hex in the header — and that is a change of value only,
not of structure, so it does not invalidate any step above.

**Regression risk, and where it would show.** The realistic failure is a page
that gains the title treatment but has no body title — leaving nothing on
screen naming it. Design audited all six candidates and Step 4 Walk 4
re-confirms them. The second, smaller risk is the build catching a stale
reference to a symbol Step 3 deletes; `npm run build` is the check, and it
runs before the visual walk.

**Guardrails.** `docs/ui-revamp-guardrails.md` §3.5 lists navigation as safe to
redesign freely. No step touches the upload wizard's five vendor fields, the
three analysis-status predicates, the match-detail short-circuit, or the
deletion path — so the pipeline invariants are not in play and no
`splitstep-*` spec is affected.

---

## Order

```
Step 1 (nav.ts + spec)  ──►  Step 2 (slot rule) ──┐
                                                   ├──►  Step 4 (visual walks)
Step 3 (hairline)  ────────────────────────────────┘
```

Step 3 has no dependency on 1 or 2 and may run first. Steps 2 and 3 both edit
`header.tsx` and must not run concurrently.

## Also consulted

Beyond this stage's declared inputs (`02_design/output/design.md`,
`01_brief/output/brief.md`):

- `scripts/` listing — confirms no checked-in screenshot or preview harness,
  so Step 4 is a by-eye walk rather than a scripted capture
- worktree `node_modules` / `.env.local` presence — confirms `npm run dev` is
  runnable here without a bootstrap step
