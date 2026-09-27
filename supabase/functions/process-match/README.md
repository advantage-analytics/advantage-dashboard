# Process Match Edge Function

This Edge Function processes uploaded SwingVision match files and persists structured data into the database tables:

- `points` - Individual point data with scores, server, winner, rally length
- `shots` - Shot-by-shot data with type, spin, speed, contact/landing positions
- `match_stats` - Aggregated statistics calculated from points/shots data

## Architecture

```
Upload Flow:
1. Frontend uploads .xlsx file to Supabase Storage
2. `/api/upload` calls process-match with the user's session (functions.invoke)
3. Edge Function verifies the caller, that they uploaded the match, that every
   file sits under their own storage folder, and that the match has no points yet
4. Downloads each file from the `match-data` bucket, parses Excel sheets
5. Builds the point and shot rows — each point gets its id here, so the shots
   can reference their points before anything is written — and calls ONE RPC,
   `import_match_rows(p_match_id, p_points, p_shots)`: a single transaction
   that takes the match's advisory lock, refuses a match that already has
   points, inserts points and shots, then runs calculate_match_stats() and
   backfill_returns_in_and_net_points(). Nothing persists unless all of it does
6. Invokes generate-key-moments, then generate-insights
7. Returns success/error
```

`import_match_rows` (`supabase/migrations/20260927040947_import_match_rows.sql`)
is `security invoker` and executable by `service_role` only — the function's
own client — so it adds no write path a user token can reach. It inserts the
rows exactly as given, through `jsonb_to_recordset` with explicit column lists;
columns it does not name (`created_at`, `flags`, `derived`, …) keep their
defaults. Its refusal of an already-processed match raises `unique_violation`
(SQLSTATE 23505), which this function answers with the same 409 as its
pre-check; any other error from the RPC is a 500 with nothing persisted.

The `match_stats` calculation is handled by a **Postgres function** (called by `import_match_rows`, not computed in the Edge Function) because:

- Runs inside the database = no network round-trips for aggregations
- SQL is optimized for COUNT/AVG operations
- Can be called independently for recalculation (e.g., after video QA edits)

## Deployment

Deploying is a separate, user-run step — no task, gate or agent deploys this
function. Once a change is merged, deploy it with the Supabase CLI:

```bash
supabase functions deploy process-match
```

(or the Supabase MCP `deploy_edge_function`). Until that runs, the live
function is whatever was deployed last, not what this directory contains.

The `import_match_rows` RPC this function calls must already be live in the
database before the function is deployed — see [Recovery](#recovery).

## Recovery

A run that fails inside `import_match_rows` persists nothing: the transaction
rolls back, the match has no `points`, `shots` or `match_stats` rows, and the
pre-check does not refuse a re-run. What a failed run does leave behind is the
`match_files` row `/api/upload` wrote before invoking this function (and the
.xlsx in the `match-data` bucket), so a second upload for the same match is
answered 409 `This match already has a file`. Two ways back, and only these:

- `DELETE /api/matches/[matchId]` as the uploader — it purges the match's
  storage and deletes the `matches` row, which cascades `match_files`,
  `points` (and through them `shots`) and `match_stats` — then upload again.
- An operator re-invoking `process-match` with the service-role bearer, the
  same `matchId` and the same `fileNames`: the file is still in the bucket,
  and the function acts as the match's uploader.

Never a hand-run `UPDATE` or `INSERT` against `points`, `shots` or
`match_stats`.

Before this RPC the function wrote in four separate statements, and a run that
died between them left a match with `points` but no `match_stats` row — every
later invoke answered 409 from the pre-check, with no way back. When the RPC
was applied (2026-09-26) the live count of such matches was **0** (26 matches
have points; all 26 have `match_stats`). Should one ever appear, the same
procedure applies minus the re-invoke branch, which the pre-check refuses
because the match has points: delete the match and upload again.

**Order of operations:** `import_match_rows` must be live in the database
BEFORE this function is deployed. A deployed function without it fails every
run at the RPC (PostgREST answers "function not found") — nothing persisted,
but nothing processed either. Until the function is deployed, the live
function keeps writing the old four-statement way. The migration is
`supabase/migrations/20260927040947_import_match_rows.sql`, applied live on
2026-09-26.

## Environment Variables

The function uses the following environment variables (automatically provided by Supabase):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Anon key, used only to verify a caller's access token
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations, and the
  bearer that identifies the project's own internal caller

## Request Format

The `Authorization: Bearer …` header identifies the caller and is required.
Two bearers are accepted:

- a signed-in user's **access token** — the user must be the match's
  `created_by`; this is what `supabase.functions.invoke` sends from
  `/api/upload`
- the project's **service role key** — the internal caller, which acts as the
  match's uploader

The public anon key is not a valid bearer on its own: `verify_jwt` lets it
through, but `auth.getUser` rejects it and the function answers 401.

```json
{
  "matchId": "uuid-of-existing-match",
  "fileNames": ["<userId>/swing-vision/<matchId>/file1.xlsx", "file2.xlsx"],
  "sourceProvider": "swing-vision" // optional, fetched from match record if not provided
}
```

- There is no `userId` field. The user is whoever the bearer verifies to (for
  the service role, the match's `created_by`); a `userId` in the body is
  ignored.
- There is no `bucketId` field. Files are always read from the `match-data`
  bucket.
- Every `fileNames` entry must resolve under the user's own folder: a full
  path must start with `<userId>/` and contain no empty, `.` or `..` segment;
  a bare file name resolves to `<userId>/<fileName>`. One entry outside that
  folder refuses the whole request before any file is downloaded.

**Note:** Only `source_provider: "swing-vision"` is currently supported. Other providers will return an error.

## Response Format

Success:

```json
{
  "success": true
}
```

Error:

```json
{
  "success": false,
  "error": "Error message"
}
```

| Status | Meaning                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | Missing `matchId`/`fileNames`, an unsupported provider, or a file outside the user's folder                                                                                    |
| 401    | No bearer, or a bearer that is neither a user's access token nor the service role key                                                                                          |
| 403    | The user is not the match's uploader (or, for the service role, the match has no uploader)                                                                                     |
| 409    | The match already has `points` rows — the pre-check, or `import_match_rows`'s own refusal when a concurrent run landed first — it has been processed and will not be run again |
| 500    | The match could not be read, or processing itself failed — nothing was persisted (see [Recovery](#recovery))                                                                   |

## Usage from Frontend

**Recommended: Using Supabase Client**

```typescript
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// The user's session token is sent as the bearer; the function verifies it
// and checks that this user uploaded the match.
const { data, error } = await supabase.functions.invoke("process-match", {
  body: {
    matchId,
    fileNames: [storagePath], // Array of storage paths under this user's folder
  },
});

if (error) {
  console.error("Error processing match:", error);
}
```

**Alternative: Direct fetch**

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const {
  data: { session },
} = await supabase.auth.getSession();

const res = await fetch(`${supabaseUrl}/functions/v1/process-match`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // The user's access token — not the anon key, which is answered 401.
    Authorization: `Bearer ${session!.access_token}`,
  },
  body: JSON.stringify({
    matchId,
    fileNames,
  }),
});
```

## Data Processing Details

### Set Point & Match Point Calculation

The function calculates `is_set_point` and `is_match_point` independently of SwingVision's "Set Point" column, which is unreliable for Sets 2 and 3.

**College Tennis Rules (No-Ad Scoring):**

- At 40-40 (deuce), the next point wins the game (no advantage)
- Sets are won at 6 games with 2+ lead, or 7-5, or tiebreak at 6-6

**Set Point Logic:**
A point is a set point when one player is at game point AND winning that game would win the set.

```typescript
function calculateSetPoint(gameScore, pointScore) {
  // Game point conditions (no-ad):
  // - Server at game point: serverPts === "40" && receiverPts !== "40"
  // - Receiver at game point: receiverPts === "40" && serverPts !== "40"
  // - Both at game point (deciding point): serverPts === "40" && receiverPts === "40"
  // Winning game wins set if:
  // - 5 games vs ≤4 games (would be 6-x with 2+ lead)
  // - 6 games vs 5 games (would be 7-5)
  // - Tiebreak at 6-6: at 6+ points with 1-point lead
}
```

**Match Point Logic:**
A point is a match point when it's a set point for a player who has won `setsToWin - 1` sets. The function tracks WHO has the set point (host vs guest), not just that someone does.

### Match Stats Calculation

`import_match_rows` calls the `calculate_match_stats(p_match_id)` Postgres function in the same transaction as the points and shots inserts; it aggregates data from the `points` and `shots` tables.

**Stats Schema (Raw Counts):**

The `match_stats` table stores raw counts, not percentages. This ensures data integrity and allows the frontend to calculate any derived metrics.

| Category         | Columns                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basic**        | `aces`, `double_faults`, `winners`, `unforced_errors`, `forced_errors`, `avg_rally_length`                                                                        |
| **Serve**        | `first_serves`, `first_serves_in`, `first_serve_points_won`, `second_serves`, `second_serves_in`, `second_serve_points_won`, `service_games`, `service_games_won` |
| **Return**       | `first_returns`, `first_return_points_won`, `second_returns`, `second_return_points_won`, `return_games`, `return_games_won`                                      |
| **Break Points** | `break_points_faced`, `break_points_saved`, `break_point_opportunities`, `break_points_converted`                                                                 |
| **Set Points**   | `set_points_faced`, `set_points_saved`, `set_point_opportunities`, `set_points_converted`                                                                         |
| **Totals**       | `total_points`, `total_points_won`                                                                                                                                |
| **Shot Types**   | `service_winners`, `forehand_winners`, `backhand_winners`, `forehand_unforced_errors`, `backhand_unforced_errors`, `volley_winners`                               |

**Calculating Percentages (Frontend):**

```typescript
// First Serve Percentage
const firstServePct = (stats.first_serves_in / stats.first_serves) * 100;

// First Serve Points Won %
const firstServeWonPct =
  (stats.first_serve_points_won / stats.first_serves_in) * 100;

// Serve Rating (composite metric)
const serveRating =
  (stats.first_serves_in / stats.first_serves) * 100 + // 1st Serve %
  (stats.first_serve_points_won / stats.first_serves_in) * 100 + // 1st Serve Won %
  (stats.second_serve_points_won / stats.second_serves_in) * 100 + // 2nd Serve Won %
  (stats.service_games_won / stats.service_games) * 100 + // Service Games Won %
  stats.aces -
  stats.double_faults;

// Break Points Saved %
const bpSavedPct = (stats.break_points_saved / stats.break_points_faced) * 100;
```

**Database VIEW (Optional):**

A convenience view `match_stats_with_percentages` is available that pre-calculates all percentages:

```sql
SELECT * FROM match_stats_with_percentages WHERE match_id = 'uuid';
-- Returns all raw counts PLUS calculated: first_serve_pct, first_serve_won_pct,
-- second_serve_won_pct, service_games_won_pct, break_points_saved_pct,
-- break_points_converted_pct, total_points_won_pct, serve_rating, etc.
```

**Recalculating Stats:**

Stats can be recalculated at any time by calling the function directly:

```typescript
// From frontend (e.g., after video QA corrections)
await supabase.rpc("calculate_match_stats", { p_match_id: matchId });
```

```sql
-- From SQL
SELECT calculate_match_stats('907f0e40-e323-4e77-a160-0efa81bfc5d7');
```

### ExcelJS Object Handling

The `safeString()` helper function handles various ExcelJS cell value formats:

- Rich text cells (extracts from `richText` array)
- Cells with `text` property
- Formula cells (extracts from `result` property)
- Empty objects (returns `null`, not `"[object Object]"`)

This prevents data corruption when Excel cells have formatting or formulas that return empty values.
