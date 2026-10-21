# Advantage in Claude's Connectors Directory — draft listing

**Current state (2026-10-21): draft, not submitted; updated for the nine
tools and the two writes (PRs #515, #517, #519).** The answers the developer
portal at [claude.ai/directory/manage](https://claude.ai/directory/manage) asks
for, step by step, per Anthropic's
[submission guide](https://claude.com/docs/connectors/building/submission).
Any paid Claude plan can submit. Once listed, people find Advantage inside
Claude and press Connect instead of pasting the address from Settings ›
Connections. The connector itself is [`ask-mcp-connector.md`](ask-mcp-connector.md).

## Before submission

1. **Privacy policy URL** — `https://advantage-analytics.com/legal/privacy-policy`.
   Version 1.2 adds "AI Service Providers" and "Apps You Connect"
   (advantage-landing PR #16); submit once that is live. _Open on
   2026-10-21: the page answers 200 but does not yet carry either heading —
   confirm the deploy before submitting._
2. **Documentation URL** — `https://advantage-analytics.com/claude`, the public
   connect steps (same PR). Live. Its steps should match Settings ›
   Connections, which since PR #519 names Claude, ChatGPT and Cursor.
3. **A reviewer account with data.** A dedicated account with several analysed
   matches (so `get_match` has insights and key moments to show), one team
   membership (so `list_workspaces` lists a program and `opponent_scouting`
   has a `faced_by`), and at least one match the account _created_ (so
   `update_match` has a row it may edit) — not the `EYES_ON_*` verifier,
   whose password the eyes-on harness depends on. Credentials go in the
   portal only.
4. **An icon.** The Advantage mark, square, on its own background.
5. **A live walk of all nine tools with a real token** from Claude Code
   against production (`claude mcp add --transport http advantage
https://app.advantage-analytics.com/api/mcp`, then `/mcp`). The last
   recorded walk (2026-10-16) predates five of the tools and both writes.

Already met: remote over HTTPS, OAuth 2.1 with dynamic client registration,
and every tool carries a `title` and annotations — `readOnlyHint: true` on
the seven reads, `readOnlyHint: false` / `destructiveHint: false` on the two
writes (`src/lib/services/mcp/server.ts`).

## Connection

- URL: `https://app.advantage-analytics.com/api/mcp`
- Users connect to one URL.

## Listing

- **Name** (≤100): Advantage
- **One-liner** (≤200): Ask about your tennis matches — serve, return, rallies,
  opponents and patterns — from your Advantage statistics, as you see them in
  the app.
- **Description** (≤2,000):

  > Advantage turns match video and SwingVision exports into tennis statistics.
  > This connector lets Claude work with them for you: list your matches and
  > teams, open one match's full report (statistics for both players, the AI
  > summary and key moments, a link to the page or a share link), scout an
  > opponent from your record against them, look at the data behind any of it
  > with a read-only query, and ask questions like "How did my second serve
  > hold up against left-handers this season?" or "Where did I lose the most
  > points in my last match?".
  >
  > Claude sees only what your own Advantage account can see — your matches,
  > and those of teams you belong to. Two things it can change, and only for
  > you: the details of a match you recorded (opponent, event, date, surface —
  > never the score), and a saved upload draft that pre-fills the app's wizard
  > with a match you describe, so you can open the link, pick the video and
  > finish there. Nothing is uploaded, analysed or charged from Claude.
  > Questions asked through Claude use your monthly Ask questions and appear
  > in your Ask history, the same as asking in the app.
  >
  > You need an Advantage account with at least one match. Disconnect any time
  > from Settings › Connections in Advantage, or by removing the connector in
  > Claude.

- **Categories**: Sports; Analytics (or the nearest the portal offers)
- **Documentation URL**: `https://advantage-analytics.com/claude`
- **Privacy policy URL**: `https://advantage-analytics.com/legal/privacy-policy`
- **Support contact**: the `SUPPORT_EMAIL` in `src/lib/constants.ts`
- **Icon**: _see item 4 above_
- **Slug** (permanent): `advantage`

## Use cases

- A player asking how a part of their game is trending across matches.
- A coach preparing for an opponent from the team's record against them
  (`opponent_scouting`), then digging into one meeting (`get_match`).
- Pulling a match's numbers and its AI summary into a Claude conversation to
  write a recap, with the share link to send along.
- Fixing a wrong opponent name or tournament on a match from the chat.
- Describing a match just played and getting the link that opens the upload
  wizard with it filled in.

**Before connecting**: an Advantage account with matches. **Reads or writes**:
reads and writes. Reads: everything the account can see in the app. Writes,
all to the person's own data and all declared with `readOnlyHint: false`:

- `update_match` — the details of a match the person recorded (opponent name,
  event, round, date, type, surface, the opponent's school/hand/backhand).
  Never the score, the format or who played; a match on a scheduled team event
  refuses the fields the event owns.
- `prepare_video_upload` — one upload-wizard draft, private to the person,
  that the app's wizard resumes from a link. It creates no match, no analysis
  job and no charge; the person picks the file and answers the attribution
  questions in the app.
- `ask` — saves the exchange to the person's own Ask history and spends a
  monthly question, as the app does.

## Company

Advantage Analytics LLC, the landing site, and a primary contact for review
updates.

## Authentication

OAuth with dynamic client registration (Supabase Auth's OAuth 2.1 server). The
consent page offers Allow only to known callbacks — Claude's, ChatGPT's,
Cursor's and loopback ones (`CONNECTOR_REDIRECT_URIS`, PR #519); if the review
team registers from another callback, add it there first.

## Data handling

Our own API. No personal health data, no sponsored content. Player names and
match statistics are personal data of the account holder and their teams.

## Test & launch

Reviewer steps: add the connector by URL, sign in with the reviewer account,
Allow, then:

1. `list_workspaces` — the personal entry plus the reviewer's team with a role.
2. `list_matches` — the matches; note one `match_id` with `has_stats: true`.
3. `get_match` with that id — both stat sides, `insights`, `key_moments`,
   `match_url`.
4. `opponent_scouting` with `opponent` set to a name from step 2.
5. `describe_views`, then `run_query` with
   `select count(*) from ask.points where match_id in (select match_id from scope)`.
6. `ask` with "How did my first serve do in my last match?".
7. `update_match` on a match the reviewer account created, changing
   `tournament_name`; read it back with `get_match`.
8. `prepare_video_upload` with an opponent and a date; open the returned link
   — the wizard resumes on the file step with the details filled.

The first four reads were run as a custom connector on 2026-10-16; the five
tools added since (PRs #515, #517) have not yet been walked with a real token
— item 5 under "Before submission".

## Compliance

Seven acknowledgements in the portal; read the
[Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms)
and [Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
before ticking them.
