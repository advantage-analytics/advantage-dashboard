# Advantage in Claude's Connectors Directory — draft listing

**Current state (2026-10-21): draft, not submitted.** The answers the developer
portal at [claude.ai/directory/manage](https://claude.ai/directory/manage) asks
for, step by step, per Anthropic's
[submission guide](https://claude.com/docs/connectors/building/submission).
Any paid Claude plan can submit. Once listed, people find Advantage inside
Claude and press Connect instead of pasting the address from Settings ›
Connections. The connector itself is [`ask-mcp-connector.md`](ask-mcp-connector.md).

## Before submission

1. **Privacy policy URL** — `https://advantage-analytics.com/legal/privacy-policy`.
   Version 1.2 adds "AI Service Providers" and "Apps You Connect"
   (advantage-landing PR #16); submit once that is live.
2. **Documentation URL** — `https://advantage-analytics.com/claude`, the public
   connect steps (same PR).
3. **A reviewer account with data.** A dedicated account with several analysed
   matches and one team — not the `EYES_ON_*` verifier, whose password the
   eyes-on harness depends on. Credentials go in the portal only.
4. **An icon.** The Advantage mark, square, on its own background.

Already met: remote over HTTPS, OAuth 2.1 with dynamic client registration,
and every tool carries a `title` and `readOnlyHint`
(`src/lib/services/mcp/server.ts`).

## Connection

- URL: `https://app.advantage-analytics.com/api/mcp`
- Users connect to one URL.

## Listing

- **Name** (≤100): Advantage
- **One-liner** (≤200): Ask about your tennis matches — serve, return, rallies
  and patterns — from your Advantage statistics, as you see them in the app.
- **Description** (≤2,000):

  > Advantage turns match video and SwingVision exports into tennis statistics.
  > This connector lets Claude read them for you: list your matches, look at
  > the data behind them, and ask questions like "How did my second serve hold
  > up against left-handers this season?" or "Where did I lose the most points
  > in my last match?".
  >
  > Claude reads only what your own Advantage account can see — your matches,
  > and those of teams you belong to — and it cannot change anything. Questions
  > asked through Claude use your monthly Ask questions and appear in your Ask
  > history, the same as asking in the app.
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
- A coach preparing for an opponent from the team's matches against them.
- Pulling a match's numbers into a Claude conversation to write a recap.

**Before connecting**: an Advantage account with matches. **Reads or writes**:
reads data. (The `ask` tool saves the exchange to the person's own Ask history
and spends a question, as the app does; nothing else is written.)

## Company

Advantage Analytics LLC, the landing site, and a primary contact for review
updates.

## Authentication

OAuth with dynamic client registration (Supabase Auth's OAuth 2.1 server). The
consent page offers Allow only to Claude's callbacks and loopback ones
(`CONNECTOR_REDIRECT_URIS`); if the review team registers from another
callback, add it there first.

## Data handling

Our own API. No personal health data, no sponsored content. Player names and
match statistics are personal data of the account holder and their teams.

## Test & launch

Reviewer steps: add the connector by URL, sign in with the reviewer account,
Allow, then call `list_matches`, `describe_views`, `run_query` with
`select count(*) from ask.points where match_id in (select match_id from scope)`,
and `ask` with "How did my first serve do in my last match?". Every tool was
run as a custom connector on 2026-10-16.

## Compliance

Seven acknowledgements in the portal; read the
[Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms)
and [Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
before ticking them.
