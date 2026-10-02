# Generate Key Moments Edge Function

Turns a match's point log into the short "key moments" list the match report
shows (`matches.key_moments`, a JSONB array of `{ moment, description }`).

## Provenance

Until 2026-09-26 this function existed only as a deployment on the live
project (`pouxujkhtbvkdwbzfvka`) — it had never been committed to this
repository. `index.ts` was fetched that day with the Supabase MCP
`get_edge_function` (deployed version 22) and committed byte for byte; the
caller check described below is the one change made on top of that fetch. The
header comment in `index.ts` records the same.

## What it does

```
1. Verifies the caller (see "Edge function auth" below)
2. Reads `match_id` from the body
3. Checks the caller may touch that match
4. Calls the `key_moments(target_match_id)` Postgres function via RPC — one row
   per candidate point, with the game/set context already computed in SQL
5. Maps each row onto the first matching moment type:
   Strong Finish · Clutch Hold · Clutch Break / Break Back / Clutch Break Back ·
   Missed Opportunity · Momentum Shift · Break in Set N, Game M
   (rows that match none are dropped)
6. Writes the array to `matches.key_moments` for that one match
```

Both database calls are filtered to the body's `match_id`: the RPC takes it as
its only argument and the write is `.eq("id", match_id)`.

## Deployment

Deploying is a separate, user-run step — no task, gate or agent deploys this
function. Once a change is merged, deploy it with the Supabase CLI:

```bash
supabase functions deploy generate-key-moments
```

(or the Supabase MCP `deploy_edge_function`). Until that runs, the live
function is whatever was deployed last, not what this directory contains. The
same applies to `process-match` and `generate-insights`; the three are
deployed one at a time.

## Environment Variables

Provided by Supabase automatically:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Anon key, used only to verify a caller's access token
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for the RPC and the write, and
  the bearer that identifies the project's own internal caller

## Request Format

The `Authorization: Bearer …` header identifies the caller and is required
(see "Edge function auth"). The body is what `process-match` has always sent
on its chained invoke, unchanged:

```json
{
  "match_id": "uuid-of-existing-match"
}
```

Note the snake_case `match_id` — `process-match` and `generate-insights` take
`matchId`. The name is part of the live contract and was not changed.

## Response Format

Success:

```json
{
  "success": true,
  "updated_data": [
    {
      "moment": "Clutch Hold",
      "description": "Saved 2 break points in Set 1, Game 8"
    }
  ]
}
```

Error:

```json
{
  "success": false,
  "error": "Error message"
}
```

| Status | Meaning                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| 401    | No bearer, or a bearer that is neither a user's access token nor the service role key      |
| 403    | The user is not the match's uploader (or the match cannot be read / has no uploader)       |
| 500    | Missing `match_id`, the RPC failed, or the write failed (the live function's own handling) |

A 500 body is `{ "error": "…" }` without `success`, as it always was.

## Edge function auth

Three edge functions live in this directory, and they share **one rule**:

| Function               | Body                     | Writes                           |
| ---------------------- | ------------------------ | -------------------------------- |
| `process-match`        | `{ matchId, fileNames }` | `points`, `shots`, `match_stats` |
| `generate-key-moments` | `{ match_id }`           | `matches.key_moments`            |
| `generate-insights`    | `{ matchId }`            | `matches.insights`               |

**The rule.** `verify_jwt` only proves the bearer is _a_ JWT signed for the
project — the public anon key passes it — so each function checks for itself,
with the same `authorizeCaller` helper copied verbatim into each file:

- the project's **service role key** as bearer is the internal caller and is
  allowed through without a lookup;
- **any other bearer** is resolved with `auth.getUser` on an anon client and
  must equal the match's `matches.created_by`;
- no bearer or an unverifiable one is answered **401**, a signed-in user who is
  not the uploader (or a match with no uploader) **403**, both as
  `{ success: false, error }` JSON.

Every read and write each function makes stays filtered to the one match named
in its body.

**The chain.** One upload produces one pass through all three, in this order:

```
upload  →  process-match  →  generate-key-moments  →  generate-insights
```

1. `/api/upload` calls `process-match` with the **user's session** via
   `supabase.functions.invoke`, so the bearer is the uploader's access token.
2. `process-match` builds a **service-role** client, writes points, shots and
   stats, then invokes `generate-key-moments` with `{ match_id }` from that
   client — the bearer is the service role key. A failure here fails the
   upload.
3. `process-match` then invokes `generate-insights` with `{ matchId }` the same
   way. A failure here is logged and swallowed; the upload still succeeds.

The video pipeline joins the chain at step 3 only: its webhook calls
`generate-insights` through `requestMatchInsights`
(`src/lib/services/splitstep/request-insights.ts`) with an admin client, and
never calls `generate-key-moments`.

**Deploying** each function is the user's step (see "Deployment" above); the
caller checks only take effect once all three have been deployed.

## Tests

`tests/generate-key-moments-guards.spec.ts` runs `index.ts` offline in a vm
with a stubbed `Deno.serve`, env and client, and asserts 401 without a bearer,
403 for a signed-in non-uploader, and that the service-role bearer reaches the
`key_moments` RPC (its first database call) and the `matches` write, both
filtered to the body's `match_id`. The function's moment-building logic is not
exercised there; the RPC stub returns no rows.
