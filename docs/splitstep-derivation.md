# Derivation — vendor strokes to points, shots and statistics

**Current state** of everything on the `splitstep-derivation` branch. Read this
before touching `src/lib/services/splitstep/derivation/`, the results webhook, or
anything that averages `match_stats`.

Pairs with [`splitstep-vendor-questions.md`](splitstep-vendor-questions.md),
which holds the measurements and the open questions to the vendor. This document
is the *code*; that one is the *evidence*.

---

## 1. What runs, in order

A vendor delivery arrives at `POST /api/webhooks/splitstep`. The route returns
200 immediately, then does everything else inside `after()`:

```
verify → record delivery → 200
  └─ after():
       storeResults()        results JSON → Supabase `match-results` bucket
       trimmed video copy    vendor's re-encode → our container
       deleteSourceVideo()   frees the Azure Blob original
       gradeResults()        7 quality checks → derivation_confidence
       deriveAndPublish()    ├ status = 'deriving'
                             ├ persistTranscript()   points + shots
                             ├ calculate_match_stats()
                             ├ backfill_returns_in_and_net_points()
                             ├ suppress_derived_match_stats()
                             └ status = 'completed' | 'derivation_failed'
```

**No Edge Function**, contrary to spec §2. That design assumed one because of the
60s Vercel ceiling against an unmeasured workload. Measured: parse + grade is
~3 ms, the whole write is well under 2 s, and `maxDuration = 60` is set
explicitly on the route. A Deno copy would have meant two implementations of the
player mapping and the shot numbering — the two places where a silent divergence
attributes an entire match to the wrong person.

Same sequence is available from the CLI, which calls the same function:

```bash
npx tsx scripts/splitstep-derive.ts --job <uuid>          # dry run, writes nothing
npx tsx scripts/splitstep-derive.ts --job <uuid> --write  # full publish
npx tsx scripts/splitstep-backfill-grades.ts [--force]    # re-grade stored jobs
```

---

## 2. The library

`src/lib/services/splitstep/derivation/` — pure, no I/O, testable against a
fixture and against a real payload with identical output.

| Module | Does |
|---|---|
| `types.ts` | Raw vendor shape vs cleaned shape. The gap between them is the parse layer's whole job |
| `parse.ts` | **The boundary.** Nulls all sentinels and impossible geometry before anything else touches the data |
| `court.ts` | Metre conversion, serve/direction zones, the playing-enclosure bound |
| `rallies.ts` | Groups strokes into rallies, reports malformed numbering |
| `serves.ts` | First/second serve by ordinal; returns **both** readings of every serve stat plus their spread |
| `winners.ts` | Point winners from the score stream. Never from the `in` flag |
| `reconcile.ts` | Folds winners forward, checks against `matches.score`, decides player1 |
| `result-type.ts` | `result_type`, `shots.result`, shot numbering |
| `pressure.ts` | Break / set / match points |
| `flags.ts` | Per-row data-quality flags |
| `quality.ts` | 7 checks → `high`/`medium`/`low` |
| `transcript.ts` | Assembles database-shaped rows |
| `index.ts` | Public surface, `analyzeResults()`, `DERIVATION_VERSION` |

Only `persist-transcript.ts` and `derive-and-publish.ts` (one level up) touch the
database.

---

## 3. Contracts that will silently break things

Each of these was wrong at some point and produced no error.

### Coordinates are METRES, not normalized 0–1

Spec §4.2 says 0–1 and an earlier `metersToNormalized()` implemented it. Both
wrong. `shots.contact_x/y` and `landing_x/y` use the court's own frame:
x metres about the centre line, **y = 0 at one baseline, 11.885 at the net,
23.77 at the other**. So the transform is one offset:

```ts
x_ours = x_vendor
y_ours = y_vendor + 11.885     // metersToCourtFrame()
```

Confirmed twice: `calculate_match_stats` compares `abs(landing_x)` to 2.74/1.37
(the singles half-width in thirds) and computes `23.77 - contact_y`; and live
SwingVision in-serve `landing_y` occupies 5.49–11.87 and 11.93–18.29, the two
service boxes to the centimetre.

**Do not flip y.** `court-visualization.tsx` mirrors far-side landings through
`(-x, 23.77 - y)`, a 180° rotation, so the render is invariant only under a
*simultaneous* x and y flip. Flip y alone and every chart mirrors and the deuce
and ad service boxes swap — while `match_stats` stays numerically identical.

### A faulted serve takes `shot_number` 0

Deciding serve is 1, return is 2. `calculate_match_stats` joins
`serve.shot_number = 1` to `ret.shot_number = 2` with **no** `shot_type` or
`result` filter, so two rows at 1 fan the join out. Live production shows 1,550
returns producing 2,534 joined rows, 170 counted as *both* Crosscourt and Down
the Line. SwingVision itself puts both serves at 1 — do not copy it. `0` is
already this database's convention for pre-point rows (`Feed`).

### Score strings are SERVER-RELATIVE

`pred_point_score`, `pred_game_score` and `pred_set_score` flip every time the
server changes, even though nothing about the match state did. **Absolutize to
`{label: value}` or sort the pair before comparing.** Keying a set on the raw
string splits every game into its own set — set one survives only because "0-0"
happens to be symmetric.

### Never emit a Forced Error string

`'Forehand Forced Error'` matches neither `LIKE '%Winner%'` nor
`LIKE '%Unforced Error%'`, so the point vanishes from every aggregate rather than
landing in the wrong one. `match_stats.forced_errors` is a literal NULL and is
never read. Forced errors fold into the Unforced Error bucket by construction,
which is why the UI relabels it **"Errors"** on a derived match.

### Suppression must be atomic within a COALESCE group

`match_stats_with_percentages` computes each placement member's percentage over
`COALESCE(a,0)+COALESCE(b,0)+COALESCE(c,0)`. Nulling one member of a triple
silently drops it from its siblings' denominator and **inflates them**. The three
triples are serve wide/body/T, return direction, and return contact.

### Order: stats → backfill → suppress

`backfill_returns_in_and_net_points` rewrites `first_returns_in` and
`second_returns_in` with **no provider guard**. Suppressing before it runs
silently un-suppresses two columns built entirely on phantom return strokes.

---

## 4. Trust tiers

| Tier | Stats | Treatment |
|---|---|---|
| **Reliable** | points/games won, service & return games, break points, set points, first/second serve counts | Plain number |
| **Approximate** | winners, errors, FH/BH breakdown, volley winners, serve placement | Prefixed **≈**, ~85–90% point-attribution accuracy |
| **Unknowable** | aces, double faults, service winners, rally length, whole return family | **Em dash, never 0** |

Aces cannot be separated from service winners — nothing records an
attempted-and-missed swing, so a missed return is not a stroke. The rest are
contaminated by the vendor recording ~10 points per 100 that ended on the serve
as multi-stroke rallies (measured unreturned-serve rate 1.9% / 3.5% / 6.0%
against a real-tennis floor near 15%). That is a **vendor defect**, not something
derivation can correct.

`suppress_derived_match_stats(match_id)` enforces it, scoped to
`source_provider = 'splitstep'`.

**Absence must survive to the render.** `?? 0` on a stat path is a bug: it turns
"we did not measure this" into "the player did none of this". Two layers had it —
the aggregate readers and the single-match reader — and both are fixed.
`src/lib/data/aggregate.ts` holds the rule: absent is *excluded* from a mean, and
a mean over nothing is null.

---

## 5. Gates

**Gate 1 — before any row is written.** The fold of derived point winners must
reproduce `matches.score` **exactly**. Spec §4.4's "off by ≤1 game is medium" is
rejected: these rows are the point-by-point timeline and the video seek targets,
so a wrong point is a specific false claim on a screen. Player1 is decided by the
fold, **never by string-matching `pred_player_id`** against `matches.player1_name`
— vendor labels are free text and have been observed misspelled.

**Gate 2 — per stat family**, not a single grade. `derivation_confidence` is
advisory: the one match with ground truth grades `low` yet reproduces its score
exactly.

Of three real payloads, **only one passes Gate 1**. Ad-scoring matches and match
tiebreaks are refused by design.

---

## 6. UI

New analysis state **`timeline`** ("Timeline ready") between "still working" and
"here are your numbers" — renders point-level sections, withholds aggregates.
Resolved by `withStatsPublished()`, deliberately kept out of
`resolveAnalysisStatus()`: that function projects a `processing_jobs` row and the
realtime hook calls it over a websocket with no access to `match_stats`.

`derivation_version` means **"the engine produced rows"**, and
`resolveAnalysisStatus()` reads a `completed` job with a non-null version as
"Analyzed". Do not set it from anything that does not write rows — grading did,
once, and made a match claim to be analysed with zero points.

---

## 7. Verified / not verified

**Verified end to end** on match `0db449ab` (Revelli vs Stepanov, true score
6-4 6-4): fold reproduces the score exactly and names player1 with no string
matching; 114 points / 596 shots; break points reconcile independently (holds +
breaks = the folded 12-8, set points converted = sets won); suppression and the
em-dash render confirmed in the browser; serve placement plots into real zones.

**Not verified:** ad-scoring matches, match tiebreaks, a left-handed player (the
handedness inference validated on two known right-handers only), and any payload
other than the three analysed.

---

## 8. Left to do

- **Reprocessing.** When `DERIVATION_VERSION` bumps, every stored match needs
  rebuilding and no webhook will fire. Wants a paged cron route following
  `src/app/api/cron/reclaim-videos`, calling `deriveAndPublish()` — not a second
  implementation.
- **Cross-provider display.** No aggregate reader filters by provider. Nulls no
  longer corrupt the means, but approximate winners/errors still reach
  `/dashboard/statistics` unmarked.
- **`?? 0` on three ratings** in `statistics-server.ts` / `statistics-client.ts`
  — only bites a player whose every match is derived.
- **Key Moments prose** is copied from the match record and may describe
  different data than the derived points.
- Pre-existing, unrelated: `permission denied for function reap_stalled_uploads`
  fires on every match-analysis load.
