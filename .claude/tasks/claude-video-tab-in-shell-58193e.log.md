# Run log — claude/video-tab-in-shell-58193e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Extract the film filter model to filters/types.ts and add cut helpers — done

**gate:** mechanical pass; completion review pass
**changed:** Moved the film filter model into `film/filters/types.ts` (no React import) and re-exported every name from `film-filters.tsx`. Added `cutName`, `countFilmOption`, `parseCut` and `serializeCut`, and the `counts` memo now calls `countFilmOption`. New `tests/film-filters-model.spec.ts` covers the cut names, a count that drops with a second axis, the URL round trip and the advanced-only case. A cut with both a show label and a server reads "Break points · Reid serving", which the task left open. Code landed in 04f22565; this entry and the status were recorded one commit later.
