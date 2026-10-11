# Brief — Personal Ask page

Sources: `../BRIEF-SEED.md`, plus two answers given in chat on 2026-10-10 when
stage 01 asked what is in scope. Where a chat answer and the seed disagree, the
chat answer is the later word and wins; each such place is marked **(chat)**.

## Goal

A player in a personal workspace can open `/dashboard/ask`, ask a question
about their own matches in plain language, and get back a factual, data-driven
answer: statements about what happened in their matches, or across a period of
matches, each backed by numbers from their own data.

It replaces the `ComingSoonPage` stub that is there today.

## Scope

- The personal Ask page at `/dashboard/ask`, laid out after artboard
  `project/Ask.dc.html` in
  <https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV>.
- A composer where the player writes a question and can @-tag their own
  matches and opponents.
- Questions about a **period of matches** as well as individually tagged ones
  **(chat)** — "my last month", "this season", not only "this match".
- **The AI writes the SQL query** that aggregates the right data for the
  question, and then analyses the result of that query **(chat)**. This
  replaces the seed's "receives only computed statistics for the tagged
  matches".
- A streamed answer, built on `getLLMStream()` (`src/lib/llm/adapter.ts`).
- The answer lists the matches it was computed from, as record rows.
- **Question limit** — a per-user quota on questions, with its UI **(chat;
  the seed deferred this)**.
- **Conversation persistence** — past conversations are saved and can be
  reopened **(chat; the seed said not persisted)**.
- **Bring-your-own-model** — the model menu, provider sign-in and the MCP
  connector **(chat; the seed rendered a static "Advantage Intelligence"
  label instead)**.
- Ask stops being marked `comingSoon` in `nav.ts`; `MAP.md` is regenerated
  with `npm run map`.

## Non-goals

- **Advice.** The answer does not recommend practice, drills, tactics or
  strategy **(chat)**. It states what the data shows and stops.
- **The team Ask page** (`/dashboard/team/ask`). It stays a stub.
- **Video.** No video, frames or film are sent to the model — the answer is
  built from match data only.
- **Other players' data.** A question is answered from the asking player's own
  matches; the opponents they tag are opponents in those matches.

## Constraints

- **Fact-based only (chat).** Every statement in an answer is a data-driven
  statement about the user's matches or a period of them, using only numbers
  that came back from the query. Nothing invented, nothing from general tennis
  knowledge.
- **The seed's answer shape needs re-reading in that light.** The seed asked
  for "claim → evidence → so-what". Claim and evidence fit; a "so-what" that
  tells the player what to do does not. See Open questions.
- **AI-written SQL must not widen access.** A query the model writes can read
  only what the asking user is already allowed to read, and can change
  nothing. How that is guaranteed is stage 02's problem; that it is guaranteed
  is not negotiable.
- Refusals from the new route use `errorResponse()` / `jsonResponse()`
  (`src/lib/services/match-video/http.ts`).
- Mock mode works with no LLM key, as it does for the existing insight routes.
- The first-party model is "Advantage Intelligence" in every user-visible
  string.
- The canvas was never rendered and checked: treat its frames as layout
  intent, not pixel truth (seed).
- Sibling branches for Opponents and Statistics also touch `nav.ts` and
  `MAP.md`; expect small merge conflicts on landing (seed).

## Success criteria

1. `/dashboard/ask` in a personal workspace renders the Ask page, not
   `ComingSoonPage`, and the nav item is no longer marked coming soon.
2. A player can @-tag one of their matches or opponents in the composer, ask a
   question, and watch an answer stream in.
3. A player can ask about a period ("my last five matches", "September")
   without tagging anything and get an answer over that period.
4. Every number in an answer traces to a row the query returned; the answer
   shows the matches it was computed from as record rows.
5. No answer contains a recommendation to practise, change tactics or adopt a
   strategy — checked against a set of sample questions, including ones that
   ask for advice outright.
6. A model-written query cannot return another user's data and cannot write —
   shown by a test that tries both.
7. A player who reaches the question limit is told so, and the route refuses
   further questions through `errorResponse()`.
8. A conversation survives a reload and can be reopened later.
9. A player can connect their own model and get an answer from it; with none
   connected, Advantage Intelligence answers.
10. With no LLM key set, the page works end to end in mock mode.
11. `npm run map` has been run and `npm test` passes.

## Open questions

1. **Migrations — asked in chat, not answered.** The seed said "do NOT add …
   any migration". The question limit and conversation persistence both
   appear to need new tables. Is a migration allowed for this feature, applied
   to the live database? If not, those two cannot ship as scoped.
2. **What does "so-what" become?** With advice ruled out, is the third beat
   dropped (claim → evidence), or kept as a factual comparison — against the
   player's own average, or an earlier period?
3. **What does the model write SQL against?** The raw tables (`matches`,
   `points`, `shots`, `match_stats`), or a narrower read-only surface made for
   this? The seed's "only computed statistics" suggests the user once wanted
   the narrow version; the chat answer does not say.
4. **A question that asks for advice** ("what should I work on?") — refuse,
   or answer the factual part and say advice is not offered?
5. **A question the data cannot answer**, or a query that returns nothing —
   what does the player see?
6. **Question limit:** how many, per what period, and does it differ by plan?
   (Pro gating is otherwise unenforced today.)
7. **Bring-your-own-model:** which providers; where a user's key or sign-in
   is held; whether a user's own model counts against the question limit;
   and what "MCP connector" is meant to let the user do. Does the user's own
   model also write the SQL, or only phrase the answer?
8. **Persistence:** how long conversations are kept, whether the player can
   delete them, and whether a saved answer is frozen or re-run when the
   underlying matches change.
9. **Is this still one feature?** The seed was cut down to fit one unattended
   night; the scope above adds three sub-features and a text-to-SQL layer.
   Stage 02 should say whether it lands as one PR or in slices.
