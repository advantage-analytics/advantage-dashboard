# Run log — claude/video-progress-bar-nav-c8cb80

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Seek-preview geometry, lane-lift gradient and seek coalescer as pure helpers — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** New `film/film-seek-preview.ts`: the design's numbers as constants (`PREVIEW_FRAME` report 160×90 / room 256×144, `PREVIEW_OVERHANG_PX` 8/0, `PREVIEW_PAD_PX` 4, `PREVIEW_HANG_PX` 6, `PREVIEW_REST_MS` 150, `PREVIEW_FADE_MS` 200, `PREVIEW_SEEK_INTERVAL_MS` 120), `previewBoxWidth`, `previewLeft` (clamped box edge; normalises `-0` for the room's zero overhang), `laneFraction` (same arithmetic as `FilmTrack.seekFromPointer`, 0 on a zero-width lane), `trackRunGradient` (the existing `--film-t` split plus a `--film-hover` lift band at 0.34), and `createSeekCoalescer` (one seek in flight, single latest wanted time, interval timer and `landed()` converge on one flush). New node-only `tests/film-seek-preview.spec.ts`, 18 cases. `film-timeline.ts`, `film-track.tsx` untouched.

**follow-ups:**

1. The burst test's exact seek count depends on how a same-millisecond request and the interval timer interleave on the synthetic clock; re-check the bound once T2 drives it from real pointer events.
2. `cancel()` keeps `lastIssueAt`, so a request right after a cancel still waits out the last issued seek's interval. Confirm that is the wanted feel on hover-leave-hover in T2.

## T2 · Hover frame preview on the report player's lane — blocked

**gate:** mechanical pass · completion `VERDICT: needs-work`

**reason:** Criterion 1 says the string `crossOrigin`/`crossorigin` appears nowhere in the diff. The new `use-seek-preview.ts` has it in its own JSDoc at line 38 ("`crossOrigin` — playback never consults CORS …"). Every other criterion was met, including the reviewer accepting three disclosed deviations: case (f) awaits `cred=1` (the harness's `ok-*` scenario only refreshes once), the `<video>` JSX lives in `film-track.tsx` because the React-compiler lint rule rejects JSX built in the hook, and the docs sentence says "cross-origin attribute".

**stash:** `807069006b04a736deba4ede9c8755aafe7d02d8` (`blocked: T2`) — `git stash apply 807069006b04a736deba4ede9c8755aafe7d02d8`, reword the JSDoc at `use-seek-preview.ts:38` to "cross-origin attribute", re-gate.

**follow-ups:**

1. The 150 ms rest applies on every hover entry from closed, not only the first, so a pointer crossing the lane to reach the buttons does not flash the box; a scrub opens at once. Confirm that is wanted.
2. The hover marker is an unpainted span (`data-testid="film-seek-hover-marker"`) until T3.

## T2 · Hover frame preview on the report player's lane — done

**gate:** mechanical: lint pass, typecheck pass, full suite pass except `tests/match-video-attachments-db.spec.ts` (live shared database; the failing case differed on each of three runs, once expecting 50 rows and receiving 42; T2 touches no database code); committed past it on the author's explicit decision · completion `VERDICT: pass` (re-review after the fix)

**changed:** Stash `807069006b04a736deba4ede9c8755aafe7d02d8` applied; the one blocking line fixed by rewording `use-seek-preview.ts:38` to "cross-origin attribute". New `film/use-seek-preview.ts`: the preview element's props, lazy mount on first hover or scrub, coalesced seeks via T1's `createSeekCoalescer`, a pre-metadata hold, and `empty | held | live` state. `film-track.tsx`: optional `preview` prop, the box, frame and time markup, `--film-hover` / `--film-hover-x` / `data-film-hover` written without React state, runs painted by `trackRunGradient`, a 1×9 marker. `film-player.tsx`: `preview={{ url, generation, size: "report" }}`. `tests/film-playback-refresh.spec.ts`: cases T2 (a)–(f). `docs/match-video-attachments.md`: one sentence. Reviewer-accepted deviations: (f) awaits `cred=1` (the harness refreshes once), the `<video>` JSX renders in `film-track.tsx` (React-compiler lint rejects JSX in the hook).

**follow-ups:**

1. The 150 ms rest applies on every hover entry from closed, so a pointer crossing the lane to reach the buttons does not flash the box; a scrub opens at once. Author to confirm.
2. `match-video-attachments-db.spec.ts` flakes on the shared live database in more cases than the known "50 rows per claim" one; fix on its own branch.
