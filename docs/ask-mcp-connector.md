# The Ask MCP connector

**Current state (2026-10-21).** Slice 3 of the Ask roadmap
([`ask-improvement-roadmap.md`](ask-improvement-roadmap.md), §4 item 10): a
remote [MCP](https://modelcontextprotocol.io) server at `/api/mcp` that lets a
player or coach use **their own AI app** — Claude (claude.ai, Desktop, Code),
ChatGPT or Cursor — over **their own match data**, inside the same security
boundary the Ask page already has. Nine tools: six reads and three that
write (`ask`, `update_match`, `prepare_video_upload`), only to the caller's
own rows (§3, §4). The dashboard switch in §2 is on in production.

## 1. What it is

| Piece                                                   | Where                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The server (nine tools)                                 | [`src/lib/services/mcp/server.ts`](../src/lib/services/mcp/server.ts)                                           |
| The user-side reads (bearer client, RLS)                | [`src/lib/services/mcp/user-reads.ts`](../src/lib/services/mcp/user-reads.ts), `src/lib/data/opponents-load.ts` |
| The HTTP route (Streamable HTTP, stateless, JSON reply) | [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts)                                                       |
| Token verification                                      | [`src/lib/supabase/bearer.ts`](../src/lib/supabase/bearer.ts)                                                   |
| OAuth discovery documents                               | `src/app/.well-known/oauth-protected-resource/`, `src/app/.well-known/oauth-authorization-server/`              |
| The consent screen                                      | [`src/app/(auth)/oauth/consent/`](<../src/app/(auth)/oauth/consent/page.tsx>), `src/lib/auth/oauth-consent.ts`  |
| Limits                                                  | [`src/lib/services/mcp/rate-limit.ts`](../src/lib/services/mcp/rate-limit.ts), `ask_mcp_usage`                  |
| Specs                                                   | `tests/mcp-route.spec.ts` (the HTTP ladder and the tools), `tests/mcp-auth.spec.ts` (the pure pieces)           |

The transport is the official `@modelcontextprotocol/sdk`'s
`WebStandardStreamableHTTPServerTransport` in stateless mode: one server and
one transport per request, no session id, `enableJsonResponse` so a tool call
is one POST and one JSON reply. `GET` and `DELETE` are 405 — there is no stream
to resume and no session to end. `maxDuration` is 60 s, `POST /api/ask`'s
budget, because the `ask` tool is a whole question.

## 2. Auth: Supabase Auth's OAuth 2.1 server

### Why this path

The MCP authorization spec makes an MCP server a plain OAuth resource server: it
verifies bearer tokens and tells clients, through two well-known documents,
where to get one. The project's Supabase Auth can be that authorization server:
it runs an **OAuth 2.1 server** (authorization-code + PKCE, dynamic client
registration, the metadata document MCP clients expect), and its access tokens
are ordinary Supabase user JWTs — `aud: authenticated`, `sub` the user, plus a
`client_id` claim — so every user-side call runs under RLS as the user and
`ask_reserve_question()` counts the question against the right account. The
evidence, read on 2026-10-15:

- `auth.oauth_clients`, `auth.oauth_authorizations`, `auth.oauth_consents` and
  `auth.oauth_client_states` exist on project `pouxujkhtbvkdwbzfvka` (the
  GoTrue build has the feature; `oauth_clients.registration_type` tells a
  dynamically registered client from a manual one).
- `GET https://pouxujkhtbvkdwbzfvka.supabase.co/auth/v1/.well-known/oauth-authorization-server`
  answers `404 {"error_code":"feature_disabled","msg":"OAuth server is disabled"}`
  — present, switched off.
- The docs: [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server),
  [Getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
  [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
  The feature is in beta and free on every plan.

Personal access tokens (a Settings › Connectors page, `adv_…` tokens hashed in
a table) were the fallback. They are **not built**; §8 says what they would
need. The code is already shaped for them: `McpCaller.kind` is `"session"` for
an OAuth token and `"token"` for a PAT, and the `ask` tool refuses the second
kind with `ASK_NEEDS_SESSION_MESSAGE` because a PAT has no `auth.uid()` to
reserve a question for.

### How a connection goes

1. The client POSTs to `/api/mcp` with no token and gets `401` with
   `WWW-Authenticate: Bearer realm="Advantage Ask", resource_metadata="https://<host>/.well-known/oauth-protected-resource/api/mcp"`.
2. It reads that document (RFC 9728): `resource` is `https://<host>/api/mcp`,
   `authorization_servers` is `["https://pouxujkhtbvkdwbzfvka.supabase.co/auth/v1"]`.
3. It reads the authorization server's metadata (RFC 8414) at
   `https://pouxujkhtbvkdwbzfvka.supabase.co/.well-known/oauth-authorization-server/auth/v1`
   — the authorize, token and registration endpoints. (This host also serves
   `/.well-known/oauth-authorization-server` as a pass-through of the same
   document, for clients written against the 2025-03-26 spec that look on the
   MCP server's host instead.)
4. It registers itself (dynamic client registration) or uses a pre-registered
   client id, then sends the person to Supabase's authorize endpoint, which
   redirects them to **this app's consent page**, `/oauth/consent?authorization_id=…`.
   A signed-out person goes through `/login` first and comes back.
5. The person presses **Allow** (or **Deny**). The page's Server Action tells
   Supabase the decision with the person's own session token
   (`POST /auth/v1/oauth/authorizations/{id}/consent`) and redirects to the
   client's callback with the authorization code.
6. The client exchanges the code for an access token and a refresh token at
   Supabase's token endpoint, and sends `Authorization: Bearer <access token>`
   on every call to `/api/mcp`.
7. `/api/mcp` refuses a token not shaped like a JWT before any network call,
   then verifies the rest on every request by asking Supabase Auth who it is
   (`auth.getUser(token)` — signature, expiry, a live user). Only then is the
   payload decoded, to require the `client_id` claim the OAuth server adds: an
   ordinary session token is refused. The call runs as that user.

The installed `@supabase/supabase-js` (2.57) predates
`auth.oauth.getAuthorizationDetails()` / `approveAuthorization()` /
`denyAuthorization()`, so the consent page calls the same two GoTrue endpoints
those helpers wrap (`src/lib/auth/oauth-consent.ts`). When the client library is
next upgraded the page can switch to them; nothing else changes.

### What to switch on in the Supabase dashboard

The OAuth server is a project setting the API does not expose. For project
`advantage-dashboard` (`pouxujkhtbvkdwbzfvka`):

1. **Authentication → URL Configuration → Site URL** must be the production
   app, `https://app.advantage-analytics.com`. The consent page is reached at
   Site URL + the authorization path, so this is where every connection — from
   a preview deployment or a local dev server too — comes to consent. It is
   also the one place that must serve `/oauth/consent`, which is on this
   branch.
2. **Authentication → OAuth Server**:
   - turn **Enable OAuth 2.1 server** on;
   - set **Authorization Path** to `/oauth/consent`;
   - turn **Allow dynamic client registration** on. This is what lets
     claude.ai, Claude Desktop and Claude Code register themselves on first
     connection, as the MCP spec expects. Without it, register each client by
     hand under **Authentication → OAuth Apps** (public client, redirect URIs
     `https://claude.ai/api/mcp/auth_callback` and
     `https://claude.com/api/mcp/auth_callback` for claude.ai and Desktop;
     Claude Code uses a `http://localhost:<port>/callback` it chooses per run)
     and paste the client id into the connector's advanced settings. Dynamic
     registration lets any client register, but only a client whose callback
     is one the app connects to is offered Allow on the consent page —
     `isConnectorRedirectUri()` in `src/lib/auth/oauth-consent.ts`, checked
     on the page and again in the action: Claude's two callbacks, ChatGPT's
     (`https://chatgpt.com/connector_platform_oauth_redirect`, and the
     per-app `https://chatgpt.com/connector/oauth/{callback_id}` its current
     apps register), Cursor Cloud's
     (`https://www.cursor.com/agents/mcp/oauth/callback`), and any http
     loopback address (Claude Code, Cursor desktop). Cursor's older
     `cursor://` custom-scheme callback is refused on purpose — not http(s),
     and claimable by any app that registers the scheme. Connecting another
     app means adding its callback to `CONNECTOR_REDIRECT_URIS`.
3. Optional, recommended by Supabase for OAuth: **Authentication → JWT Keys**,
   move signing to an asymmetric key (ES256/RS256). Nothing here verifies a
   token locally, so it is not required for the connector to work.

Until step 2 is done, `/.well-known/oauth-protected-resource` already answers,
`/api/mcp` already 401s correctly, and a client's discovery stops at the 404
from Supabase's metadata URL.

## 3. The tools

| Tool                   | Arguments                                                                                                                                                                             | Answers                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_workspaces`      | —                                                                                                                                                                                     | The caller's personal workspace and every program they belong to (`program_members`, own `user_id`): `program_id`, name, squad, role, status. Where a `program_id` comes from; the instructions tell a client to call it first when a team is mentioned.                                                                                                                                                |
| `list_matches`         | `program_id?`                                                                                                                                                                         | The matches in scope from `ask.matches`, newest first: id, `played_on`, opponent, score (player's seat), `i_won`, `source` (`video` / `swingvision` / null), tournament, match type, `has_stats`; `player` in a program scope. The rows a query can read.                                                                                                                                               |
| `get_match`            | `match_id`, `program_id?`                                                                                                                                                             | One match: its `ask.matches` row, both sides of `ask.match_stats` (`me` / `opponent`), `insights` turned to the caller's seat (`me` / `opponent`), raw `key_moments`, `match_url`, and `share_url` when a share link exists. The two queries run with a one-match `scope_sql`, so the view decides visibility (`match_not_found`); the two columns and the token are bearer reads under RLS.            |
| `opponent_scouting`    | `opponent?`, `program_id?`                                                                                                                                                            | The Opponents page's record per opponent (`loadPersonalOpponents` / `loadTeamOpponents`, as the user): hand, backhand, played, wins, losses, form, last match, up to six recent meetings with the four measures, each measure's recent average and trend; a program scope adds the opponent's program and `faced_by`. `opponent` is a case-insensitive name filter.                                     |
| `update_match`         | `match_id`, `program_id?`, then any of `opponent_name`, `tournament_name`, `round`, `date`, `match_type`, `court_type`, `opponent_school`, `opponent_hand`, `opponent_backhand`       | **A write.** The Edit dialog's metadata fields on a match the caller _created_ (`ownMatch()`, `created_by` filtered, as `PATCH /api/matches/[id]` reads it), normalised by the same `normalizeMatchPatch()` (event-locked fields → `field_locked`, bad values → `invalid_field`), written by `ask_patch_match` as the user, read back through `ask.matches`. Never the score, the format or the player. |
| `prepare_video_upload` | `opponent_name`, `date`, `provider?` (`advantage_intelligence` \| `swingvision`), `score?`, `tournament_name?`, `round?`, `match_type?`, `court_type?`, `player_name?`, `program_id?` | **A write.** Builds a wizard draft (`matchDraftFromPrefill`, `src/lib/wizard/draft-from-prefill.ts`), saves it by `ask_seed_match_draft` as the user, and answers the `?draft=…&return=ask` link. The wizard resumes it on the file step and asks the three attribution answers itself; nothing is created, charged or scored here. `score` is a hint (`invalid_score` when it is not sets).            |
| `describe_views`       | `scope?` (`personal` \| `team`)                                                                                                                                                       | The five views and every column (`renderAskSchemaBlock`, so hidden columns stay hidden), the percentage definitions, and the rules a query is held to.                                                                                                                                                                                                                                                  |
| `run_query`            | `sql`, `scope_sql?`, `program_id?`                                                                                                                                                    | `checkAskSql()` first, then `ask_run_query` / `ask_run_team_query` as the caller. Rows (≤ 200, the `ask.exec_query()` cap), `row_count`, `truncated`, the scope's matches.                                                                                                                                                                                                                              |
| `ask`                  | `question`, `program_id?`, `conversation_id?`, `match_ids?`                                                                                                                           | **A write.** A whole question through `askQuestion()`, drained: headline, figures, body, visual, sources, `conversation_id`, `answer_id`, `questions_used` / `questions_cap`. Saves the exchange to the caller's Ask history and spends a monthly question, with the page's `ask_runs` record; see below for the cache.                                                                                 |

A `program_id` names a program the caller is a member of (any role); membership
is read as the caller from `program_members` before a row of the program is.
`match_ids` are the page's match tags; opponent and player tags are not exposed
— name them in the question. `ask` replays the page's answer cache for a
standalone question but never writes it (an entry must carry the page's Watch
links, which need the cookie session), and a follow-up with `conversation_id`
skips the cache entirely, as `/api/ask` does. Refusals come back as an
`isError` tool result whose text starts with a stable slug and a colon —
`sql_refused: …` — returned by the tool itself rather than thrown, so no
JSON-RPC error code is involved: `sql_refused`, `query_failed`,
`not_a_member`, `invalid_program_id`, `match_not_found`, `field_locked`, `invalid_field`, `nothing_to_change`, `invalid_score`, `question_empty`, `no_matches`, `tag_not_resolved`,
`conversation_not_found`, `rate_limited`, `daily_cap_reached`,
`ask_limit_reached`, `needs_session`, `cannot_answer`, `no_data`,
`needs_clarification`, `llm_unavailable`, `answer_failed`, `internal_error`.

## 4. The security boundary

The boundary is `POST /api/ask`'s, reused unchanged (AGENTS.md, "LLM and
email"):

- **Every SQL string** — a model's, the caller's own, the server's
  `list_matches` query — goes through `checkAskSql()` and then
  `ask_run_query` / `ask_run_team_query`, which are executable by
  `service_role` alone. The route builds the database with
  `createAskDatabase()` from the verified user id, which sends exactly those
  functions (and `ask_release_question`) to the service role with the viewer
  pinned, and drops any identity key a caller put in the arguments. The
  `ask` schema's five views and the `ask_reader` role decide what a query may
  read; a hidden column (`video_time`, seat ids) is not in the view.
- **Nothing else touches the service role.** Membership, the workspace
  list, the conversation read, the report columns (`insights`,
  `key_moments`, the share token), the two Opponents reads, the reservation,
  the save, the cache, the run record and the daily counter all run on the
  bearer client as the user, under RLS. The service client is built for
  `.rpc()` and nothing else, as the route does it. The user-side RPCs those
  reads make (`my_player_ids`, `program_roster_full`) are STABLE and called
  with `get: true`, so they pass the write guard below as GETs rather than
  needing a place on its allowlist.
- **The viewer is the token's user, verified with Supabase Auth on every
  request.** No cookie is read; nothing in a JSON-RPC body can name another
  user. There is no same-origin check because this is not a browser mutation
  — the bearer token is the credential, and a cross-site page has none.
- **Reads are read-only** at every layer: the SQL guard allows one SELECT,
  `ask.exec_query()` sets `transaction_read_only`, and the six read tools are
  annotated `readOnlyHint`; the three that write carry `readOnlyHint: false`
  and `destructiveHint: false`. What a call can change: what the page's own
  question would through `ask` (a saved answer, a run row, a question spent),
  and — since migration `20261021143857_mcp_match_writes` — the two match
  writes, `update_match` and `prepare_video_upload`, each one `ask_*`
  function the guard lists, SECURITY INVOKER, run as the user:
  `ask_patch_match` updates the metadata columns of a match whose
  `created_by` is the caller (never `score`, `format` or a seat), and
  `ask_seed_match_draft` inserts one `match_drafts` row for the caller, in a
  program only when they are a member. Neither creates a match or a job.
- **The token is wider than the tools.** It is a full user JWT, so its
  holder can do more than the nine tools offer. What it can and cannot do:
  - **Reads**: anything the person's own session can read through
    PostgREST and Storage, within RLS — every table they can see, not only
    the `ask` views.
  - **PostgREST writes are refused.** A pre-request hook
    (`public.oauth_client_request_guard()`, migration
    `20261016050115_oauth_client_read_only`, its list last re-stated in
    `20261021143857_mcp_match_writes`) refuses every non-read request
    from a token carrying `client_id`, except the ten `ask_*` functions
    this route calls as the user. `tests/mcp-auth.spec.ts` holds that list
    equal to the calls in `src/lib/services/mcp/` and the Ask modules it
    runs, so a new user-side RPC there fails CI until the migration lists
    it. Two are the match writes above (`ask_patch_match`,
    `ask_seed_match_draft`), held to the caller's own rows in SQL. The other
    eight read or write only the person's own Ask data, but some take
    free-form content: a client calling them directly could plant a cached
    answer (`ask_cache_put`) or a conversation turn the Ask page later shows
    as its own, or spend the monthly question allowance
    (`ask_reserve_question`; the daily MCP cap is only in this route).
  - **Storage writes are refused** by three restrictive policies on
    `storage.objects`.
  - **Edge Functions refuse it.** `process-match`, `generate-insights` and
    `generate-key-moments` answer a `client_id` token 403 in
    `authorizeCaller()`. They run from what is deployed; the 403 has been
    live since their 2026-10-15 redeploy, and any later deploy from this
    repo carries it.
  - **Supabase Auth's own endpoints accept it** as the person's session:
    `PUT /auth/v1/user` (email, password, metadata), MFA enrolment, identity
    linking, and `POST /auth/v1/oauth/authorizations/{id}/consent`, which
    could approve another client for the same person. Nothing in this repo
    can gate them. What limits them is Auth's own settings: **Secure email
    change** and **Secure password change** (reauthentication) in
    Authentication → Providers → Email — both on since 2026-10-16; keep them
    on — and short-lived access tokens.
  - **Realtime broadcast** is not gated; nothing here uses it.
- **The consent page cannot tell whose Claude is asking.** Someone can start
  the connector flow in their own claude.ai and send the authorize link to
  someone else; that person sees "Claude", and an Allow gives the sender's
  session a token for their account. The page names the account being
  connected and asks the person to approve only connections they started.

## 5. Connecting

**For people**: the public setup guide,
[advantage-analytics.com/mcp](https://advantage-analytics.com/mcp) (the
landing repo's `src/app/mcp/`, which `/claude` redirects to), is the one place
each app's steps are written: a tab per app with copyable commands and config,
the nine tools, privacy and troubleshooting. Change a client's steps there; the
per-client notes below are the engineering detail behind them.

**In the app**: Settings › Connections (`/dashboard/settings/connections`)
prints the address and the Claude Code command, links to the guide
(`MCP_GUIDE_URL` in `src/lib/constants.ts`), and lists the apps the person
approved with Disconnect on each. The list and the revoke call Supabase Auth's
`GET`/`DELETE /auth/v1/user/oauth/grants` with the person's own token
(`src/lib/auth/oauth-grants.ts`); revoking ends that client's sessions. The
help centre's "Using Advantage in your AI app" topic points to both. The apps are named in text only: Anthropic's trademark guidelines allow
its logo only with prior approval, and the others are treated the same. The draft listing for Claude's Connectors Directory is
[`ask-mcp-connector-directory-listing.md`](ask-mcp-connector-directory-listing.md).

Every client below takes the same address. The consent page prints the
client's registered name, so a person connecting ChatGPT sees "ChatGPT" and
approves that.

**claude.ai and Claude Desktop** (custom connectors are shared between them):
Settings → Connectors → **Add custom connector** → name "Advantage", URL
`https://app.advantage-analytics.com/api/mcp` → Add → **Connect**. The sign-in
and the consent page open in a browser tab; after Allow, the nine tools appear
in the chat's tool menu. Team workspaces share a connector once an admin adds
it.

**Claude Code**:

```bash
claude mcp add --transport http advantage https://app.advantage-analytics.com/api/mcp
```

then `/mcp` inside a session to run the sign-in. Claude Code registers itself
with dynamic registration and listens on a local port for the callback.

**ChatGPT**: Settings → Apps & Connectors → **Create** → name "Advantage",
MCP server URL `https://app.advantage-analytics.com/api/mcp`, authentication
OAuth → Create, then **Connect**. ChatGPT sends a `resource` parameter on the
authorize and token requests, which Supabase records on the authorization
(§8); nothing here needs it.

**Cursor**: add to `.cursor/mcp.json` (or the global `~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "advantage": { "url": "https://app.advantage-analytics.com/api/mcp" }
  }
}
```

then sign in from the MCP settings pane. Cursor desktop listens on a local
port (`http://localhost:8787/callback` by default) for the callback; Cursor
Cloud uses its own `https://www.cursor.com/…` callback.

**A local dev server** can be connected from Claude Code the same way with
`http://localhost:3000/api/mcp`: discovery, registration and the token exchange
all talk to the live Supabase project, the consent page is production's (Site
URL), and the token that comes back works against a local server because it is
a project-wide user token. claude.ai cannot reach a local server.

A script or a curl needs an access token the OAuth server issued (one with a
`client_id` claim); the session token a `signInWithPassword` returns is
refused. The specs fake `verifyBearerUser()` rather than mint one.

## 6. Limits

| Limit                   | Value                        | Where it lives                                                                                                                                                    |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calls per window (soft) | 60 per user per 5 minutes    | In memory, per server instance (`sharedRateLimiter()`); `rate_limited`, with a retry time                                                                         |
| Calls per day (hard)    | 500 per user per UTC day     | `ask_mcp_usage`, counted by `ask_mcp_count_call()` as the user; `daily_cap_reached`. Fails closed: a count that cannot be taken is `rate_limited` (retry in 30 s) |
| Questions per month     | The account's Ask allowance  | `ask_reserve_question()`, as on the page; `ask_limit_reached`                                                                                                     |
| Rows per query          | 200                          | `ask.exec_query()`; `truncated: true` when hit                                                                                                                    |
| SQL length              | 20,000 characters per string | `run_query`'s schema                                                                                                                                              |
| Question length         | 1,000 characters             | `MAX_ASK_QUESTION_LENGTH`                                                                                                                                         |
| Request body            | 64 KiB                       | The transport                                                                                                                                                     |
| Time                    | 60 s per request             | `maxDuration`; the client going away aborts the model call                                                                                                        |

The counter table is readable by its owner only and written by the function
alone (`supabase/migrations/20261015095315_ask_mcp_usage.sql`).

## 7. Observability

- `mcp_tool_call` in PostHog, per call: `tool`, `duration_ms`, `ok`,
  `error_code` (the slug, or null), `auth` (`session`). Never the SQL, the
  question or a row.
- `ask_run` for every `ask` call, the page's own event with `trigger: "mcp"`,
  and a row in `ask_runs` as the asker — so the connector's questions show up
  in the same reports as the page's.
- The LLM calls land under one trace per request, as `/api/ask`'s do
  (`askAdapterModel`).

## 8. Not done, and open

**Known limits**

- **Writes are gated on `client_id`** in PostgREST, Storage and the Edge
  Functions (§4), and **consent on the callback** (§2). Supabase Auth's own
  endpoints accept the token as the person's session, limited only by the
  Auth settings §4 names. Realtime broadcast is not gated.
- The 401's metadata URL and the resource document name `mcpOrigin()`
  (`NEXT_PUBLIC_SITE_URL`, then Vercel's variables) on a production build;
  the request's own origin stands in only outside one.

- **The full video upload from Claude Code** — tools that create the match
  and the job, mint the Azure SAS, hand back a `curl`/`az` command for the
  bytes, then a `submit_video_analysis` that takes the three attribution
  answers explicitly and spends credit hours — is deliberately not built.
  The fps/resolution/trim checks run only in the browser
  (`splitstep-validator.ts`, `probe.ts`); a server-side probe would have to
  come first, and `uploadEligibility` / `reserveQuota` would need a bearer
  path. `prepare_video_upload`'s draft handoff is the shape until then.
- **Personal access tokens** (the fallback path): a `Settings › Connectors`
  page, an `ask_api_tokens` table (hash + prefix, owner RLS, last-used,
  revoke), a service-only lookup function, and `_as` forms of
  `ask_mcp_count_call` and the membership read. Worth doing only if a client
  turns up that cannot do OAuth; `McpCaller.kind === "token"` and the `ask`
  refusal are already in place for it.
- **`@supabase/supabase-js` upgrade**, then the consent page uses
  `auth.oauth.*` instead of `src/lib/auth/oauth-consent.ts`'s two fetches.
- **Resource indicators** (RFC 8707): the metadata advertises
  `resource`, ChatGPT sends it on authorize and token, and Supabase records
  it on the authorization, but the token's `aud` stays `authenticated` and
  the route does not check a resource claim.
  A Custom Access Token Hook could set it if a second resource server ever
  shares the project's tokens.
- **The OpenAPI file** (`openapi/advantage-api.yaml`) does not yet describe
  `/api/mcp` or the two well-known routes.
- The eyes-on and live specs have not exercised the consent page or a real
  token; the dashboard switch (§2) is on, so nothing blocks adding them. The
  last walk with a real token (2026-10-16) covered the first four tools; the
  three reads and two writes added since (PRs #515, #517) have not been
  called through a live connector.
