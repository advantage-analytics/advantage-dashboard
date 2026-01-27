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
  "fileNames": ["file1.xlsx", "file2.xlsx"],
  "bucketId": "match-data" // optional, defaults to "match-data"
}
```

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
