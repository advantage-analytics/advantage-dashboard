# Plan — schedule-breadcrumb-header

Three steps, ordered. Steps 1 and 2 are independent at compile time but land
in this order so no intermediate commit leaves a create screen with no trail
at all. Step 2 is deliberately one step: removing `EventShell`'s props breaks
every caller, so the shell and its seven call sites must change atomically.

## Step 1 — Shell header learns the schedule subtree

- **Files:** `src/app/dashboard/header.tsx`
- **Change:** extend `getStaticBreadcrumbs` (next to the existing
  `/dashboard/matches/new` special case) with:
  - exact matches, each led by `{ label: "Schedule", href: "/dashboard/team/schedule" }`:
    `/dashboard/team/schedule/new` → "New event" ·
    `/new/dual` → "New dual" · `/new/tournament` → "New tournament" ·
    `/new/single` → "New single"
  - any *other* path strictly under `/dashboard/team/schedule/` → the linked
    Schedule crumb alone (event pages own their identity via the body h1)
  - `/dashboard/team/schedule` itself: untouched (falls through to `navLabel`)
  - keep the comment style of the surrounding code: note *why* event pages
    get no leaf (WORKSPACE_TITLE_PATHS philosophy)
- **Not in this step:** no component edits; the wizard on `/new/single` is
  not touched — only the header's label for that path.
- **Verify:** `npx tsc --noEmit`; read the function once against the six
  route shapes in the design's trace table.

## Step 2 — Remove the redundant bar from EventShell and its callers

- **Files:** `src/components/dashboard/schedule/event-shell.tsx`,
  `new-event-chooser.tsx`, `dual-form.tsx`, `tournament-form.tsx`,
  `school-search.tsx`, `single-detail.tsx`, `dual-detail.tsx`,
  `tournament-detail.tsx` (all in `src/components/dashboard/schedule/`)
- **Change:**
  - `event-shell.tsx`: delete the 44px crumb-bar block and the `crumb`,
    `trail`, `note` props (and the now-unused `Link`/`ChevronRight` imports);
    keep the body (`flush` included) and footer; rewrite the doc comment to
    describe what remains and why the bar left (breadcrumbs live in the
    dashboard shell header).
  - five callers drop the removed props, nothing else.
  - `dual-detail.tsx` / `tournament-detail.tsx`: also re-home
    `createdJustNow` — a right-aligned `text-[11px] text-[var(--ink-500)]`
    span on the existing eyebrow row (flex the row, spacer between), shown
    under the same condition as before.
- **Verify:** `npx tsc --noEmit && npm run lint` — plus a grep that no
  `crumb=`/`trail=`/`note=` prop remains on any `<EventShell`.

## Step 3 — Gates and browser proof

- **Files:** none expected (`tests/` grep found no assertions on the bar;
  fix any straggler the suite reveals)
- **Change:** run the full gate: `npx tsc --noEmit && npm run lint &&
  npm run build` (expect the known 43 pre-existing warnings, 0 errors), then
  `npm run test`. Then the preview walk from the design: Schedule → New
  event → New dual → event page — exactly one breadcrumb row per screen,
  body h1 intact, "Created just now" visible after creation.
- **Verify:** all gates green; screenshot or read_page evidence of the
  single trail on `/new` and on an event page.

## Test strategy

No new specs: the change removes presentation and adds static crumb labels,
both below the granularity the Playwright suite asserts. The existing suite
plus the build gate is the regression net; the preview walk is the
behavioral proof the brief's success criteria ask for.
