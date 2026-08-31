## T1 · Schedule subtree breadcrumbs in the shell header
- **status:** todo
- **files:** src/app/dashboard/header.tsx
- **done when:**
  - [ ] `getStaticBreadcrumbs` returns a linked Schedule crumb (`href: /dashboard/team/schedule`) plus leaf "New event" / "New dual" / "New tournament" / "New single" for `/dashboard/team/schedule/new`, `/new/dual`, `/new/tournament`, `/new/single` respectively
  - [ ] Any other path strictly under `/dashboard/team/schedule/` returns the linked Schedule crumb alone
  - [ ] `/dashboard/team/schedule` itself is unchanged (falls through to `navLabel`)
  - [ ] `npx tsc --noEmit` passes
- **notes:** Mirror the existing `/dashboard/matches/new` special case, placed
  beside it. Comment why event pages get no leaf crumb (the body h1 owns the
  page's identity — same philosophy as `WORKSPACE_TITLE_PATHS`). Design:
  work/schedule-breadcrumb-header/02_design/output/design.md §1.

## T2 · Remove EventShell's crumb bar, atomically with its callers
- **status:** todo
- **files:** src/components/dashboard/schedule/event-shell.tsx, new-event-chooser.tsx, dual-form.tsx, tournament-form.tsx, school-search.tsx, single-detail.tsx, dual-detail.tsx, tournament-detail.tsx (same dir)
- **done when:**
  - [ ] `event-shell.tsx` renders no crumb bar; `crumb`, `trail`, `note` props gone; now-unused imports gone; doc comment describes the remaining body+footer frame and says breadcrumbs live in the dashboard shell header
  - [ ] `grep -rn 'crumb=\|trail=\|note=' src/components/dashboard/schedule/` finds no `<EventShell` call-site props
  - [ ] `dual-detail.tsx` and `tournament-detail.tsx` show "Created just now" right-aligned on the eyebrow row (`text-[11px] text-[var(--ink-500)]`), under the same `createdJustNow` condition as before
  - [ ] Body scroll/`flush` and footer behavior unchanged at every call site
  - [ ] `npx tsc --noEmit && npm run lint` pass
- **notes:** Must be one commit — removing the props breaks all seven callers.
  Design §2–3.

## T3 · Gates and single-breadcrumb proof
- **status:** todo
- **files:** none expected; fix any test straggler the suite reveals
- **done when:**
  - [ ] `npx tsc --noEmit && npm run lint && npm run build` green (0 errors; the 43 known pre-existing warnings tolerated)
  - [ ] `npm run test` green
  - [ ] Preview evidence (screenshot or read_page) that `/dashboard/team/schedule/new` and one event page each show exactly one breadcrumb row — or, if no authenticated preview session is available to the runner, that limitation recorded in the task log so the stage-06 human walk covers it
- **notes:** No new specs. Use the ZZ Test Program if creating a throwaway
  event helps; the dev server must run on port 3000 or 3101 (Azure CORS —
  irrelevant to this walk, but the convention stands). Plan: work/schedule-breadcrumb-header/03_plan/output/plan.md step 3.
