# Process Match Edge Function

This Edge Function processes uploaded SwingVision match files and persists structured data into the database tables:
- `points` - Individual point data with scores, server, winner, rally length
- `shots` - Shot-by-shot data with type, spin, speed, contact/landing positions
- `match_stats` - Aggregated statistics calculated from points/shots data

## Architecture

```
Upload Flow:
1. Frontend uploads .xlsx file to Supabase Storage
2. Frontend calls process-match Edge Function
3. Edge Function downloads file, parses Excel sheets
4. Inserts points into database
5. Inserts shots into database
6. Calls calculate_match_stats() Postgres function via RPC
7. Returns success/error
```

The `match_stats` calculation is handled by a **Postgres function** (not computed in the Edge Function) because:
- Runs inside the database = no network round-trips for aggregations
- SQL is optimized for COUNT/AVG operations
- Can be called independently for recalculation (e.g., after video QA edits)

## Deployment

Deploy this function using the Supabase CLI:

```bash
supabase functions deploy process-match
```

## Environment Variables

The function uses the following environment variables (automatically provided by Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations

## Request Format

```json
{
  "matchId": "uuid-of-existing-match",
  "userId": "uuid-of-user",
  "fileNames": ["path/to/file1.xlsx", "path/to/file2.xlsx"],
  "bucketId": "match-data",        // optional, defaults to "match-data"
  "sourceProvider": "swing-vision" // optional, fetched from match record if not provided
}
```

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

## Usage from Frontend

**Recommended: Using Supabase Client**
```typescript
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const { data, error } = await supabase.functions.invoke('process-match', {
  body: {
    matchId,
    userId,
    fileNames: [storagePath], // Array of storage paths
  },
});

if (error) {
  console.error('Error processing match:', error);
}
```

**Alternative: Direct fetch**
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const res = await fetch(`${supabaseUrl}/functions/v1/process-match`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseAnonKey}`,
  },
  body: JSON.stringify({
    matchId,
    userId,
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

After inserting points and shots, the Edge Function calls the `calculate_match_stats(p_match_id)` Postgres function which aggregates data from `points` and `shots` tables.

**Stats Schema (Raw Counts):**

The `match_stats` table stores raw counts, not percentages. This ensures data integrity and allows the frontend to calculate any derived metrics.

| Category | Columns |
|----------|---------|
| **Basic** | `aces`, `double_faults`, `winners`, `unforced_errors`, `forced_errors`, `avg_rally_length` |
| **Serve** | `first_serves`, `first_serves_in`, `first_serve_points_won`, `second_serves`, `second_serves_in`, `second_serve_points_won`, `service_games`, `service_games_won` |
| **Return** | `first_returns`, `first_return_points_won`, `second_returns`, `second_return_points_won`, `return_games`, `return_games_won` |
| **Break Points** | `break_points_faced`, `break_points_saved`, `break_point_opportunities`, `break_points_converted` |
| **Set Points** | `set_points_faced`, `set_points_saved`, `set_point_opportunities`, `set_points_converted` |
| **Totals** | `total_points`, `total_points_won` |
| **Shot Types** | `service_winners`, `forehand_winners`, `backhand_winners`, `forehand_unforced_errors`, `backhand_unforced_errors`, `volley_winners` |

**Calculating Percentages (Frontend):**

```typescript
// First Serve Percentage
const firstServePct = stats.first_serves_in / stats.first_serves * 100;

// First Serve Points Won %
const firstServeWonPct = stats.first_serve_points_won / stats.first_serves_in * 100;

// Serve Rating (composite metric)
const serveRating =
  (stats.first_serves_in / stats.first_serves * 100) +      // 1st Serve %
  (stats.first_serve_points_won / stats.first_serves_in * 100) +  // 1st Serve Won %
  (stats.second_serve_points_won / stats.second_serves_in * 100) + // 2nd Serve Won %
  (stats.service_games_won / stats.service_games * 100) +   // Service Games Won %
  stats.aces - stats.double_faults;

// Break Points Saved %
const bpSavedPct = stats.break_points_saved / stats.break_points_faced * 100;
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
await supabase.rpc('calculate_match_stats', { p_match_id: matchId });
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
