# Design — schedule-breadcrumb-header

## What is actually happening (trace result)

Every `/dashboard/team/schedule/**` page renders under the dashboard shell
header (`src/app/dashboard/header.tsx`), whose breadcrumb resolves the path
via longest-prefix match to the single crumb **"Schedule"** (`navLabel` in
`src/lib/dashboard/nav.ts`).

The create screens and event pages then draw a **second** 44px crumb bar of
their own via the shared frame `src/components/dashboard/schedule/event-shell.tsx`
("Schedule › New event", "Schedule › vs Ash", …). Two breadcrumb rows, one
above the other — the "redundant header" in the brief. Call sites:

| Component | Route | Bar shows |
|---|---|---|
| `new-event-chooser.tsx` | `/new` | Schedule › New event |
| `dual-form.tsx` + `school-search.tsx` | `/new/dual` | Schedule › New dual |
| `tournament-form.tsx` | `/new/tournament` | Schedule › New tournament |
| `dual-detail.tsx` | `/[eventId]` | Schedule › vs {name} · note |
| `tournament-detail.tsx` | `/[eventId]` | Schedule › {name} · note |
| `single-detail.tsx` | `/single/[matchId]` | Schedule › {matchup} |

`/new/single` renders the match wizard, which draws no crumb bar of its own —
only the shell header's "Schedule" shows there today.

Brief's open questions, answered: (1) the duplicate appears the moment any
create screen opens *and* stays on the event page after saving — it is the
shared frame, not a save artifact. (2) The shell header is the real one;
the only thing living exclusively in the redundant bar is the right-aligned
`note` ("Created just now"), which must relocate.

## Approaches considered

**A. Move the trail into the shell header; delete EventShell's crumb bar.**
Matches the app's own precedent: `/dashboard/matches/new` already renders
"Matches › New match" in the shell header via a special case in
`getStaticBreadcrumbs`. One breadcrumb system everywhere. **Recommended.**

**B. Keep EventShell's bar; suppress the shell header crumb on schedule
subroutes.** Rejected: inverts the convention every other dashboard page
follows (the header owns navigation), and keeps two crumb systems alive.

**C. Strip the bar from create screens only; keep it on event pages.**
Rejected: the duplication is identical on event pages, and a sometimes-bar
in a shared frame is worse than either consistent answer.

## Chosen design (A)

The brief's non-goal escape clause applies and is hereby called out: the fix
necessarily lives in the shared `EventShell`, so the event *detail* pages
change too, not just the create flow.

### 1. Shell header — `src/app/dashboard/header.tsx`

Extend `getStaticBreadcrumbs` with the schedule subtree, mirroring the
existing `/dashboard/matches/new` special case:

- `/dashboard/team/schedule/new` → `[Schedule↗, "New event"]`
- `/dashboard/team/schedule/new/dual` → `[Schedule↗, "New dual"]`
- `/dashboard/team/schedule/new/tournament` → `[Schedule↗, "New tournament"]`
- `/dashboard/team/schedule/new/single` → `[Schedule↗, "New single"]`
- any other path strictly under `/dashboard/team/schedule/` (event pages,
  `single/[matchId]`) → `[Schedule↗]` — a *linked* crumb back to the
  schedule; the page's identity stays with the body `<h1>` those pages
  already render (same philosophy as `WORKSPACE_TITLE_PATHS`: the crumb slot
  does not restate what the body says in display type)
- `/dashboard/team/schedule` itself: unchanged.

`Schedule↗` = `{ label: "Schedule", href: "/dashboard/team/schedule" }`.
Static labels only — no dynamic event-name fetch in the header (that is what
the body h1 is for; avoids replicating the `MatchCrumb` machinery).

### 2. The frame — `src/components/dashboard/schedule/event-shell.tsx`

Remove the 44px crumb bar and the `crumb`, `trail`, and `note` props.
EventShell keeps what the create forms actually share: the scroll body
(`flush` behavior included) and the commit footer. Update its doc comment.

### 3. Call sites

- `new-event-chooser`, `dual-form`, `tournament-form`, `school-search`,
  `single-detail`: drop the removed props; nothing else changes.
- `dual-detail`, `tournament-detail`: drop `crumb`/`note`; re-home
  "Created just now" as a right-aligned quiet span on the existing eyebrow
  row (same 11px/ink-500 styling the bar gave it). Behavior unchanged:
  renders only when `createdJustNow`.

### Data flow / error handling

None changed. Purely presentational; no queries, no guardrail seams touched
(the schedule subtree is outside `docs/ui-revamp-guardrails.md` §2–3; the
wizard on `/new/single` is not edited — only the header's label for its path).

### Testing

- `npx tsc --noEmit && npm run lint && npm run build` (expect the known 43
  pre-existing warnings, 0 errors).
- Grep `tests/` for assertions on the removed bar ("New event", "New dual",
  crumb-bar selectors) and update any that assert two trails.
- Preview walk: Schedule → New event → New dual → create → event page.
  Exactly one breadcrumb row (the shell header's) on every step; body h1
  intact on event pages; "Created just now" still appears after creation.

## Open questions

None carried forward.

## Also consulted

Beyond the declared inputs: `src/app/dashboard/team/schedule/{page,new/page,
new/dual/page,new/single/page,new/tournament/page}.tsx`,
`src/app/dashboard/header.tsx`, `src/lib/dashboard/nav.ts`,
`src/components/dashboard/schedule/{event-shell,new-event-chooser,dual-form,
tournament-form,school-search,dual-detail,tournament-detail,single-detail}.tsx`,
`src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx`
(breadcrumb comment only). `.skills/advantage-analytics-design/SKILL.md` was
not loaded in full: the change is subtractive and reuses the header's
existing crumb rendering verbatim — no new visual elements to style.
