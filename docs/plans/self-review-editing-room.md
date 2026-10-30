# Self-review editing room: v1 scope

Written 2026-10-23. A scope, not a spec. Design source: the "Self-review and
Verified" canvas (artifact `HqfmpaBTNqoAoQmNBExu8w`), which supersedes boards
4–6 of "Point Feedback" (`V1p1QECPuto8TSvzaNNbYz`): the review is the admin
labelling console's full-screen view, not a new editing room. Data notes:
`~/Desktop/advantage-match-labels-2026-09-28/CORRECTIONS-FEATURE-NOTES.md`,
which predates the labelling console's publish and is partly superseded below.

## Why

Hand-cleaning a match takes Cj about an hour per 30–40 flags, which caps the
paid "Verified" tier at a handful of matches a week. Self-review lets owners and
coaches fix the flags they care about on their own matches. It is the free
middle tier between self-serve (unreviewed) and Verified (cleaned by us), and
every answer is labelled data for the autofix work.

| Tier        | Who cleans      | Shown as        |
| ----------- | --------------- | --------------- |
| Self-serve  | nobody          | Review pills    |
| Self-review | owner / coaches | "Edited by you" |
| Verified    | Advantage       | Verified        |

## The one decision that shapes everything: reuse the label pipeline

The 2026-09-28 notes planned a new `corrections` table, keyed on a new
`points.vendor_rally_id`, re-applied inside every derive. **Don't build that.**
The admin labelling console (PRs #415, #416, #483, #489) has since shipped
everything it needed:

- **Rows that survive a re-derive.** A label session holds its own
  `label_points` / `label_shots`, keyed by `vendor_rally_ids`
  (`seed-session.ts:45`), with each row's original value frozen in `seed`.
- **Rescoring.** `labelScores` (`labels/score.ts:171`) re-derives point and
  game scores from corrected winners; `apply.ts:467-495` re-runs `pressureFor`
  for break/set/match points at publish.
- **Publish.** `publishPlanned` (`labels/apply-session.ts:374`) backs up
  points, shots, bookmarks and stats to `label-backups/`, replaces the derived
  rows, re-links bookmarks by `video_time`, recomputes `match_stats`, the
  returns backfill and the AI summary, and rolls back on any write error.
- **Protection.** `persistTranscript` refuses to overwrite a match whose points
  carry `hand_labelled` (`persist-transcript.ts:334-397`), so a webhook or
  rebuild never wipes published labels.

v1 = **an owner-run label session, narrowed to two questions, published by the
same code.** No new correction model, no `vendor_rally_id` migration, no change
to `buildTranscript`.

## v1 scope

### Who can review

- **Personal workspace:** the match's creator (`matches.created_by`).
- **Team workspace:** the creator, plus program `owner` and `coach`. Not
  `staff`, not `player`: players editing their own stats is the bias the tier
  must avoid.
- Checked in a new server guard (`requireMatchReviewer(matchId)`), next to
  `requireAdmin` in `programs/admin-guard.ts`. Writes stay service-role, like
  every label write today. RLS on `label_*` stays admin-only for direct reads;
  the room loads its rows through a server loader that runs the same guard.
- **Open decision (Cj):** this is the first time a coach writes to a match they
  did not record. `20261012003309_matches_opponent_program.sql:30-35` calls that
  "a separate decision". v1 writes points/shots only, never the `matches` row.

### Which points enter the queue

Only the flags that are right often enough to be worth a user's time. These
are the two questions from the console's review list (`marks-copy.ts:159`)
that a non-expert can answer from the video:

- **How did the last ball end?** `ending_suspect_line` (12 of 14 within 1 m
  were really errors), `result_type_unknown`.
- **Who won?** `winner_guessed`, `last_call_contradicts_winner`.

Live, on the 23 analysed matches that are not hand-labelled, that gives a
median queue of **15 points** (min 7, max 58), out of about 93 points a
match. Everything else stays admin-only: missing or extra shots, merged points,
serves, game and serve order, and the noisy flags (`winner_disputed`,
`same_player_consecutive`, `second_serve_called_out`,
`winner_to_error_by_bounce`, `score_side_mismatch`). By comparison, all flags
together average 53 points a match, too many to hand a user.

Each queue item reads the console's marks live (`labels/marks.ts`), filtered to
those codes, so the room and the console agree on what is open.

### What a reviewer can change

Through the console's own cells, nothing new:

- **Who won:** the winner mark's menu (`BlackWinnerCell`,
  `label-black-point-row.tsx:908`), "Recalculates the scores after this point".
- **How it ended:** the flagged last ball's **Result** cell (In / Out / Net) in
  the open point's shot rows, the same cell the console uses. The ending follows
  from the strokes (`ending-derived.ts`), so a player answers "was that ball
  in?" instead of naming an error type. For `result_type_unknown`, it is the
  last stroke's Result.
- **Check:** the row's tick, or ⌘↵, confirms a point unchanged.

Nothing else is editable in v1: no stroke keys, placements, servers, the ⋯
point menu, or adding and removing points or shots. The console already has a
read-only switch (`edit.editable`); owner mode is a third state that turns on
only the winner cell, the last stroke's Result cell and the tick.

### The review (canvas board 2)

- **Entry:** "Review N points" in the Video tab, owner and coaches only (board
  1). Each queued point gets a grey "Review" `StatePill` and its reason line in
  the point list (`film/point-list.tsx` `PointRow` :928) and in "This point"
  (`film/film-this-point.tsx`).
- **Surface:** the labelling console's full-screen black view
  (`label-black-view.tsx`, `label-black-rail.tsx`), opened on the owner
  session: film and court on the left, the rail of game bands and point rows
  on the right. The queued points carry the console's amber `MarkChip`; the
  open point shows the one-line review note under the flagged stroke
  (`ReviewNote`, `label-review-inline.tsx`); `]` / `[` walk the flags. The
  console's layouts other than full screen, its header and its Labels board stay
  admin-only.
- **Route:** decide in step 5. The match page has no sub-routes and the console
  lives at `/admin/labels/[sessionId]`. Mounting the black view as a full-screen
  layer from the film tab keeps the match URL; a new
  `/dashboard/matches/[id]/review` route is simpler to load but breaks the
  no-sub-routes rule.
- **Saving:** each answer is the console's own write (`label_apply_edit` and the
  patch actions), so closing the tab loses nothing. **"Save and exit" publishes
  once** (delete, insert, stats, AI summary), so publishing runs once per visit,
  not once per point. Points left unanswered publish as they were.

### After saving (board 3)

- Points the reviewer changed show the console's blue pencil and "Edited by
  you". Points they confirmed show nothing extra. (Not a blue dot: that is
  "New" in the Matches table.)
- A quiet "Saved · statistics updated" line beside "Change your review". The
  design system has no toast.
- The rail says "Reviewed by you · 7 checked, 2 changed". A Verified match
  shows a grey "Verified" `StatePill`, never a blue-tinted one.
- The Review pill disappears from answered points; unanswered ones keep it.

### Never

- Never write `matches.score`. If the rescored points disagree with the entered
  score, publish anyway (as the console does) and say so in the room: "Your
  changes make set 2 6-3; you entered 6-2. Your entered score is kept."
- Never mark a self-reviewed match Verified.

## Data changes

1. **`label_sessions.kind`** `'admin' | 'owner'`, default `'admin'`. The admin
   Labels list filters on it. The one-open-session-per-job index stays: the
   admin and owner sessions never run on a match at the same time (see
   Conflicts).
2. **New point flags** written by publish, instead of `hand_labelled` alone:
   - `owner_reviewed` on every point of an owner publish;
   - `owner_edited` on points whose winner or ending differs from the seed.
     `persistTranscript`'s overwrite guard widens from `hand_labelled` to
     "hand_labelled or owner_reviewed" (one constant in `derivation/flags.ts`).
     `match-points-server.ts:311` maps `owner_edited` for the list.
3. No change to `points`, `shots` or `point_bookmarks` columns.

## Conflicts with the Verified tier and with rebuilds

- **Reopening.** A second visit reopens the user's existing owner session. A
  new seed would come from the vendor file (`seed-session.ts` never reads
  `points`) and drop the earlier answers.
- **Verified takes over.** When Cj starts an admin session on a match that has
  an owner session, seed it from the owner session's rows, not the vendor, so
  their answers carry over. After a Verified publish, the room is closed for
  that match. **This seeding path is v1.1**; in v1 the admin console just shows
  that an owner session exists.
- **Score-edit rebuild** ("Save and rebuild", PR #379) is already refused
  silently on a labelled match. With `owner_reviewed` it is refused on reviewed
  matches too. The rebuild dialog has to say so instead of failing quietly.
  This is a v1 item.

## Build order (one PR each, into `splitstep-integration`)

1. **Migration and flags.** `label_sessions.kind`; the `owner_reviewed` /
   `owner_edited` codes; the widened overwrite guard; a spec that a re-derive
   refuses on an owner-reviewed match.
2. **Guard and server actions.** `requireMatchReviewer`; open-or-reopen owner
   session; answer (winner / ending / it's right); publish with the new flags
   and `acceptScore: true`. Reuses `seedLabelSessionForJob` and
   `publishPlanned` with an injected guard instead of `requireAdmin`. Refuses:
   imported matches (`derived = false`), matches with an open admin session,
   matches already Verified. Tests with the existing injectable `deps`.
3. **Queue.** A pure filter over `labels/marks.ts` limited to the four codes,
   with the queue order and reason copy. Unit-tested against the Ace v Goodman
   labels.
4. **Video tab.** Review pills, reason lines, the "Review N points" button, the
   "Edited by you" pencil, the Verified pill, and the rebuild-dialog message.
   Run the `trace-route` skill first; read `docs/ui-revamp-guardrails.md` and
   the design system skill.
5. **The console in owner mode.** The black view on an owner session, with the
   owner edit state (winner cell, last-stroke Result, tick), the four-code
   queue, the route decision, and "Save and exit" → publish → "Saved ·
   statistics updated".
6. **Admin.** Owner sessions on the Labels list (filter plus a badge), read-only
   in the console.

Steps 1–3 have no UI and can be checked with tests alone; 4–6 need the
`/pr-check` eyes-on stage.

## Out of v1

- "Report a problem" (boards 1–2b) and the admin triage queue (board 3).
- Editing shots, servers, game order; adding, removing, merging or splitting
  points.
- Seeding a Verified session from an owner session (v1.1, above).
- Gating self-review by plan or price. It ships free on every video match.
- Staff and players reviewing in team workspaces.

## Measuring it

Every answer leaves the seed and the final value side by side on
`label_points`. One query per flag code gives "how often a reviewer changed
it", which is the same accuracy number the autofix rules are kept or demoted on
(`played.ts`). Add it to the Labels list once there are 10+ reviewed matches.

## Open questions for Cj

1. Can coaches edit a match a player recorded in the team workspace? (v1
   assumes yes, points only.)
2. Should `staff` review too, or only owner and coach?
3. Is the queue right: the two questions above, median 15 points?
4. Should the AI summary regenerate on every owner publish? It does today for
   admin publishes. One Gemini call per "Save and exit".
