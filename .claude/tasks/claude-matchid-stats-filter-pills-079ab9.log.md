# Run log — claude/matchid-stats-filter-pills-079ab9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Land a statistic's cut into the shared filters so the drawer's pills are pressed — done

- **gate:** mechanical GATE PASS (after `npm ci` — the worktree's `node_modules` predated the `pglite`/`pg` devDependencies; not a task failure) · completion VERDICT: pass
- **changed:** `landFilmCut(shared, intent)` now returns `{ shared, remainder }` — the cut's `MatchFilters` keys replace the shared filters key by key, and only the `FilmCutExtras` (`rallyMin`/`rallyMax`/`ending`) + label survive as a Film-only remainder (`null` for a pure cut). The remainder lives in `MatchFiltersProvider` (`filmRemainder`/`setFilmRemainder`), above the view switch; `FilmRoom` keeps only `savedOnly`. `clearAll` clears all three. The list is shared ∧ `matchesFilmCutExtras` ∧ saved; the strip sentence adds "<label>, from Statistics" only while extras are in force; "Back to all points" only while the shared set still equals `remainder.landed` (and saved is off). New offline spec renders the real `FiltersPanel` on a landed "1st serve points won" cut and asserts exactly five pressed pills — Serve › Player, Serve › Type "First serve", Return › Player {opp} (the inverted `server` pill, a correction to the criterion's four), Result › Player, Result › Outcome "Won". `film-advanced-panel.tsx` adjusted to the new `FilmListFilters` shape; `match-report-context.tsx` doc comment only.
- **follow-ups:** 1. A pure cut lands no remainder, so its strip action reads "Clear filter" instead of "Back to all points"; after T6 makes Aces and rally bands pure they lose "Back to all points" too — decide whether a landed snapshot should be kept even with no extras. 2. `tests/match-filters-statistics.spec.ts` stubs `useMatchFilters` without the new `filmRemainder` fields (still passes; the card reads only `context`).

## T2 · Name a Film-only cut inside the filters drawer — done

- **gate:** mechanical GATE PASS · completion VERDICT: pass
- **changed:** `FiltersPanel` takes `filmCut?: string | null`; when set it renders one read-only `text-micro` line (`data-film-cut=""`, no button, no `aria-pressed`) between the header and the sections: "<label> · from Statistics — the strip's Clear removes it". `FilterRailShell` passes `filmRemainder?.label` from `useMatchFilters()`, `FilmAdvancedPanel` passes `remainder?.label` — both null for a pure cut, so no line. Two additive tests in `tests/match-filters-panel.spec.ts` (line text + placement; null/absent draws nothing).
- **follow-ups:** 1. At 340px a long label wraps the line to two rows because the fixed suffix takes most of the width; left wrapping rather than truncating — shorten the suffix (e.g. "from Statistics · Clear in the strip") if a strict single line is wanted. 2. After T6 the only remainder-bearing cuts are Winners and Unforced errors, so this line appears only for those two — the spec's "Short rallies" example label is then a pure cut in practice (the spec still exercises the prop correctly).

## T3 · Relabel Return contact depth and the Custom groups — done

- **gate:** mechanical GATE PASS · completion VERDICT: pass
- **changed:** Labels only. Return › "Contact" → "Contact depth" (note "from the baseline") with values "Inside the baseline" / "On the baseline" / "Deep"; Custom › "Choose player" → "Hit by", "Rally shot" → "Hit" (note "1 = the serve"). `PHRASE.returnContact` now switches on the value ("contact inside the baseline" / "contact on the baseline" / "deep contact"). Keys, stored values, `rc.*` codes, thresholds and predicates untouched; model spec passes without edits. Panel + words-rail specs updated.
- **follow-ups:** 1. Two negative assertions in `tests/match-filters-panel.spec.ts` (`not.toContain(">Rally shot<")`, `not.toContain(">Contact<")`) are now vacuous since those labels no longer exist — retarget them to ">Hit<" / ">Contact depth<" so they guard something again.
