# Process Match Edge Function

This Edge Function processes uploaded SwingVision match files and persists structured data into the database tables:
- `points`
- `shots`
- `match_stats`

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
