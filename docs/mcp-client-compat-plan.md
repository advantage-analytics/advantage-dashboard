# MCP client compatibility and new tools — findings, plan and status

**Point-in-time (2026-11-12).** Phase 0 findings (§1–§10, as written before
any change) and what has been done since (§0).

## 0. Status after Phase 1

**Done in the Supabase dashboard**

- JWT signing moved to ES256; the HS256 secret kept as a previous key.
- "Verify JWT with legacy secret" turned off on the three Edge Functions,
  before the rotation. The rotation dialog named them: with ES256 user tokens
  the gateway would have refused `/api/upload`'s call to `process-match`,
  and that route logs the failure without failing the upload.
- **ChatGPT now signs in**: its token exchange answered 200 at 20:23 UTC
  where three earlier attempts answered 500, and it lists the ten tools then
  in production.

**Done in code (this branch, not deployed)**

| Plan item                     | Outcome                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| F2 scope in the 401 challenge | **Dropped.** The key rotation fixed ChatGPT; this would only have added risk for Claude                                                 |
| F3 Gemini callback            | Allowed as a strict one-segment pattern. Still unconfirmed against a real registration                                                  |
| F4 `openWorldHint`            | `false` on every tool, with `destructiveHint: false`                                                                                    |
| F5 schemas                    | No `anyOf`, `format`, `default` or null types. `update_match` empties a field through `clear` instead of null — **an interface change** |
| F6 tracking                   | `client` and `client_agent` on `mcp_tool_call`; new `mcp_auth_failed`                                                                   |
| F7 tests                      | Schema subset, names and titles, annotations, the Gemini callback and its look-alikes, both new tools                                   |
| Edge Function setting         | Pinned in `supabase/config.toml` and stated in `AGENTS.md`                                                                              |
| `open_visualization`          | Built: a link to one card, for a match or a team player's season                                                                        |
| `find_points`                 | Built: a Video-tab link by filters, by exact rally length, or by point numbers                                                          |

**Not done**

- `get_player_season` and the net-game breakdown in `get_match`. The season
  loaders call `program_roster_full` as a POST, which the connector's write
  guard refuses, and lobs come from the ball-paths files that only the
  service role reads — a fourth service-role use `AGENTS.md` rules out for
  this route. Needs a decision before it is built.
- Recorded request fixtures per client, and the "same five questions"
  comparison: both need each app connected to this branch.
- Refresh-token rotation and PKCE tests: both are Supabase Auth's behaviour,
  not this repo's code.
- The landing page's Gemini tab copy (§11) is drafted; the other repo is
  untouched.
- **Live verification in ChatGPT, Gemini and Cursor of this branch.** Only
  Claude Code has run tools, against production's older build.

## 1. Results today

| App                          | Works today                            | Evidence                                                                                                                                                                                                        | Fix         |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Claude Code                  | **Yes**                                | This session's connector ran `list_workspaces`, `list_matches`, `describe_views` against production                                                                                                             | None        |
| Claude (claude.ai / Desktop) | **Yes, by logs only**                  | Token refreshes from Claude's backend answer 200 through today; four live consents. Not walked in a browser this round                                                                                          | None        |
| ChatGPT                      | **No**                                 | Registers and reaches consent, then `POST /auth/v1/oauth/token` → 500, three times on 2026-11-12, auth log: `HS256 is not supported for ID token signing`                                                       | F1 (or F2)  |
| Gemini app                   | **Not tested; two blockers predicted** | Its callback is not on the consent allow-list, and Google's guide says it requests `openid` by default, which is the ChatGPT failure                                                                            | F1 + F3     |
| Cursor                       | **Not tested**                         | Both documented callbacks (`localhost:8787/callback`, `www.cursor.com/agents/mcp/oauth/callback`) are already allowed; Cursor takes scopes from the server's `scopes_supported`, so it may ask for `openid` too | Probably F1 |

Nothing was tested in the ChatGPT, Gemini or Cursor UIs: the built-in browser
is signed out of ChatGPT and Gemini, and ChatGPT cannot finish sign-in until
F1 lands anyway. There are **no screenshots or tool-call wordings yet** — §7
says what is needed to get them.

## 2. Why ChatGPT fails

1. ChatGPT registers by dynamic registration (public client, callback
   `https://chatgpt.com/connector/oauth/{id}` — already allowed).
2. It asks for `openid email offline_access`. Claude and Claude Code ask for
   `email offline_access` only (read from `auth.oauth_consents`).
3. `openid` makes Supabase Auth issue an ID token. The project still signs
   with the legacy HS256 secret (`/auth/v1/.well-known/jwks.json` is
   `{"keys":[]}`), and Supabase refuses to sign ID tokens with HS256, so the
   token endpoint answers 500 after the person has pressed Allow.

`ask-mcp-connector.md` §2 step 3 calls the asymmetric key "optional". It is
required for any client that asks for `openid`.
[Supabase's OAuth server guide](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
says the same: ID tokens need an asymmetric algorithm.
[OpenAI's auth guide](https://developers.openai.com/apps-sdk/build/auth) says
ChatGPT requests the OIDC scopes the authorization server advertises;
Supabase's metadata advertises `openid`, and that document is not ours to edit.

## 3. The server as built

- **Transport**: Streamable HTTP, stateless, JSON replies, one server per
  request. `GET`/`DELETE` 405. No SSE. `maxDuration` 60 s.
- **401**: carries `WWW-Authenticate: Bearer realm=…, resource_metadata=…`.
  No `scope` parameter.
- **Discovery**: protected-resource metadata at both the root and
  path-specific URLs; authorization-server metadata passed through from
  Supabase. Supabase advertises DCR, `S256` **and `plain`** PKCE, refresh
  tokens, and no `client_id_metadata_document_supported`.
- **Redirect allow-list** (`isConnectorRedirectUri`): Claude ×2, ChatGPT
  (fixed and per-app), Cursor Cloud, http loopback. No wildcards.
- **CORS**: open `GET` on the two metadata routes only. `/api/mcp` answers
  `OPTIONS` 204 with no CORS headers, which is right: no listed client calls
  it from a browser.
- **Tools** (ten): all have a `title`, `readOnlyHint` and `idempotentHint`;
  the three writes add `destructiveHint: false`. **None sets
  `openWorldHint`.** Results carry text and `structuredContent`. Names are
  short ASCII snake_case.
- **Input schemas as emitted**: JSON Schema draft-07. Every uuid carries
  `format: uuid` plus a 150-character `pattern`. `update_match` has eight
  `anyOf: [string, null]` properties. `prepare_video_upload.provider` has a
  `default`. `list_workspaces` has empty `properties`.

## 4. Fixes, smallest first

| #   | Fix                                                                                                                                                                                                                                                                      | Proof                                                                                                                                                               | Who                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| F1  | **Move Supabase JWT signing to an asymmetric key (ES256)** in Authentication → JWT Keys. Unblocks ChatGPT, and Gemini and Cursor if they ask for `openid`.                                                                                                               | §2 auth log                                                                                                                                                         | You, in the dashboard |
| F2  | Add `scope="email offline_access"` to the 401's `WWW-Authenticate`. OpenAI and Anthropic both document that a challenge scope is honoured. This **may** stop ChatGPT asking for `openid` without F1; unproven until tried.                                               | [OpenAI auth](https://developers.openai.com/apps-sdk/build/auth), [Claude auth](https://claude.com/docs/connectors/building/authentication.md)                      | Code                  |
| F3  | Allow Gemini's callback: `https://oauth-redirect.googleusercontent.com/r/{id}` as a strict one-segment pattern, like ChatGPT's. Confirm the exact value from the first registration row before merging; the consumer help page prints none. Update the refusal sentence. | [Google OAuth guide](https://developers.google.com/connected-apps/mcp/oauth)                                                                                        | Code                  |
| F4  | Set `openWorldHint: false` on every tool. OpenAI lists it as required; Gemini asks for confirmation when it is true, and the spec's default is true.                                                                                                                     | [Apps SDK reference](https://developers.openai.com/apps-sdk/reference), [Gemini server guide](https://developers.google.com/connected-apps/mcp/server-optimization) | Code                  |
| F5  | Flatten input schemas: drop `format` and the long uuid `pattern` from what is emitted, replace `update_match`'s nullable fields with plain strings plus a `clear` list of field names, drop the `default`. zod on the server stays as strict as today.                   | Gemini: avoid `anyOf`; Copilot Studio truncates multi-type schemas                                                                                                  | Code                  |
| F6  | PostHog: add `client` to `mcp_tool_call` (from `initialize`'s `clientInfo.name`, falling back to the user agent family), plus `mcp_auth_failed` on the 401 with a refused token. No token, URL or personal data.                                                         | Prompt                                                                                                                                                              | Code                  |
| F7  | Tests listed in the prompt, plus a schema validator for the strictest subset and a redacted fixture per client once each has connected.                                                                                                                                  | —                                                                                                                                                                   | Code                  |

Not needed: SSE (no listed client requires it), CORS on `/api/mcp`, Client ID
Metadata Documents (Supabase does not offer them; every listed client falls
back to DCR, and Gemini requires DCR).

### Risks to what works today

- **F1 is the only risky step.** Nothing in this repo verifies a token
  locally (`getUser()` everywhere; `auth-user-server.ts` says why), so the
  app should not notice. Follow Supabase's rotation order (add the new key
  as standby, rotate, leave the legacy secret un-revoked) so existing
  sessions, the anon key and the service key keep working. Check the Edge
  Functions and the playback worker for anything that reads the JWT secret
  before rotating.
- **F2** changes what Claude requests only if Claude was relying on the
  resource metadata's `scopes_supported`; the value is the same set it uses
  today.
- **F5** changes `update_match`'s arguments. Connected clients re-read the
  tool list, but ChatGPT needs **Refresh** pressed on the connector.
- **Refresh tokens**: Supabase rotates them; Google's guide says Gemini
  expects the same refresh token back. Watch for Gemini sessions that drop
  after an hour. Nothing to change until that is seen.
- Supabase advertises `plain` PKCE. Every listed client sends S256. Closing
  `plain` is a Supabase setting if one exists; otherwise a known limit.

## 5. Per-client facts

| Client      | Callback                                                                                   | Registration                     | Read vs write                                                                                                                         | Limits                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Claude      | `https://claude.ai/api/mcp/auth_callback` (and `claude.com`)                               | DCR, a new client per connection | Read-only tools run without a prompt; others ask                                                                                      | 240 s per call, ~150,000 characters per result                                                          |
| Claude Code | `http://localhost:<port>/callback`                                                         | DCR                              | Per the user's permission mode                                                                                                        | 25,000-token result cap                                                                                 |
| ChatGPT     | `https://chatgpt.com/connector/oauth/{id}` or the fixed legacy one                         | CIMD preferred, DCR fallback     | Pro: read tools only. Business/Enterprise/Edu: writes, with confirmation. Plus is not confirmed by any OpenAI page that could be read | Timeout and schema subset not documented                                                                |
| Gemini app  | `https://oauth-redirect.googleusercontent.com/r/*`                                         | DCR required                     | Every write is confirmed. A tool without `readOnlyHint` is treated as destructive                                                     | US, 18+, personal account, English, Keep Activity on. No `structuredContent`. Protocol up to 2025-11-25 |
| Cursor      | `http://localhost:8787/callback`; Cloud `https://www.cursor.com/agents/mcp/oauth/callback` | DCR                              | Asks before each tool by default                                                                                                      | About 40 tools reach the agent (forum, not docs)                                                        |

On ChatGPT Pro, `ask`, `update_match` and `prepare_video_upload` will not be
callable: they are honestly write tools. `ask` is the one to think about —
it only writes to the person's own Ask history — but it also spends a
question, so it stays marked as a write.

The slowest tool is `ask`, bounded by `maxDuration` 60 s. Claude allows 240 s;
the others publish no figure.

## 6. New tools

### 6.1 What the app already supports by URL

- **Match visualizations**: `/dashboard/matches/{id}?tab=shots&cut=…` opens
  one card in the lightbox. Cuts: `serve`, `returnPlacement`,
  `returnContact`, `rallyPlacement`, `rallyPosition`, `errors`. Filters:
  chart type, player, set, serving/returning, first/second, court, zone,
  result, pressure, rally band, error kind, and the full Video filter set
  (`vf`). Parsed in `shots/viz-url.ts`.
- **Team player season visualizations**:
  `/dashboard/team/roster/{playerId}?tab=visualizations&…`, the same
  parameters plus opponent hand, result, surface and chosen matches.
- **Video**: `/dashboard/matches/{id}?tab=film&f=…` opens a filtered
  playlist (about 25 filter groups: score situation, server, court, serve
  type/spin/zone/result, return, how the point ended, rally length, custom
  shot patterns). `&pn=1,4,9` opens an exact list of up to 200 points.
  Ask's own Watch links are built this way (`ask/figure-video.ts`,
  `match-video/point-set.ts`).

### 6.2 Gaps found

1. **There is no personal player profile.** `/dashboard/statistics` is a
   Coming Soon page. A "view for a player's profile" exists only for a team
   roster player.
2. **The team profile link depends on the active workspace cookie.** Opened
   while the person's personal workspace is active, it redirects to
   `/dashboard`. A link from an AI app needs the page to accept a program in
   the URL, or it will fail for anyone who last used their personal space.
3. **No timestamp link.** The Video tab opens points, not times.
4. **Statistics the views do not carry**: the net-game breakdown (how the
   player got to the net, how the point ended, lobs, drop shots), the season
   profile cards, point notes, tags and bookmarks. Forced errors, return
   contact depth, serve placement and net-point counts are already columns.
5. **Rally bands disagree.** The ask views and `match_stats` use 1–4 / 5–9 /
   10+; the Video and Visualizations filters use 1–4 / 5–8 / 9+. A link
   built from a query would show a different count from the answer.

### 6.3 Proposed tools (all read-only)

| Tool                 | Takes                                                                               | Returns                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `open_visualization` | `match_id` **or** `player_id` + `program_id`; `cut`; flat optional filters as enums | The absolute URL of that card with those filters, its title, and how many shots it draws. Built with the app's own `vizStateQuery` |
| `find_points`        | `match_id`; flat optional filters mirroring the Video filter groups                 | Matching point numbers, a count, and the `?tab=film&f=…` URL; `&pn=` when the caller passes point numbers from a query             |
| `get_player_season`  | `player_id`, `program_id`                                                           | The season cards' figures: head-to-head, differential, game profile, point endings, rally length, net game                         |

`get_match` gains the net-game breakdown and a `video_url` when the match has
video. Thirteen tools in total, well inside every client's limits.

"Create a view" is read here as **open a view by link**. Saving a named view
to the person's account is a fourth write tool and a new RPC on the
`client_id` guard's allow-list; it is left out unless wanted (§8).

### 6.4 Work this needs first

- The filter codecs live under `src/components/…` (`match-filters/model.ts`,
  `shots/viz-url.ts`). The server must import them without pulling client
  code; if they are not already pure, move the codec to `src/lib/`.
- Fix gap 2 (program in the URL) before `open_visualization` returns team
  links.
- Decide gap 5 before `find_points` ships a rally filter.
- Notes and tags need a sixth `ask` view (a migration, `ask_reader` grants,
  the schema registry). Proposed as a follow-up, not part of this branch.

## 7. Live verification still to do

After F1–F5 are on a `[preview]` build:

1. MCP Inspector against the preview: `initialize` → `tools/list` → one call.
2. **ChatGPT and Gemini** in the built-in browser. You sign in on each tab;
   the rest is driven from here. Gemini needs a US personal account, 18+.
3. **Cursor** desktop: add the URL to `~/.cursor/mcp.json`, sign in.
4. In each app, the same five questions; record which tool it picks, the
   exact tool-call wording, a screenshot, and the redacted requests.
5. Re-walk Claude and Claude Code to show nothing regressed.

## 8. Listings

**No app requires a listing for a person to add Advantage by URL.** Listings
only make it findable inside the app.

| Platform | Listing today                                                                                                    | If listed, what a tool change needs                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude   | Draft in the portal, **never submitted** (`ask-mcp-connector-directory-listing.md`, which still says nine tools) | Nothing to resubmit; the server is read live. Tool names shown on the listing are edited in the portal and approved by a reviewer                                                    |
| ChatGPT  | None                                                                                                             | Submission needs organisation verification, a domain challenge file, privacy and terms URLs, a demo video, test cases and a test account. After listing, new tools wait for approval |
| Gemini   | None                                                                                                             | Google Connected Console: domain verification, privacy and terms URLs, icon, a test account, review. Tools are snapshotted; a change is a new version and a new review               |
| Cursor   | None                                                                                                             | Marketplace takes open-source plugins only. An "Add to Cursor" link needs no review                                                                                                  |

Recommendation: submit Claude's listing after this branch ships, with the
draft updated to the final tool list. Leave ChatGPT and Gemini until the
custom-URL path has been used by real coaches.

## 9. Not in scope

- **Microsoft 365 Copilot**: no add-by-URL. It needs an agent package, a
  tenant admin to allow it, and a client **secret** from dynamic
  registration (Supabase registers ChatGPT-style public clients without
  one), or a pre-registered client with callback
  `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`. Copilot
  Studio also drops tools whose inputs use `$ref` and truncates multi-type
  schemas; F5 covers that.
- **Mistral Le Chat**: Streamable HTTP with dynamic registration,
  auto-detected from the 401. Mistral publishes no callback URL, so the
  allow-list entry has to come from a first registration attempt. Cheap once
  F1 is in; not started.

## 10. Decisions needed

1. Go ahead with F1 in the Supabase dashboard?
2. "Create views": link only, or also save a named view to the account?
3. A personal profile page does not exist. Is a team-player link enough for
   now?
4. Which rally bands are right: 5–9 / 10+ or 5–8 / 9+?

## 11. Landing page: Gemini tab copy

For `advantage-landing`, `src/app/mcp/content.tsx`. Not yet checked against a
real connection — confirm the menu names when Gemini is first connected.

**Tab label**: Gemini

**Before you start**: Custom apps in Gemini are available in the US, to
people 18 or over, on a personal Google account (not a work or school one),
with Gemini set to English and Keep Activity turned on.

**Steps**

1. Open [gemini.google.com](https://gemini.google.com) on a computer.
2. Go to **Settings → Connected Apps → Add a custom app**.
3. Paste `https://app.advantage-analytics.com/api/mcp` and continue.
4. Sign in to Advantage when the window opens, check it names the account
   you expect, and press **Allow**.
5. Ask Gemini about your matches. Once added on the web, Advantage also
   works in the Gemini mobile app.

**Good to know**: Gemini asks you to confirm before it changes anything —
fixing a match's details, starting an upload, or asking Advantage a question
that uses one of your monthly questions.

**Troubleshooting**

- _"This app can't connect to Advantage"_ on the Allow page: contact us; the
  app's return address is not one we recognise yet.
- _No "Add a custom app" option_: check the account is a personal one, in the
  US, and that Keep Activity is on.
- _It stops working after a while_: remove the app in Connected Apps and add
  it again.
