# Practice copies: testing reviewer applicants

Each applicant cleans their own copy of one set's AI output in `/label`. Copies
are graded against a completed analyst session of yours (the answer key). A
copy can be submitted but **never published**, so test edits never reach the
match.

## Before you start

1. **The answer key must be finished.** The session must be an analyst
   session marked **complete**. The test set chosen on 2026-11-06 is
   Fernandez v Leon (`fe33f68f`), set 1: session `4479fe96-bf6c-4a50-8c78-08095f69966a`.
2. **Confirm no minors** on the footage. The database has no birth date for
   either player.
3. **Judge forced/unforced errors on the set** in the key. Until you do, error
   kind is not graded. The create form shows how many calls the set has.
   Likewise **tag shot kinds** (G approach, K lob, J drop shot, P passing) on
   the set if you want them graded; a key with no tags skips that field.
4. **Give each applicant an account with the labeller role** (`users.is_labeller`).
   They then see `/label` and nothing else.

## Creating copies for the 8 testers

1. Open the key session at `/admin/labels/<sessionId>`. In the header, click
   **Practice copies**. This opens `/admin/labels/<sessionId>/practice`.
2. Pick the **set**, for example "Set 1 · 46 points".
3. Tick the applicants and click **Create 8 copies**. Each copy:
   - holds only the AI points inside the key's set 1 film window;
   - is assigned to that person;
   - reuses the job's stored results file: no vendor request, no new billing;
   - carries set 1's entered score, so the console's "score doesn't add up"
     check works on that one set.

   Each person can hold only one copy of the match. The result line says who
   already has one.

4. Tell the testers: open **Practice set** on `/label`, label set 1 only, then
   **Submit for review**. Their list says "Practice set". It never shows
   player names, the program, a match id or a job id.

## Reading the grades

Copies show on the same page once submitted. Click a name to see the per-field
breakdown and every miss with its film time.

| Column           | Meaning                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accuracy**     | Correct checks over all checks: one check for each key point's existence, one for each extra point, one per graded field per matched point. |
| **Fixes caught** | "N of M": M is every place the copy's AI output disagreed with your key; N is how many the tester got right.                                |
| **Missed**       | The tester left the AI's wrong value, never added a point the AI missed, or kept a rally the key removed.                                   |
| **New errors**   | The tester changed something the AI had right, added a point that isn't one, or deleted a real point.                                       |
| **Active time**  | Minutes of real work from the console's work heartbeat (visible tab + input, or film playing). Admin time is never counted.                 |

**Graded fields:** point boundaries, server, winner, ending, ended by, error
kind (only where your key judged it), last stroke (the family of the last
live stroke: serve, forehand, backhand, volley or overhead), and shot kinds
(approach, lob, drop shot, passing — every tag on the point, compared per
point, not per stroke). Shot kinds are graded only when your key has at least
one tag, so tag the key's set before creating copies if you want them scored.

**How points are matched:** by film time, not by id. Each key point is paired
with the copy point whose first stroke is nearest, within 2.5 s. Lets and "not
a point" rallies don't count as points on either side.

**Missed vs new is judged against each copy's own starting output.** The copy
is rebuilt with today's derivation code (stamped on the copy), which can be
newer than the key's. A difference between versions never counts against a
tester.

**Downloads:**

- **Download CSV:** one row per copy, with every field's tally.
- **Download misses:** one row per miss, with its film time.

**Clean-up:** **Delete** removes one copy and its rows only. It is matched on
`kind = 'practice'` in the database, so it cannot touch the key or the match.
Deleting the match or a tester's account removes their copies too, and copies
never block either deletion.

## Pay report

Go to `/admin/labels/pay` (the **Pay report** link on Admin › Labels). Pick a
date range in UTC days, ends included; the default is this month.

- **Video hours** per labeller, split into submitted (awaiting review) and
  approved (published). A session counts once, on the day it was first
  submitted, credited to whoever submitted it. A session you send back counts
  again only after it is handed in again.
- Hours are the job's trimmed match video, or the billed seconds when there is
  no trim.
- **Practice sets** are counted apart and are never paid hours.
- **Download CSV** gives per-labeller totals. **Download sessions** gives one
  line per session.

## What guarantees a copy never publishes

- **Database:**
  - `label_sessions_practice_never_complete`: a practice row can never be `complete`.
  - `claim_label_publish_lease` skips practice rows.
  - `label_sessions_kind_immutable`: a copy can't be turned into an analyst session.
- **Server:**
  - Mark complete's gate (`checkSessionOpen` with `forPublish`) refuses it.
  - `publishPlanned` refuses it too, which also covers `scripts/label-apply.ts`.
  - Tests: `tests/label-practice.spec.ts`.

Migration: `supabase/migrations/20261106225626_label_practice_sessions.sql`.
