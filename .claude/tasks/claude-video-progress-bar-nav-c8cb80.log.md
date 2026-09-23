# Run log — claude/video-progress-bar-nav-c8cb80

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Seek-preview geometry, lane-lift gradient and seek coalescer as pure helpers — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** New `film/film-seek-preview.ts`: the design's numbers as constants (`PREVIEW_FRAME` report 160×90 / room 256×144, `PREVIEW_OVERHANG_PX` 8/0, `PREVIEW_PAD_PX` 4, `PREVIEW_HANG_PX` 6, `PREVIEW_REST_MS` 150, `PREVIEW_FADE_MS` 200, `PREVIEW_SEEK_INTERVAL_MS` 120), `previewBoxWidth`, `previewLeft` (clamped box edge; normalises `-0` for the room's zero overhang), `laneFraction` (same arithmetic as `FilmTrack.seekFromPointer`, 0 on a zero-width lane), `trackRunGradient` (the existing `--film-t` split plus a `--film-hover` lift band at 0.34), and `createSeekCoalescer` (one seek in flight, single latest wanted time, interval timer and `landed()` converge on one flush). New node-only `tests/film-seek-preview.spec.ts`, 18 cases. `film-timeline.ts`, `film-track.tsx` untouched.

**follow-ups:**

1. The burst test's exact seek count depends on how a same-millisecond request and the interval timer interleave on the synthetic clock; re-check the bound once T2 drives it from real pointer events.
2. `cancel()` keeps `lastIssueAt`, so a request right after a cancel still waits out the last issued seek's interval. Confirm that is the wanted feel on hover-leave-hover in T2.
