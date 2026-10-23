# Advantage in Claude's Connectors Directory — draft listing

**Current state (2026-10-21): draft, saved in the portal, not submitted.** The
answers the developer portal at
[claude.ai/directory/manage](https://claude.ai/directory/manage) asks for, in
its ten steps, per Anthropic's
[submission guide](https://claude.com/docs/connectors/building/submission).
Once listed, people find Advantage inside Claude and press Connect instead of
pasting the address from Settings › Connections. The connector itself is
[`ask-mcp-connector.md`](ask-mcp-connector.md).

## Before submission

1. **The release with the nine tools is live** — #515 (three reads), #517 (two
   writes) and #519 (ChatGPT and Cursor callbacks), through the
   `splitstep-integration` → `main` release. The portal syncs the tools from
   production, so submitting earlier lists four.
2. **Both writes run once as a connector against production** —
   `update_match` and `prepare_video_upload` had not been called with a real
   connector token when #517 merged. The Self-tested tick in step 8 depends
   on it.
3. **The public pages describe the writes** — advantage-landing #18 (the
   `/claude` page and privacy policy 1.3), merged once step 1 is live.
4. **The reviewer account** — email and password in step 8's text, never in
   this repo. Reviewers sign in with the password; a magic link reaches only
   the owner's inbox. It needs analysed matches (so `get_match` has insights
   and key moments to show), one team membership (so `list_workspaces` lists
   a program and `opponent_scouting` has a `faced_by`) and at least one
   match it _created_ (`update_match` edits only those), a Tournament one so
   step 8's `round` edit applies. It is not the `EYES_ON_*` verifier, whose
   password the eyes-on harness depends on.
5. **The icon** — the Advantage mark, square.

Already met: remote over HTTPS, OAuth 2.1 with dynamic client registration
(the portal detects both), and every tool carries a `title` and a
`readOnlyHint` or `destructiveHint` (`src/lib/services/mcp/server.ts`).

## 1 · Connection

- URL: `https://app.advantage-analytics.com/api/mcp`
- Users connect to different URLs: **off**.

## 2 · Tools

Synced from the server. Nine, none flagged:

| Tool                                                                                                           | Reads or writes                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List matches · List workspaces · Get a match report · Scout an opponent · Describe the ask views · Run a query | read                                                                                                                                                       |
| Ask a question                                                                                                 | write — saves the exchange to the user's own Ask history and spends a monthly question                                                                     |
| Update a match's details                                                                                       | write — opponent, tournament, round, date, type, surface, opponent's school, hand and backhand on a match the user created; never score, format or players |
| Prepare a video upload                                                                                         | write — saves an upload-wizard draft and returns its link; nothing is created or charged                                                                   |

## 3 · Listing

- **Name**: Advantage
- **One-liner**: Ask about your tennis matches — serve, return, rallies and
  patterns — from your Advantage statistics, and fix a match's details or start
  an upload from the conversation.
- **Description**:

  > Advantage turns match video and SwingVision exports into tennis statistics.
  > This connector lets Claude work with them for you: read a match report,
  > scout an opponent from your past meetings, look at the data behind your
  > game, and ask questions like "How did my second serve hold up against
  > left-handers this season?".
  >
  > Claude can also fix a match's details — opponent, tournament, date — on a
  > match you created, and start a video upload: it fills in a draft and hands
  > you a link, and you pick the file and confirm the setup in Advantage. It
  > never changes a score and cannot delete a match or its statistics.
  >
  > Claude sees only what your Advantage account can see — your matches, and
  > those of teams you belong to. Questions use your monthly Ask questions and
  > appear in your Ask history. Disconnect any time from Settings ›
  > Connections in Advantage, or by removing the connector in Claude.

- **Categories**: Sports; Analytics (or the nearest offered)
- **Documentation URL**: `https://advantage-analytics.com/claude`
- **Privacy policy URL**: `https://advantage-analytics.com/legal/privacy-policy`
- **Support contact**: `team@advantage-analytics.com`
- **Author name**: Advantage Analytics LLC · **Author URL**:
  `https://advantage-analytics.com`
- **Slug** (permanent): `advantage`

## 4 · Use cases (reviewers only)

| Use case                | Example prompt                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Prepare for an opponent | `How did I win and lose points against my last opponent?`                                   |
| Write a match recap     | `Write a short recap of my last match for my coach, with the key serve and return numbers.` |
| Start a video upload    | `I played Jordan Vale yesterday and won 6-3 6-4 — set up the video upload for me.`          |

**Prerequisites**: An Advantage account (app.advantage-analytics.com) with at
least one match uploaded from video or imported from SwingVision. Team matches
need membership in that team. Ask questions use the account's monthly
allowance and are saved to its Ask history; edits apply only to matches the
user created.

**Read/write capabilities**: **Read and write** (three tools write; the portal
checks this against the annotations).

## 5 · Company and primary contact

Advantage Analytics LLC, `https://advantage-analytics.com`; the primary
contact is a person who reads review mail. Anthropic contact: blank.

## 6 · Authentication

As detected: **Always required**, **OAuth sign-in** with **Dynamic Client
Registration**, no additional or static headers. The consent page offers Allow
only to Claude's, ChatGPT's and Cursor's callbacks and loopback ones
(`CONNECTOR_REDIRECT_URIS`, `isConnectorRedirectUri()`).

## 7 · Data handling

Our own API. No personal health data, no sponsored content.

## 8 · Test & launch

There is no separate credentials field; the text carries them. Anthropic
publishes no template — the
[submission guide](https://claude.com/docs/connectors/building/submission)
asks for every link, credential and step for a fully populated account,
written for someone who has never used the service. Fill the `<…>` names in
from the reviewer account (Before submission, item 4) before pasting.

> Advantage is a tennis analytics app: players upload match video or
> SwingVision exports and get serve, return and rally statistics. The test
> account below is one player's account, with analysed matches and a team.
>
> **Server URL:** https://app.advantage-analytics.com/api/mcp
>
> **Test account:** email `<reviewer email>`, password `<reviewer password>`.
> It holds analysed personal matches, including a Tournament match it
> recorded (vs `<opponent>`, `<date>`), and belongs to the team
> `<team name>`. It has `<n>` Ask questions left this month; each `ask` call
> uses one.
>
> **Steps:**
>
> 1. In Claude, add a custom connector with the URL above and press Connect.
> 2. A browser tab opens on Advantage. Sign in with the email and password
>    above (the password field, not the email link).
> 3. The consent page says the app wants to use Ask on your behalf. Choose
>    **Allow**; you are returned to Claude.
> 4. Try each tool:
>    - `list_workspaces` — the personal workspace and `<team name>`.
>    - `list_matches` — the account's matches.
>    - `get_match` with a match id from it — both players' statistics, the
>      AI summary, key moments and the match link.
>    - `opponent_scouting` with `<opponent>`.
>    - `describe_views`, then `run_query` with
>      `select count(*) from ask.points where match_id in (select match_id from scope)`.
>    - `ask` with "How did my first serve do in my last match?".
>    - `update_match` on the `<opponent>` Tournament match, with `round` set
>      to a new value, then set it back.
>    - `prepare_video_upload` with any opponent and date — it returns a link
>      and creates nothing until the upload is finished in the browser.
> 5. For `<team name>`'s matches, pass its `program_id` from
>    `list_workspaces` to `list_matches`, `run_query` or `ask`.
>
> MCP Inspector also works: its localhost callback is accepted.

**Self-tested**: tick only after all nine tools have run against production
(Before submission, item 2).

## 9 · Compliance

Seven acknowledgements; read the
[Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms)
and [Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
before ticking them.

## 10 · Review and submit

Fix any quality warnings shown, then submit. The submission is scanned and
listed as a Community connector by default; status and reviewer feedback
appear in the portal. Escalations: `mcp-review@anthropic.com`.
