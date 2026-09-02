# Build — eyebrow-text-wrap

Queue drained. Six tasks, six commits, no blocked items and no stashes.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · Add `programEyebrow()` helper to programs-server | sonnet | done | `98ce260` |
| T2 · Add a full-width `heading` slot to `ClaimShell` | sonnet | done | `28c4edf` |
| T3 · Adopt eyebrow helper and heading slot on the unclaimed status screen | sonnet | done | `7e9de02` |
| T4 · Adopt eyebrow helper and heading slot on the setup screen | sonnet | done | `9347ee7` |
| T5 · Add the eyebrow width-budget regression spec | opus | done | `ed45d5d` |
| T6 · Verify the claim eyebrows in the browser and record the result | opus | done | `217b490` |

Nothing was skipped as malformed, nothing waited on an unmet `needs:`, and no
task was picked twice. Per-task gate verdicts and what changed are in
`.claude/tasks/claude-eyebrow-text-wrapping-c359ca.log.md`.

## Commit range

`fd13c75..217b490` — eleven commits, of which five are this pipeline's own
stage commits and six are the tasks above.

```
217b490 T6: Verify the claim eyebrows in the browser and record the result
ed45d5d T5: Add the eyebrow width-budget regression spec
9347ee7 T4: Adopt eyebrow helper and heading slot on the setup screen
7e9de02 T3: Adopt eyebrow helper and heading slot on the unclaimed status screen
28c4edf T2: Add a full-width heading slot to ClaimShell
98ce260 T1: Add programEyebrow() helper to programs-server
4848fa1 pipeline(eyebrow-text-wrap): stage 04 tasks
3b14ba4 pipeline(eyebrow-text-wrap): stage 03 plan
d9bd270 pipeline(eyebrow-text-wrap): stage 02 design
edb629e pipeline(eyebrow-text-wrap): stage 01 brief
edbe1bc pipeline(eyebrow-text-wrap): scaffold workspace
```

Net effect outside the workspace — exactly the five files stage 03 predicted,
and no others:

```
 src/app/claim/[programKey]/page.tsx       |  28 ++++-
 src/app/claim/[programKey]/setup/page.tsx |  26 ++---
 src/components/claim/claim-shell.tsx      |  33 ++++--
 src/lib/data/programs-server.ts           |  24 ++++
 tests/claim-eyebrow-width.spec.ts         | 175 +++++++++++++++++++++++++++
 5 files changed, 257 insertions(+), 29 deletions(-)
```

## Blocked items

None. No task reached stage 6b, so no stash exists and nothing is waiting to be
recovered.

## Gate summary

Every task cleared all applicable stages before its commit. Across the six runs:

- **Mechanical.** Lint clear on all six, `tsc --noEmit` exit 0 on all six, and
  `npm test` green on all six — 301 passing until T5 added three, then 304. The
  stale `.next` route-type false failure documented in `task-next` never fired.
- **Completion review.** Six `VERDICT: pass`, none needing a second attempt.
- **Guardrails.** `rls-boundary-reviewer` ran twice and reported clear both
  times: on T1, which touches `src/lib/data/`, and on T5, which adds a query on
  the service-role client. `pipeline-guardrails-reviewer` ran zero times, which
  is correct — no task touched `src/app/dashboard/`, `src/components/dashboard/`
  or the upload wizard. For T5 and T6, whose deliverables were untracked files,
  surfaces were determined from `git ls-files --others --exclude-standard` as
  well as `git diff HEAD --stat`.

Three reviews did more than confirm the subagent's own account, and are worth
knowing about because each closed a real hole:

- On **T2**, the reviewer checked line by line that the diff's eleven deletions
  were re-indentation from the new wrapper and not an altered class or default,
  then reasoned about the flex wrapper to confirm callers passing no `heading`
  render identically.
- On **T5**, the reviewer ran its own exact-count query against the live table,
  confirmed 1,941 rows, and verified the paging key is unique so pages
  partition rather than overlap — the assertion would fail hard rather than
  pass vacuously if paging broke.
- On **T6**, the reviewer pixel-analysed the screenshot and read the shell
  source rather than accepting the record's account of the layout.

## Two deviations worth carrying forward

**T6 did not use the launch configuration its criterion named.** Port 3000 was
already serving a different worktree — `onboarding-name-step` — which contains
none of these changes, so following the criterion literally would have measured
the wrong tree and most likely reported a false failure. A worktree-specific
configuration on port 3011 was used instead, and the run confirmed the server's
identity by resolving the listening process's working directory rather than
assuming it. `.claude/launch.json` is gitignored, so that entry appears in no
diff.

**T6's second criterion was worded against a pre-change layout.** It asks that
the aside sit "to the right of the heading" at 1280px, but hoisting the heading
to full width is the feature — so the aside now sits below the full-width
heading and to the right of the body column. The run measured against the
column and said so plainly rather than quietly reinterpreting the criterion;
the reviewer checked that reading against the screenshot and the source before
accepting it.

Both are recorded in the run log's `follow-ups:` as wording to tighten if this
verification shape is reused.

## What the build proves

The feature is verified, not merely implemented. Sixteen browser loads — four
programs, both screens, at 1280px and 768px — each report exactly one client
rect for the eyebrow, a gap of exactly 2 to the title matching the unchanged
`gap={2}`, and zero console errors. The worst real case renders as
`MISSISSIPPI GULF COAST COMMUNITY COLLEGE · WOMEN'S · JUCO`, with the
conference gone. The record and its screenshot are in this stage's
`references/`.

The regression spec covers all 1,941 programs rather than a fixture, and the
longest eyebrow today is 74 characters against a 97-character budget — 23
characters of headroom.

Unchanged from the design, and still true of the shipped code: the one-line
guarantee holds at 768px and above only, and dropping conference leaves four
rows — both Glendale Community Colleges, men's and women's — without their only
distinguishing field. Both were open questions the human accepted at stage 02;
neither is a build defect.

## Also consulted

Beyond the declared inputs (the queue, its run log, and `04_tasks/output/tasks.md`):

- `git log` and `git diff --stat` over `fd13c75..HEAD`, for the commit range and
  the net file list.
- `work/eyebrow-text-wrap/05_build/references/browser-check.md` and
  `status-1280.png` — this stage's own references, written by T6.
