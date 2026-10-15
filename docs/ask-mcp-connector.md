# The Ask MCP connector

**Current state (2026-10-15).** Slice 3 of the Ask roadmap
([`ask-improvement-roadmap.md`](ask-improvement-roadmap.md), §4 item 10): a
remote [MCP](https://modelcontextprotocol.io) server at `/api/mcp` that lets a
player or coach use **their own Claude** — claude.ai, Claude Desktop, Claude
Code — over **their own match data**, inside the same security boundary the
Ask page already has. Built on `claude/ask-mcp-connector`; the one thing it
needs that code cannot do is the dashboard switch in §2.

## 1. What it is

| Piece                                                   | Where                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The server (four tools)                                 | [`src/lib/services/mcp/server.ts`](../src/lib/services/mcp/server.ts)                                          |
| The HTTP route (Streamable HTTP, stateless, JSON reply) | [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts)                                                      |
| Token verification                                      | [`src/lib/supabase/bearer.ts`](../src/lib/supabase/bearer.ts)                                                  |
| OAuth discovery documents                               | `src/app/.well-known/oauth-protected-resource/`, `src/app/.well-known/oauth-authorization-server/`             |
| The consent screen                                      | [`src/app/(auth)/oauth/consent/`](<../src/app/(auth)/oauth/consent/page.tsx>), `src/lib/auth/oauth-consent.ts` |
| Limits                                                  | [`src/lib/services/mcp/rate-limit.ts`](../src/lib/services/mcp/rate-limit.ts), `ask_mcp_usage`                 |
| Specs                                                   | `tests/mcp-route.spec.ts` (the HTTP ladder and the tools), `tests/mcp-auth.spec.ts` (the pure pieces)          |

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
7. `/api/mcp` verifies the token on every request by asking Supabase Auth who
   it is (`auth.getUser(token)` — signature, expiry, a live user; never a claim
   decoded locally), and runs the call as that user.

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
     registration lets any client register; what each one can do is still
     only what the signed-in person approves, over their own rows.
3. Optional, recommended by Supabase for OAuth: **Authentication → JWT Keys**,
   move signing to an asymmetric key (ES256/RS256). Nothing here verifies a
   token locally, so it is not required for the connector to work.

Until step 2 is done, `/.well-known/oauth-protected-resource` already answers,
`/api/mcp` already 401s correctly, and a client's discovery stops at the 404
from Supabase's metadata URL.

## 3. The tools

| Tool             | Arguments                                                   | Answers                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_matches`   | `program_id?`                                               | The matches in scope from `ask.matches`, newest first: id, `played_on`, opponent, score (player's seat), `i_won`, `source` (`video` / `swingvision` / null), tournament, match type, `has_stats`; `player` in a program scope. The rows a query can read. |
| `describe_views` | `scope?` (`personal` \| `team`)                             | The five views and every column (`renderAskSchemaBlock`, so hidden columns stay hidden), the percentage definitions, and the rules a query is held to.                                                                                                    |
| `run_query`      | `sql`, `scope_sql?`, `program_id?`                          | `checkAskSql()` first, then `ask_run_query` / `ask_run_team_query` as the caller. Rows (≤ 200, the `ask.exec_query()` cap), `row_count`, `truncated`, the scope's matches.                                                                                |
| `ask`            | `question`, `program_id?`, `conversation_id?`, `match_ids?` | A whole question through `askQuestion()`, drained: headline, figures, body, visual, sources, `conversation_id`, `answer_id`, `questions_used` / `questions_cap`. Same reservation, answer cache and `ask_runs` record as the page.                        |

A `program_id` names a program the caller is a member of (any role); membership
is read as the caller from `program_members` before a row of the program is.
`match_ids` are the page's match tags; opponent and player tags are not exposed
— name them in the question. Refusals come back as the SDK's `isError` tool
result whose text starts with a stable slug: `sql_refused`, `query_failed`,
`not_a_member`, `invalid_program_id`, `no_matches`, `tag_not_resolved`,
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
- **Nothing else touches the service role.** Membership, the conversation
  read, the reservation, the save, the cache, the run record and the daily
  counter all run on the bearer client as the user, under RLS. The service
  client is built for `.rpc()` and nothing else, as the route does it.
- **The viewer is the token's user, verified with Supabase Auth on every
  request.** No cookie is read; nothing in a JSON-RPC body can name another
  user. There is no same-origin check because this is not a browser mutation
  — the bearer token is the credential, and a cross-site page has none.
- **Reads are read-only** at every layer: the SQL guard allows one SELECT,
  `ask.exec_query()` sets `transaction_read_only`, and the tools are annotated
  `readOnlyHint`. The only thing a call changes is what the page's own
  question would: a saved answer, a run row, a cache entry, a question spent.

## 5. Connecting

**claude.ai and Claude Desktop** (custom connectors are shared between them):
Settings → Connectors → **Add custom connector** → name "Advantage", URL
`https://app.advantage-analytics.com/api/mcp` → Add → **Connect**. The sign-in
and the consent page open in a browser tab; after Allow, the four tools appear
in the chat's tool menu. Team workspaces share a connector once an admin adds
it.

**Claude Code**:

```bash
claude mcp add --transport http advantage https://app.advantage-analytics.com/api/mcp
```

then `/mcp` inside a session to run the sign-in. Claude Code registers itself
with dynamic registration and listens on a local port for the callback.

**A local dev server** can be connected from Claude Code the same way with
`http://localhost:3000/api/mcp`: discovery, registration and the token exchange
all talk to the live Supabase project, the consent page is production's (Site
URL), and the token that comes back works against a local server because it is
a project-wide user token. claude.ai cannot reach a local server.

A script or a curl can call the server with any Supabase access token for the
user — the one a `signInWithPassword` returns works — which is how the specs'
fixtures and the eval harness can drive it without a browser.

## 6. Limits

| Limit                   | Value                        | Where it lives                                                                            |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Calls per window (soft) | 60 per user per 5 minutes    | In memory, per server instance (`sharedRateLimiter()`); `rate_limited`, with a retry time |
| Calls per day (hard)    | 500 per user per UTC day     | `ask_mcp_usage`, counted by `ask_mcp_count_call()` as the user; `daily_cap_reached`       |
| Questions per month     | The account's Ask allowance  | `ask_reserve_question()`, as on the page; `ask_limit_reached`                             |
| Rows per query          | 200                          | `ask.exec_query()`; `truncated: true` when hit                                            |
| SQL length              | 20,000 characters per string | `run_query`'s schema                                                                      |
| Question length         | 1,000 characters             | `MAX_ASK_QUESTION_LENGTH`                                                                 |
| Request body            | 64 KiB                       | The transport                                                                             |
| Time                    | 60 s per request             | `maxDuration`; the client going away aborts the model call                                |

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

- **Personal access tokens** (the fallback path): a `Settings › Connectors`
  page, an `ask_api_tokens` table (hash + prefix, owner RLS, last-used,
  revoke), a service-only lookup function, and `_as` forms of
  `ask_mcp_count_call` and the membership read. Worth doing only if a client
  turns up that cannot do OAuth; `McpCaller.kind === "token"` and the `ask`
  refusal are already in place for it.
- **`@supabase/supabase-js` upgrade**, then the consent page uses
  `auth.oauth.*` instead of `src/lib/auth/oauth-consent.ts`'s two fetches.
- **Revoking a connection from inside the app.** Supabase stores consents
  (`auth.oauth_consents`); removing the connector in Claude drops the tokens on
  that side, and the dashboard's OAuth Apps page can revoke a client, but there
  is no per-user "connected apps" page here yet.
- **Resource indicators** (RFC 8707): the metadata advertises
  `resource`, and Supabase records it on the authorization, but the token's
  `aud` stays `authenticated` and the route does not check a resource claim.
  A Custom Access Token Hook could set it if a second resource server ever
  shares the project's tokens.
- **The OpenAPI file** (`openapi/advantage-api.yaml`) does not yet describe
  `/api/mcp` or the two well-known routes.
- The eyes-on and live specs have not exercised the consent page or a real
  token: the dashboard switch (§2) has to be flipped first.
