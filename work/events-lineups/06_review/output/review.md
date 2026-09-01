# Review — events-lineups

**Sign-off: pending**

Edit that line to `approved` (or annotate otherwise) to open stage 07. That
edit is the pipeline's final gate — nothing below substitutes for it.

Target reviewed: the branch range `e89981a...HEAD`, picked because the working
tree was clean. `e89981a` is the merge-base with `splitstep-integration`, the
integration branch and correct base. 24 commits, 26 source files, ~5,500
insertions / 125 deletions.

`pr-check` receipt: **`6ec2305 ready`**, recorded against a clean tree. An
earlier `d93fc6b ready` receipt exists from twenty seconds before and is
superseded — it was recorded while the review's own fixes were still
uncommitted, which the helper correctly stamped "tree was dirty when
recorded". The clean one is the honest record.

## Success criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | All ten artboards reachable and rendered | **met** |
| 2 | Each screen matches its artboard at 1280px | **met, with one recorded caveat** |
| 3 | Copy matches character for character | **met** |
| 4 | No screen queries or mutates; fixtures only | **met** |
| 5 | The stateful pairs read as one thing | **met** |
| 6 | lint / tsc / build / test | **met** |
| 7 | The PR states what DB-wired behaviour was replaced | **met** |

**1 — reachable and rendered.** Ten artboards across four routes: `7e 7d 7c 4c`
on `/dashboard/team/schedule`, `3b` on `/new`, `2c 2b 2d 2e` on `/new/dual`,
`3c` on `/new/tournament`. Every screen was rendered and measured during its own
task, and T11 walked all ten in one pass. The routes are guarded, so none can be
loaded without a session; every task verified through a temporary unguarded
harness sized to the artboard's content region, deleting it before its gate.

**2 — fidelity at 1280px.** Verified per screen at build time against the
artboard's declared values, then cross-checked as a set by T11. The caveat is
T11's N8 and it cuts the other way from a build defect: at 620px the nine dual
rows **fit** (scrollHeight 513 against clientHeight 481), so `7c`'s stop after
S1–S3 is whitespace in the artboard rather than height clipping. The build
reproduces `7c` faithfully at that height; it is the *drawn* `7c` that is a
state the build cannot produce. Recorded rather than resolved, because the
design is authoritative and this is a question for the designer.

T11 also found eight cross-screen divergences no per-screen check could see.
Three are the design disagreeing with itself — "lines" vs "matches" for the same
nine things (`7d`/`7e`/`2b` vs `7c`/`4c`), a numeral set `mono tabular` on `3b`
and bare Inter on `2b`/`3c`, and slot labels mono on two screens and Inter on
two others. Those are design findings, not build divergences.

**3 — copy.** Pinned by `tests/schedule-static-copy.spec.ts` (17 tests, hand
transcribed from the artboards so the spec is an independent second copy rather
than an assertion that the code equals itself). Codepoints counted by the
reviewing agent: en dash U+2013 ×23, em dash U+2014 ×35, middle dot U+00B7 ×36,
`↵` U+21B5 ×4, and **zero** curly apostrophes — the design's straight U+0027 was
not "upgraded". The spec's ability to fail was proven five times across the run
by mutating a string and watching it break.

**4 — no query, no mutation.** `grep` over the whole `static/` tree and the four
route files for `supabase`, `"use server"` and loader calls returns **zero
matches, exit 1** — run independently at T11 and again here.
`rls-boundary-reviewer` confirmed the mechanism rather than the grep: the one
type-only import that crosses a `"use server"` boundary is erased under
`isolatedModules`, and it grepped every emitted client chunk for the exported
members of `actions.ts` with no hits.

**5 — the stateful pairs.** Both walked end to end by T11. `2d → 2e`: the popup
opens seeded, the saved card highlights, picking resolves the line and fires a
`role="status"` toast that self-clears at 2800ms; Escape reverts and a committed
name survives. `7d → 7c → 4c`: one selection state plus height — at 576 the rows
scroll, at 816 all nine and the footer are visible, and an event with no fixture
detail falls back to the prompt pane.

**6 — gates.** All four green at `6ec2305`: `tsc` clean, `npm run build` green,
`npm test` **244 passed** (227 pre-existing + 17 new), `npm run lint` 0 errors
and **37** warnings.

> **The criterion's "43 baseline" is wrong.** The real figure in this worktree
> is 37, and it held at 37 for the entire run — no task added a warning. The
> stale number appears in four places: this brief, `03_plan/output/plan.md`,
> the queue preamble in `.claude/tasks/claude-new-session-c3f1ab.md`, and
> `docs/ui-revamp-guardrails.md` §7. One correction pass retires it. The
> criterion passes on either reading.

**7 — the PR states the loss.** `work/events-lineups/REGRESSION-NOTE.md` opens
with it: *"Events & Lineups — the schedule area is now static, and that is a
regression … Four routes that read the database now read a fixture file."* It
then names the loss per route against the actual diffs, and carries 50
flagged-copy items grouped by artboard.

## Findings and resolutions

### Fixed

**1 · `opponent-popup.tsx:262` — empty Enter wiped a name and claimed a save.**
From `code-review medium`. Pressing Enter with an empty or whitespace-only draft
and no suggestions fell through to `save(draft)`. `splitNames` drops blank parts,
so that committed `""` — clearing an opponent name the coach had already
entered — while still showing the `2e` toast "Saved to Ridgeline University
roster". Reachable in two keystrokes on a resolved line: reopen, select-all and
delete, Enter.

Harmless today, because `onCommit` only moves local state — but `onCommit` is
exactly the seam the deferred re-wiring turns into a real write, at which point
the same keystrokes clear a stored name and report success. It was also the one
path around a guard the component had already made deliberately: Escape and
outside-click revert rather than commit, for this reason. Now Enter on an empty
draft closes without committing, the same way. Fixed in `6ec2305`.

**2 · `dual-build-step.tsx` — a fifth private `capitalize`.** From `simplify`'s
reuse pass. A private `titleCase()` duplicated the exported `capitalize()` in
`src/lib/utils.ts`, whose own doc comment records consolidating four earlier
private copies. Replaced; the null guard moved to the call site.

**3 · `fixtures.ts` — fixture data shipped to screens that do not use it.**
From `simplify`'s efficiency pass, and the only finding that came with a
measurement. Exports initialized by a *call* (`directorySchool(…)`,
`dualLine(…)`, `tournamentEntry(…)`) cannot be proven side-effect-free, so they
survived into every chunk importing anything from the module — the tournament
screen shipped Fairmont A&M and Alexis Castellano; the schedule screen shipped
the whole school directory for one 38-character string. 22 call sites annotated
`/* @__PURE__ */`.

**Verified by A/B, two builds:** fixture-carrying chunks total **68,949 bytes**
without the annotations and **61,374** with — a **7,575-byte** reduction. Not
total elimination, so some references are genuine; the win is measured rather
than assumed.

**4 · `fixtures.ts` — `TOURNAMENT_DETAIL` looked live and is not.** Nothing
renders it; `3c`'s builder types its five drawn facts as literals because the
copy spec pins them in that file's own source, so editing the fixture moves
nothing on screen. The reviewing agent proposed deleting it. **Not deleted** —
it is the `EventDetail` shape the re-wiring hands back, and three comments
reference it. Documented instead, at the point someone would edit it.

### Consciously left

**Markup extraction across the fidelity screens.** `simplify` found real
duplication: `FieldCell` declared verbatim in two builders, a ruled section
heading likewise, a footer action bar hand-rolled three times (two
byte-identical), and a two-line name+subline block in three files. All genuine.
**Left, deliberately.** The copy spec pins strings; nothing pins spacing or
markup. Extracting shared JSX across nine screens whose every rendered byte was
verified against an artboard trades a maintainability gain for a fidelity risk
no gate here would catch. These are re-wire-time work, when the screens change
anyway.

**`useListboxNav` exists and `opponent-popup.tsx` hand-rolled it.**
`src/hooks/use-listbox-nav.ts` names "the schedule's opponent typeahead" as an
intended consumer, and the hand-roll has already drifted in the three ways the
hook's comment predicts: no Home/End, arrows clamp where the hook wraps, and no
`aria-activedescendant` — so a screen reader is never told which card is
highlighted. **This is the most valuable thing left undone**, and the a11y half
is arguably a defect rather than a cleanup. Left because adopting it changes
keyboard behaviour on a screen that just passed its gate, which wants its own
task and its own verification rather than a merge-gate edit.

**A link helper beside `advButton()`.** The blue link treatment is written
eleven times across the directory at three sizes, already disagreeing about
hover transitions and focus rings; three of those copies are new here. No
existing helper to call — it is a new-helper proposal touching eight files
outside this range. Out of scope for a merge gate.

**Three altitude findings about the re-wire seam.** The reviewer argued the
three known traps should be *type errors* rather than comments: make the rail
marks a required prop, make `school` a required prop of `DualBuildStep` passing
`RAIL_SCHOOLS[0]` unconditionally, and collapse the popup's three loose school
props into one `opponent` object so a school cannot be swapped without its
roster. All three are good, and all three change component APIs that just passed
their gates. Recorded here and in §4 of the regression note; they belong to the
re-wiring task, which is where they pay off.

**`LineupLine` lives in a component file.** `src/lib/schedule/fixtures.ts`
type-imports it from `lineup-editor.tsx`, inverting `lib/` → `components/` for a
domain type. That single edge is what forces the README's whole "type-only
lifeline" section, the `PARTLY DORMANT` labels and two `DO NOT DELETE` headers.
Moving it to `src/lib/schedule/types.ts` would delete all of that. Left because
it touches dormant files and the README, and is cleanest done when the dormant
tree is removed.

**`programs-server.ts` is server-only by name alone.** Noted by
`rls-boundary-reviewer`, not as a finding: the module carries no server-only
code today — its helpers are pure and its only Supabase reference is a type
import — so client components importing it is safe. But nothing *stops* a future
edit adding a real `createClient()` there, which would silently become a
client-bundle leak. Worth a lint rule or a split, in its own change.

## Reviewer coverage

| Reviewer | Result |
|---|---|
| `lint` / `tsc` / `test` / `build` | pass — 0 errors, 37 warnings, 244 tests, build green |
| `simplify` (4 parallel agents) | 20 findings; 3 applied, the rest consciously left above |
| `vercel-react-best-practices` | Triggers fired (8 `"use client"` added, 9 new components, `useEffect` added). Its checks were covered inside `simplify`'s efficiency agent, which measured the client bundles directly and confirmed all eight `"use client"` files genuinely need to be client modules. |
| `code-review medium` | 1 finding, fixed |
| `pipeline-guardrails-reviewer` | **no findings** over the whole range — `adScoring` agrees across all four encodings, permission gating intact on all four routes, score/side/forfeit/doubles attribution correct |
| `rls-boundary-reviewer` | **no findings** — and it verified that the twelve per-task skips were themselves justified, by mechanism rather than by the build passing |
| `supabase:supabase-postgres-best-practices` | skipped — no SQL, migration or schema change in the range |

`pr-check`'s task-gated test reports eight `pipeline(...)` commits with
non-`T<n>` subjects, which is fail-closed. I verified each touches **zero** files
under `src/` or `tests/` — they are workspace markdown and queue files — so the
source in this range really is all task-gated, ten `pipeline-guardrails-reviewer`
runs deep. I ran both project reviewers over the whole range anyway rather than
reason my way out of the rule: at a merge gate a second net over the *union* can
see interactions no per-task run could.

## Also consulted

Beyond the declared inputs (`../05_build/output/build.md`, the range diff,
`../01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `work/events-lineups/FIDELITY-PASS.md` and `REGRESSION-NOTE.md` — to check
  criteria 2, 5 and 7 against what the run actually recorded.
- `.claude/tasks/claude-new-session-c3f1ab.log.md` — per-task gate results, to
  establish reviewer coverage rather than assert it.
- `src/components/dashboard/schedule/README.md` — the live / dormant map.
- `src/lib/schedule/format.ts`, `src/lib/utils.ts`, `src/hooks/use-listbox-nav.ts`,
  `src/lib/data/programs-server.ts` — to verify specific findings.
- `.claude/hooks/pr-check-receipt.sh` — to record and read back the receipt.
