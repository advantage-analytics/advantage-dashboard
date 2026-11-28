# Ask: follow-up context — plan

Status: proposed, 2026-11-25. Nothing built yet.

## The problem, from the real conversations

`ask_messages` holds 18 conversations with more than one question: 58
follow-up questions in all. They fail in four ways. The failures are not the
model forgetting the thread: the planner already receives the earlier turns
(`conversationTurnsFromMessages`) and the previous plan
(`previousPlanFromMessages`), and two server checks send it back when a
follow-up drops the previous measures (`followUpShrank`) or player
(`droppedPlayerFilter`). The gaps are in what happens around that.

1. **The same answer comes back (8 turns).** A new question gets the
   previous answer word for word: "How is Rudy playing versus Emon" after a
   question about Rudy; "Show me all the stats"; "Can I see all of Rudy's aces
   in video"; "What are his best patterns of play for short rallies?". The
   follow-up rules (`ASK_FOLLOW_UP_KEEPS_COLUMNS`, the previous-scope
   fallback) are built to _keep_ the previous plan, and nothing notices when
   keeping it means answering nothing new.
2. **Corrections are read as new questions (8 turns).** "No I meant for only
   rallies that went up to 4 shots", "I meant patterns of play like placement
   and direction", "bad answer", "Make sure to show the placement". The
   planner plans the correction on its own words, so "I meant patterns of
   play" lands on a generic comparison. One conversation corrects three times
   in a row.
3. **A new view of the same answer loses the answer.** "Can I see it by first
   and second", "Can I see a table of all the plays compared?", "can I see
   both side by side?", "How about on average for each full set?". These ask
   to reshape the previous result, and are planned as fresh questions — most
   end on the team-vs-opponents comparison.
4. **Plays answers cannot be refined.** Winning and losing plays and serve
   plus one come from the server's own query (`plays.ts`), which takes a
   subject and nothing else. "…for short rallies", "…specifically what stroke
   and the placement in a table", "…winning and losing" cannot be expressed,
   so the answer repeats or drops to "The highest total points came from the
   overall group."

## The plan

Four steps, each its own PR, in this order. Step 1 is the eval every later
step is measured on.

### 1. A follow-up eval from these conversations

- Turn the 58 follow-ups into fixtures: the earlier turns, the saved
  previous plan, the question, and what a right answer must keep or change
  (scope, measures, shape), written by hand.
- A script replays each through the real planner against the eyes-on
  account's data (read-only, `ask_reader`), and grades the plan against the
  fixture: no model judge needed, since every check is on the plan.
- Baseline it on today's code. Each later step reports the before and after.
- Cost: one plan call per fixture, about 60 calls per run on Gemini Flash —
  cents.

**Built (2026-11-25).** It reuses `scripts/ask-eval.ts` rather than a new
script: `scripts/ask-eval-follow-ups.json` (personal, 24 questions, 17
follow-ups) and `scripts/ask-eval-follow-ups-team.json` (team, 52 questions,
41 follow-ups), each follow-up noting how it went live. Two harness changes:
`after` now sends the whole thread, as the route does, not only the exchange
before; and a `differs` check fails a follow-up whose headline is the
previous answer's. The fixtures run against the verifier's data with the
names swapped, so they grade the plan's behaviour, not the live figures.

Team run:

```
npx tsx scripts/ask-eval.ts --out team.md --program <ZZ Test Program id> \
  --questions scripts/ask-eval-follow-ups-team.json \
  --sub "Sokolov=Avery Zzseed" --sub "Reyes=Casey Zzseed" \
  --sub "Okafor=Jordan Hale" --sub "Lindqvist=Sam Ortiz"
```

The test program has analysed matches for Avery Zzseed only, so a turn
about Reyes is checked for not repeating, not for answering.

**Baseline, one run each on today's planner (Gemini): 46 of 58 follow-ups
pass.** Personal 22 of 24 questions, team 42 of 52; every failure is a
follow-up. The twelve:

| Failure                           | Turns                                                                                                                                                                                                                | Step that targets it                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| The previous answer again         | 5 — "bad answer", "How did Avery beat him", "Can I see this player's losing patterns?", a playlist request, "what did I do to win this match?"                                                                       | 2                                                   |
| A reshape or correction lost      | 4 — "throughout the match" (a match total), "on average for each full set" (per match), "return points comparison" after a ranking (no_data), "No I want to see his serve plus 1's all patterns…" (asked to clarify) | 3                                                   |
| Serve plus one refinements        | 2 — both no_data, partly because the test matches lack shot positions                                                                                                                                                | 4                                                   |
| "Your best play" in a team answer | 1                                                                                                                                                                                                                    | not in this plan; a wording bug in the plays answer |

The planner is not deterministic (see `--retries` in the script), so a
step's gain counts when it holds over two runs.

### 2. Never answer a follow-up with the previous answer

- When a follow-up's plan is the previous plan (same `scope_sql` and `sql`,
  or the same plays or compare request) and the question is not a repeat of
  the previous question, send the planner back once with that said — the
  same pattern as `followUpShrank`.
- If it plans the same again, answer with a short line saying the data
  answers only what was already shown, and the suggestion chips, instead of
  the identical answer.
- Server-only: `ask.ts`. No prompt change beyond the feedback sentence.

### 3. Rewrite corrections and reshapes into one standalone question

- The planner's reply gains a `standalone_question`: the follow-up rewritten
  to stand on its own ("I meant patterns of play like placement and
  direction" after "What am I doing right" → "Which serve and shot
  placements and directions won me the most points?").
- A correction ("no", "I meant", "not that", "bad answer", "make sure…")
  rewrites the _previous_ question with the correction applied, rather than
  planning the correction's words.
- The rewrite is what the examples search reads and what the run logs, so
  the audit sees what was answered.
- Prompt and schema change in `prompts.ts` / `ask.ts`; measured on the eval
  before it ships. Gemini and the Claude path both.

**Tried and not shipped (2026-11-25).** The rewrite went in as a
`question` field inside the planner's `state` (saved, and shown to the next
turn), with a prompt rule for corrections and reshapes. Three variants, two
follow-up eval runs each, against step 2's 46 and 43 of 58:

| Variant                                                        | Follow-ups passing |
| -------------------------------------------------------------- | ------------------ |
| `state` first in the schema, keyword routing reads the rewrite | 41, 38             |
| `state` first, routing reads the question as asked             | 41, 41             |
| `state` last as before, routing as asked (field and rule only) | 40, 39             |

Every variant lost four or five. Routing by the rewrite sent corrections
like "I meant patterns of play like placement and direction" to the fixed
winning-plays answer, which cannot split by placement, so they came back as
the same answer; without the routing, the field and the rule alone still
cost as much on Gemini Flash Lite. It did fix the one turn it was aimed at
("No I meant for only rallies that went up to 4 shots" reached the
rally-length plays query). The code was not kept.

Worth trying again on the Claude planner, where the extra instruction may
not crowd out the rest, and after step 4 gives the plays answers the splits
a rewritten correction would route to. The season list's one failure ("What
are my strengths this season?" drawn as a tree, not a table) fails on step
2's code too, in both runs: it is not from this step.

### 4. Let plays answers take filters

- `plays.ts`'s query takes the follow-up's filters: rally length, first or
  second serve, court side, opponent, and winning and losing together.
- "In a table" returns the rows behind the headline as the answer's table.
- Data change: the plays SQL runs through `ask_run_query` as today, so no
  new grants, but `rls-boundary-reviewer` and the Postgres skill run on it.

**Built (2026-11-26), in part.** Both plays queries now take a rally length
and one side (`p.rally_length`, `p.court` on `ask.point_plays`; the losing
plays narrow their per-shot miss rates to the same points), read back from
their sql (`rallyLengthOfPlaysSql`, `courtOfPlaysSql`) so the server still
knows them as its own, and say the filter in the headline ("…on the ad
side"). A question naming one side or a rally length now reaches the plays
answer instead of the planner; a split by side ("deuce and ad") stays the
planner's. A tree narrowed to a side draws no Video links — the Video filter
has no side — and one narrowed to a rally length links only where a rally
band holds exactly those rallies. A team's plays over several players speak
of "the team", never "you".

Not built: first or second serve (whose serve, the point's or the shot's,
is its own question), winning and losing in one answer (two trees in one
answer), and "in a table".

Two runs each against step 2:

|                     | Step 2 | Step 4 |
| ------------------- | ------ | ------ |
| Team (of 52)        | 42, 40 | 45, 45 |
| Personal (of 24)    | 22, 21 | 14, 17 |
| Season list (of 21) | 20, 20 | 20, 20 |

The team gain is the voice: the four "Your best play" failures are gone in
both runs. The personal drop is not this step's: no question in the three
lists routes differently under it (checked against the routing predicates
before and after), and the failing personal turns are planner-written
queries that came out differently this time — the personal list has swung
by as much before (see step 3's variant C). The eval's own turns do not
name a side or a rally length for the losing plays, so the filters
themselves are pinned by unit tests, not by it.

## Decisions for you

- **Does a correction cost a question?** Step 3 makes "No I meant…" a
  re-ask of the previous question. Charging for it charges the player for
  Ask's misreading. Suggestion: free when it corrects the turn right before
  it, as the cache already makes repeats free.
- **What shows when step 2 gives up?** Suggestion: one line — "That's
  everything these matches show on it" — and the suggestion chips, never the
  same answer again.

## Not in this plan

- Video and clip requests ("give me a playlist", "aces in video") — the
  audit's item 6, its own feature.
- "This match is updating" and the switch-workspace link — the leftovers of
  the quick-fixes batch.
- Switching the planner to Claude. Steps 2–4 help on either model; the eval
  in step 1 is how the switch would be judged.
