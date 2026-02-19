# PRD: Advantage Analytics Platform - Database & Architecture

## 1. Project Overview

**Project Name:** Advantage Analytics Dashboard
**Version:** 2.1 (Phase 2 Complete + Stats Calculation)
**Last Updated:** February 2026

**Objective:** Build a tennis analytics platform that ingests match data from Electronic Line Calling (ELC) providers (SwingVision, ATP Tour, etc.), stores it in Supabase, and enables performance analysis and visualization.

---

## 2. Current Implementation Status

### Phase 1: File Upload & Storage ✅ COMPLETE

| Feature                     | Status | Description                                                         |
| --------------------------- | ------ | ------------------------------------------------------------------- |
| User Authentication         | ✅     | Supabase Auth with email/password                                   |
| SwingVision File Upload     | ✅     | .xlsx file validation and storage                                   |
| Storage Bucket              | ✅     | `match-data` bucket with user folders                               |
| Match Records               | ✅     | Complete match metadata storage with scores, format, duration       |
| SwingVision Metadata Parser | ✅     | Extracts match info, player names, scores, sets, duration from xlsx |
| Provider Strategy Pattern   | ✅     | Extensible for ATP, WTA, etc.                                       |
| RLS Policies                | ✅     | User-scoped data access                                             |

### Phase 2: Data Processing ✅ COMPLETE

| Feature                  | Status | Description                                               |
| ------------------------ | ------ | --------------------------------------------------------- |
| SwingVision Parser       | ✅     | Edge Function extracts points/shots from xlsx             |
| Points Table             | ✅     | Point-by-point data storage                               |
| Shots Table              | ✅     | Granular shot physics data                                |
| Match Stats              | ✅     | Comprehensive statistics with 40+ metrics                 |
| Edge Function            | ✅     | `process-match` Supabase Edge Function                    |
| Stats Calculation RPC    | ✅     | `calculate_match_stats` function for real-time calculation|
| Stats Percentages View   | ✅     | `match_stats_percentages` view for UI display             |

### Phase 3: Analytics & Visualization 🔜 PLANNED

| Feature                 | Status | Description              |
| ----------------------- | ------ | ------------------------ |
| Multi-match Aggregation | 🔜     | Cross-match filtering    |
| Performance Trending    | 🔜     | KPI trends over time     |
| Heatmap Visualization   | 🔜     | Shot placement visuals   |
| Opponent Analysis       | 🔜     | Head-to-head comparisons |

---

## 3. Current Database Schema

### 3.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │     matches     │       │   match_files   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │──┐    │ id (PK)         │
│ email           │  │    │ created_by (FK) │◄─┘    │ match_id (FK)   │◄─┐
│ first_name      │  │    │ player1_name    │       │ uploaded_by(FK) │──┘
│ last_name       │  │    │ player2_name    │       │ provider_id     │
│ hand            │  │    │ player1_id      │       │ file_name       │
│ backhand        │  │    │ player2_id      │       │ storage_path    │
│ is_admin        │  │    │ date            │       │ file_size       │
│ ...             │  │    │ score (JSONB)   │       │ status          │
└─────────────────┘  │    │ format (JSONB)  │       └─────────────────┘
                     │    │ source_provider │
                     │    │ analysis_method │
                     │    │ court_type      │
                     │    │ match_type      │
                     │    │ verified        │
                     │    │ private         │
                     └───►│ ...             │
                          └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   waitlists     │  │ contact_submis. │  │ newsletter_sub. │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (PK)         │  │ id (PK)         │  │ id (PK)         │
│ email           │  │ name            │  │ email (UNIQUE)  │
│ name            │  │ email           │  │ status          │
│ status          │  │ message         │  │ source          │
│ invited_at      │  │ status          │  │ subscribed_at   │
│ joined_at       │  │ reviewed_by(FK) │  └─────────────────┘
└─────────────────┘  └─────────────────┘
```

### 3.2 Table Definitions

#### A. Table: `users`

Core user profile with tennis-specific attributes.

| Column      | Type        | Nullable | Description                           |
| ----------- | ----------- | -------- | ------------------------------------- |
| id          | UUID        | NO       | Primary key, links to auth.users      |
| email       | TEXT        | NO       | User email (unique)                   |
| first_name  | TEXT        | YES      | First name                            |
| last_name   | TEXT        | YES      | Last name                             |
| phone       | TEXT        | YES      | Phone number                          |
| dob         | DATE        | YES      | Date of birth                         |
| nationality | TEXT        | YES      | Country of origin                     |
| state       | TEXT        | YES      | State/region                          |
| country     | TEXT        | YES      | Current country                       |
| hand        | TEXT        | YES      | Dominant hand (left/right)            |
| backhand    | TEXT        | YES      | Backhand type (one-handed/two-handed) |
| height      | TEXT        | YES      | Player height                         |
| weight      | TEXT        | YES      | Player weight                         |
| school_name | TEXT        | YES      | School/university name                |
| class       | TEXT        | YES      | Academic class year                   |
| role        | TEXT        | YES      | User role (free/premium)              |
| utr_id      | INTEGER     | YES      | UTR player ID                         |
| atp_id      | UUID        | YES      | ATP player ID                         |
| wta_id      | UUID        | YES      | WTA player ID                         |
| is_admin    | BOOLEAN     | NO       | Admin flag (default: false)           |
| created_at  | TIMESTAMPTZ | YES      | Account creation time                 |

#### B. Table: `matches`

Match records with metadata for filtering and organization.

| Column          | Type        | Nullable | Description                                                                                                      |
| --------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| id              | UUID        | NO       | Primary key                                                                                                      |
| created_by      | UUID        | YES      | FK → users.id (match owner)                                                                                      |
| player1_name    | TEXT        | NO       | Host/first player name                                                                                           |
| player1_id      | UUID        | YES      | FK → users.id (if registered)                                                                                    |
| player2_name    | TEXT        | NO       | Guest/second player name                                                                                         |
| player2_id      | UUID        | YES      | FK → users.id (if registered)                                                                                    |
| tournament_name | TEXT        | YES      | Event/tournament name                                                                                            |
| round           | TEXT        | YES      | Match round (Finals, SF, etc.)                                                                                   |
| date            | TIMESTAMPTZ | NO       | Match date and time                                                                                              |
| score           | JSONB       | YES      | `{player1: [6,4,6], player2: [3,6,2], player1_tiebreaks: [null,null,null], player2_tiebreaks: [null,null,null]}` |
| format          | JSONB       | YES      | `{best_of: 3, ad_scoring: true, play_on_lets: false}`                                                            |
| result          | TEXT        | YES      | Match result description                                                                                         |
| status          | TEXT        | YES      | Processing status                                                                                                |
| source_provider | TEXT        | YES      | Data source (swing-vision, atp-tour)                                                                             |
| analysis_method | TEXT        | YES      | Analysis type (elc, ai)                                                                                          |
| match_type      | TEXT        | YES      | singles, doubles, mixed-doubles                                                                                  |
| court_type      | TEXT        | YES      | hard, clay, grass, carpet                                                                                        |
| private         | BOOLEAN     | YES      | Visibility flag                                                                                                  |
| verified        | BOOLEAN     | YES      | Admin verification (default: false)                                                                              |
| duration        | BIGINT      | YES      | Match duration in milliseconds (e.g., 10800000 = 3 hours)                                                        |

#### C. Table: `match_files`

Tracks uploaded data files linked to matches.

| Column       | Type        | Nullable | Description                            |
| ------------ | ----------- | -------- | -------------------------------------- |
| id           | UUID        | NO       | Primary key                            |
| match_id     | UUID        | YES      | FK → matches.id                        |
| uploaded_by  | UUID        | YES      | FK → users.id                          |
| provider_id  | TEXT        | NO       | Provider (swing-vision, atp-tour)      |
| file_name    | TEXT        | YES      | Original filename                      |
| file_size    | BIGINT      | YES      | Size in bytes                          |
| storage_path | TEXT        | YES      | Path in storage bucket                 |
| status       | TEXT        | YES      | uploaded, validated, processed, failed |
| uploaded_at  | TIMESTAMPTZ | YES      | Upload timestamp                       |
| utr_id       | INTEGER     | YES      | UTR match ID (if applicable)           |

#### D. Table: `waitlists`

Early access waitlist management.

| Column     | Type        | Nullable | Description              |
| ---------- | ----------- | -------- | ------------------------ |
| id         | UUID        | NO       | Primary key              |
| email      | TEXT        | NO       | Email (unique)           |
| name       | TEXT        | NO       | Full name                |
| status     | TEXT        | NO       | pending, invited, joined |
| date       | TIMESTAMPTZ | NO       | Signup date              |
| invited_at | TIMESTAMPTZ | YES      | When invite sent         |
| joined_at  | TIMESTAMPTZ | YES      | When user joined         |

#### E. Table: `contact_submissions`

Contact form submissions from marketing site.

| Column      | Type        | Nullable | Description                            |
| ----------- | ----------- | -------- | -------------------------------------- |
| id          | UUID        | NO       | Primary key                            |
| name        | TEXT        | NO       | Submitter name                         |
| email       | TEXT        | NO       | Submitter email                        |
| phone       | TEXT        | YES      | Phone number                           |
| role        | TEXT        | YES      | User role/type                         |
| school      | TEXT        | YES      | School/organization                    |
| message     | TEXT        | YES      | Message content                        |
| status      | TEXT        | YES      | pending, reviewed, responded, archived |
| created_at  | TIMESTAMPTZ | YES      | Submission time                        |
| reviewed_at | TIMESTAMPTZ | YES      | Review timestamp                       |
| reviewed_by | UUID        | YES      | FK → users.id (admin)                  |

#### F. Table: `newsletter_subscribers`

Newsletter email subscriptions.

| Column          | Type        | Nullable | Description                           |
| --------------- | ----------- | -------- | ------------------------------------- |
| id              | UUID        | NO       | Primary key                           |
| email           | TEXT        | NO       | Email (unique)                        |
| status          | TEXT        | YES      | active, unsubscribed, bounced         |
| source          | TEXT        | YES      | Signup source (website, footer, etc.) |
| subscribed_at   | TIMESTAMPTZ | YES      | Subscription time                     |
| unsubscribed_at | TIMESTAMPTZ | YES      | Unsubscription time                   |

---

## 4. Storage Architecture

### 4.1 Bucket: `match-data`

**Path Structure:**

```
match-data/
└── {user_id}/
    └── {provider_id}/
        └── {match_id}/
            └── {filename}.xlsx
```

**Example:**

```
match-data/
└── 550e8400-e29b-41d4-a716-446655440000/
    └── swing-vision/
        └── a1b2c3d4-5678-90ab-cdef-1234567890ab/
            └── SwingVision_Export_2026-01-15.xlsx
```

**Benefits:**

- User-level RLS (first folder = user_id)
- Provider organization for filtering
- Match-specific file grouping
- No filename collisions

### 4.2 RLS Policies

| Table                  | Policy                       | Rule                               |
| ---------------------- | ---------------------------- | ---------------------------------- |
| users                  | Users can insert own record  | `auth.uid() = id` (INSERT)         |
| users                  | Own profile                  | `auth.uid() = id` (SELECT/UPDATE)  |
| matches                | Users can insert own matches | `auth.uid() = created_by` (INSERT) |
| matches                | Own matches                  | `auth.uid() = created_by` (SELECT/UPDATE/DELETE) |
| match_files            | Own files                    | `auth.uid() = uploaded_by`         |
| contact_submissions    | Public insert                | Anyone can submit                  |
| contact_submissions    | Admin read                   | `is_admin = true`                  |
| newsletter_subscribers | Public insert                | Anyone can subscribe               |
| newsletter_subscribers | Admin read                   | `is_admin = true`                  |
| storage.objects        | Own files                    | `auth.uid()::text = foldername[1]` |

#### View Security

| View                              | Setting                      | Description                                                    |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| match_stats_with_percentages      | `security_invoker = true`    | RLS evaluated as calling user, not view owner                  |

---

## 5. Provider Support

### 5.1 Current Providers

| Provider    | Status     | File Type | Validation        |
| ----------- | ---------- | --------- | ----------------- |
| SwingVision | ✅ Active  | .xlsx     | 6 required sheets |
| ATP Tour    | 🔜 Planned | .csv      | TBD               |
| WTA         | 🔜 Planned | TBD       | TBD               |
| Hawk-Eye    | 🔜 Planned | TBD       | TBD               |

### 5.2 SwingVision File Structure

Required sheets in SwingVision export:

1. `Settings` - Match configuration
2. `Shots` - Individual shot data
3. `Points` - Point-by-point results
4. `Games` - Game scores
5. `Sets` - Set scores
6. `Stats` - Aggregate statistics

---

## 6. Data Processing Schema (Phase 2) ✅ IMPLEMENTED

### 6.1 Processing Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Upload Modal   │     │  /api/upload    │     │  Edge Function  │
│  (Frontend)     │────►│  (Next.js API)  │────►│  process-match  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        ▼                               ▼                               ▼
                 ┌─────────────┐               ┌─────────────┐               ┌─────────────┐
                 │   points    │               │    shots    │               │ match_stats │
                 └─────────────┘               └─────────────┘               └─────────────┘
```

**Edge Function:** `supabase/functions/process-match/index.ts`

- Triggered automatically after file upload
- Reads xlsx files from Supabase Storage
- Extracts data from SwingVision sheets (Settings, Shots, Points, Games, Sets, Stats)
- Inserts structured data into database tables

### 6.2 Implemented Tables

#### Table: `points`

| Column            | Type    | Description                                                               |
| ----------------- | ------- | ------------------------------------------------------------------------- |
| id                | UUID    | Primary key                                                               |
| match_id          | UUID    | FK → matches                                                              |
| point_number      | INT     | Sequence in match                                                         |
| set_number        | INT     | Current set                                                               |
| game_number       | INT     | Current game                                                              |
| set_score         | TEXT    | e.g., "1-0"                                                               |
| game_score        | TEXT    | e.g., "4-2"                                                               |
| point_score       | TEXT    | e.g., "30-40"                                                             |
| server_is_player1 | BOOLEAN | Who served                                                                |
| won_by_player1    | BOOLEAN | Point winner                                                              |
| is_break_point    | BOOLEAN | Break point flag (from SwingVision)                                       |
| is_set_point      | BOOLEAN | Set point flag (calculated from game/point scores, not SwingVision)       |
| is_match_point    | BOOLEAN | Match point flag (calculated: set point for player needing 1 more set)    |
| rally_length      | INT     | Number of shots                                                           |
| result_type       | TEXT    | Winner, UE, FE, Ace, etc.                                                 |
| video_time        | REAL    | Video timestamp in seconds for start of point                             |
| duration          | REAL    | Point duration in seconds                                                 |

#### Table: `shots`

| Column      | Type    | Description                                                              |
| ----------- | ------- | ------------------------------------------------------------------------ |
| id          | UUID    | Primary key                                                              |
| point_id    | UUID    | FK → points                                                              |
| shot_number | INT     | 1=serve, 2=return, etc.                                                  |
| is_player1  | BOOLEAN | Who hit it                                                               |
| shot_type   | TEXT    | "First Serve", "Second Serve", or stroke type (Forehand, Backhand, etc.) |
| spin_type   | TEXT    | topspin, slice, flat                                                     |
| speed_mph   | FLOAT   | Ball speed                                                               |
| contact_x   | FLOAT   | Court position (0-1)                                                     |
| contact_y   | FLOAT   | Court position (0-1)                                                     |
| landing_x   | FLOAT   | Bounce position (0-1)                                                    |
| landing_y   | FLOAT   | Bounce position (0-1)                                                    |
| result      | TEXT    | in, out, net, winner, error                                              |
| video_time  | REAL    | Video timestamp in seconds for this shot                                 |
| zone        | TEXT    | Shot direction zone. Serves: 'T', 'Body', 'Wide'. Non-serves: 'Crosscourt', 'Middle', 'Down the Line'. CHECK constrained. |

#### Table: `match_stats`

Stores raw count statistics per player. Percentages are calculated via the `match_stats_percentages` view.

| Column                    | Type    | Description                              |
| ------------------------- | ------- | ---------------------------------------- |
| id                        | UUID    | Primary key                              |
| match_id                  | UUID    | FK → matches                             |
| is_player1                | BOOLEAN | true for player1, false for player2      |
| **Serve Stats**           |         |                                          |
| aces                      | INT     | Total aces                               |
| double_faults             | INT     | Total double faults                      |
| first_serves              | INT     | Total 1st serve attempts                 |
| first_serves_in           | INT     | 1st serves that went in                  |
| first_serve_points_won    | INT     | Points won after 1st serve in            |
| second_serves             | INT     | Total 2nd serve attempts                 |
| second_serves_in          | INT     | 2nd serves that went in                  |
| second_serve_points_won   | INT     | Points won after 2nd serve               |
| service_games             | INT     | Total service games played               |
| service_games_won         | INT     | Service games won (held serve)           |
| **Return Stats**          |         |                                          |
| first_returns             | INT     | Returns against opponent 1st serve       |
| first_return_points_won   | INT     | Points won returning 1st serve           |
| second_returns            | INT     | Returns against opponent 2nd serve       |
| second_return_points_won  | INT     | Points won returning 2nd serve           |
| return_games              | INT     | Total return games played                |
| return_games_won          | INT     | Return games won (broke serve)           |
| **Break Point Stats**     |         |                                          |
| break_points_faced        | INT     | Break points faced when serving          |
| break_points_saved        | INT     | Break points saved (won when facing BP)  |
| break_point_opportunities | INT     | Break point chances when returning       |
| break_points_converted    | INT     | Break points converted                   |
| **Set Point Stats**       |         |                                          |
| set_points_faced          | INT     | Set points faced (opponent had SP)       |
| set_points_saved          | INT     | Set points saved                         |
| set_point_opportunities   | INT     | Set point chances                        |
| set_points_converted      | INT     | Set points converted                     |
| **Point Totals**          |         |                                          |
| total_points              | INT     | Total points played                      |
| total_points_won          | INT     | Total points won                         |
| **Winners & Errors**      |         |                                          |
| winners                   | INT     | Total winners                            |
| service_winners           | INT     | Non-ace serve winners                    |
| forehand_winners          | INT     | Forehand winners                         |
| backhand_winners          | INT     | Backhand winners                         |
| volley_winners            | INT     | Volley/net winners                       |
| unforced_errors           | INT     | Total unforced errors                    |
| forehand_unforced_errors  | INT     | Forehand unforced errors                 |
| backhand_unforced_errors  | INT     | Backhand unforced errors                 |
| forced_errors             | INT     | Total forced errors                      |
| **Other**                 |         |                                          |
| avg_rally_length          | FLOAT   | Average rally length                     |
| created_at                | TIMESTAMP | Record creation time                   |
| updated_at                | TIMESTAMP | Last update time (auto-updated)        |

#### View: `match_stats_percentages`

Calculates percentage statistics from raw `match_stats` counts. Use this view for displaying stats in the UI.

| Column                      | Type  | Description                                   |
| --------------------------- | ----- | --------------------------------------------- |
| (all match_stats columns)   | -     | Inherited from match_stats                    |
| first_serve_pct             | FLOAT | % of 1st serves in (first_serves_in / first_serves) |
| first_serve_won_pct         | FLOAT | % of points won on 1st serve                  |
| second_serve_won_pct        | FLOAT | % of points won on 2nd serve                  |
| service_games_won_pct       | FLOAT | % of service games won                        |
| first_return_won_pct        | FLOAT | % of points won returning 1st serve           |
| second_return_won_pct       | FLOAT | % of points won returning 2nd serve           |
| return_games_won_pct        | FLOAT | % of return games won                         |
| break_points_saved_pct      | FLOAT | % of break points saved                       |
| break_points_converted_pct  | FLOAT | % of break points converted                   |
| set_points_saved_pct        | FLOAT | % of set points saved                         |
| set_points_converted_pct    | FLOAT | % of set points converted                     |
| total_points_won_pct        | FLOAT | % of total points won                         |

---

## 7. API Routes & Edge Functions

### 7.1 Current Routes

| Route         | Method | Description                                          |
| ------------- | ------ | ---------------------------------------------------- |
| `/api/upload` | POST   | Upload match file to storage, triggers Edge Function |

### 7.2 Edge Functions

| Function        | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `process-match` | Processes xlsx files, extracts data into points/shots/match_stats tables |

**Invocation:**

```typescript
await supabase.functions.invoke('process-match', {
  body: {
    matchId: string,
    userId: string,
    fileNames: string[],
    sourceProvider?: string, // optional, fetched from match if not provided
  }
});
```

### 7.3 Database Functions (RPC)

| Function               | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `calculate_match_stats(p_match_id UUID)` | Calculates all match statistics from points/shots data and upserts to match_stats |

**Invocation:**

```typescript
await supabase.rpc('calculate_match_stats', { p_match_id: matchId });
```

**What it calculates:**
- Serve stats: aces, double faults, 1st/2nd serve %, points won on serve
- Return stats: points won on 1st/2nd serve return
- Break point stats: faced, saved, opportunities, converted
- Set point stats: faced, saved, opportunities, converted
- Winners/errors: total, by shot type (forehand, backhand, volley, service)
- Game stats: service/return games won
- Average rally length

### 7.4 Planned Routes

| Route                      | Method | Description             |
| -------------------------- | ------ | ----------------------- |
| `/api/matches`             | GET    | List user's matches     |
| `/api/matches/[id]`        | GET    | Get match details       |
| `/api/matches/[id]/stats`  | GET    | Get match statistics    |
| `/api/matches/[id]/points` | GET    | Get point-by-point data |
| `/api/analytics/trends`    | GET    | Get performance trends  |

---

## 8. Security Considerations

### 8.1 Authentication

- Supabase Auth with email/password
- Session-based authentication
- JWT tokens for API access

### 8.2 Authorization

- Row Level Security (RLS) on all tables
- User-scoped data access
- Admin-only access for contact/newsletter data
- Storage policies enforce user folder isolation

### 8.3 Data Privacy

- `private` flag on matches for visibility control
- Users can only access their own data
- Admins can verify but not modify user data

### 8.4 Function Security

- Functions use `SET search_path = ''` to prevent search path injection attacks
- Affected functions: `update_match_stats_updated_at`, `custom_access_token_hook`, `calculate_match_stats`
- All table references use fully-qualified names (e.g., `public.users`)

---

## 9. Migration History

| Migration                           | Date    | Description                                                                                                     |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| Initial schema                      | -       | Base tables (users, matches, etc.)                                                                              |
| add_storage_path_to_match_files     | 2026-01 | Added storage tracking columns                                                                                  |
| add_match_metadata_columns          | 2026-01 | Added source_provider, analysis_method, etc.                                                                    |
| fix_match_files_rls_policies        | 2026-01 | Proper user-scoped RLS                                                                                          |
| add_verified_column_to_matches      | 2026-01 | Admin verification flag                                                                                         |
| cleanup_unused_tables               | 2026-01 | Removed conferences, players, schools, video_files                                                              |
| cleanup_unused_bucket               | 2026-01 | Removed conferences bucket                                                                                      |
| create_contact_submissions_table    | 2026-01 | Contact form storage                                                                                            |
| create_newsletter_subscribers_table | 2026-01 | Newsletter signups                                                                                              |
| add_tiebreak_scores_to_matches      | 2026-01 | Added tiebreak score support to JSONB score field                                                               |
| add_duration_column_to_matches      | 2026-01 | Added duration column for match duration tracking in milliseconds                                               |
| fix_player_assignment_logic         | 2026-01 | Fixed player1/player2 assignment to use playerName/opponentName instead of winner/loser                         |
| fix_duration_parsing                | 2026-01 | Fixed SwingVision duration parsing - convert seconds to milliseconds; changed duration type from TEXT to BIGINT |
| create_points_table                 | 2026-01 | Point-by-point data storage for match analytics                                                                 |
| create_shots_table                  | 2026-01 | Granular shot physics data linked to points                                                                     |
| create_match_stats_table            | 2026-01 | Pre-calculated match statistics per player                                                                      |
| add_video_time_and_duration_columns | 2026-01 | Added video_time/duration to points and video_time to shots for video navigation                                |
| fix_set_point_match_point_calc      | 2026-01 | Fixed is_set_point/is_match_point calculation - now computed from scores instead of unreliable SwingVision data |
| fix_security_issues                 | 2026-01 | Added search_path to functions, tightened RLS INSERT policies for matches/users                                 |
| create_calculate_match_stats_function | 2026-01 | Added RPC function to calculate match stats from points/shots data                                             |
| add_stats_calculation_indexes       | 2026-01 | Added indexes on points/shots tables for efficient stats calculation                                            |
| fix_calculate_match_stats_search_path | 2026-01 | Added search_path security to calculate_match_stats function                                                   |
| expand_match_stats_detailed_statistics | 2026-01 | Expanded match_stats with detailed serve/return/break point columns                                            |
| update_calculate_match_stats_function | 2026-01 | Updated RPC to calculate all new detailed statistics                                                           |
| create_match_stats_percentages_view | 2026-01 | Created view to calculate percentage stats from raw counts                                                      |
| fix_security_warnings               | 2026-01 | Additional security hardening for database functions                                                            |
| convert_matches_duration_to_bigint  | 2026-02 | Converted matches.duration column from TEXT to BIGINT for proper numeric storage                               |
| populate_serve_return_placement_stats | 2026-02 | Updated calculate_match_stats to populate serve placement, return direction & contact position columns        |
| add_shot_zone                         | 2026-02 | Added `zone` text column to shots table with CHECK constraint; backfilled existing rows from coordinates      |
| secure_match_stats_view               | 2026-02 | Set `security_invoker = true` on `match_stats_with_percentages` view to enforce RLS as calling user          |

---

## 10. Completed Enhancements

### 10.1 `is_set_point` and `is_match_point` Calculation ✅

**Status:** ✅ Implemented in Edge Function (January 2026)

**Problem:** SwingVision's "Set Point" column is unreliable - it only flags set points in Set 1, leaving Sets 2 and 3 with zero set points. This broke `is_match_point` since it depended on `is_set_point`.

**Solution:** Both values are now calculated based on game/point scores using college tennis rules (no-ad scoring).

**Implementation:** Calculated in Edge Function at insert time in `buildPointInserts()`:

```typescript
// supabase/functions/process-match/index.ts

// Calculate who has set point based on scores (not SwingVision's unreliable column)
const { serverHasSetPoint, receiverHasSetPoint } = calculateSetPoint(
  gameScore,  // "5-4" format
  pointScore  // "40-30" format
);

const hostHasSetPoint = serverIsPlayer1 ? serverHasSetPoint : receiverHasSetPoint;
const guestHasSetPoint = serverIsPlayer1 ? receiverHasSetPoint : serverHasSetPoint;
const isSetPoint = hostHasSetPoint || guestHasSetPoint;

// Match point: set point for a player who needs 1 more set to win
const setsToWin = Math.ceil(matchFormat / 2); // 2 for best-of-3, 3 for best-of-5
const [hostSets, guestSets] = setScore.split("-").map(Number);
const isMatchPoint =
  (hostHasSetPoint && hostSets === setsToWin - 1) ||
  (guestHasSetPoint && guestSets === setsToWin - 1);
```

**Set Point Rules (No-Ad Scoring):**
- Game point at 40 (40-40 = both at game point, deciding point)
- Set won at 6 games with 2+ lead, or 7-5, or tiebreak at 6-6
- Tiebreak set point: at 6+ points with 1-point lead

### 10.2 `shot_type` Serve Handling ✅

**Status:** ✅ Implemented in Edge Function (January 2026)

**Implementation:** Uses "Stroke" column from SwingVision data. For serves, checks "Type" column to distinguish first/second serve:

```typescript
// supabase/functions/process-match/index.ts - buildShotInserts()
const stroke = safeString(row["Stroke"]);
let shotType = stroke;
if (stroke?.toLowerCase() === "serve") {
  const serveType = String(row["Type"] ?? "").toLowerCase();
  if (serveType === "first_serve") shotType = "First Serve";
  else if (serveType === "second_serve") shotType = "Second Serve";
}
```

### 10.3 Shot `zone` Column ✅

**Status:** ✅ Implemented (February 2026)

**Problem:** Shot direction/zone was computed at query time from raw `landing_x` coordinates in `calculate_match_stats()`. This duplicated threshold logic and prevented filtering shots by zone directly.

**Solution:** Added a `zone` text column to the `shots` table, computed at insert time in the Edge Function and backfilled for existing rows via migration.

**Zone Values:**
- **Serves** (`shot_number = 1`): `'T'` (|x| < 1.37m), `'Body'` (1.37m <= |x| < 2.74m), `'Wide'` (|x| >= 2.74m)
- **Non-serves** (`shot_number >= 2`): `'Middle'` (|landing_x| <= 1.0m), `'Crosscourt'` (sign(landing_x) != sign(prev.contact_x)), `'Down the Line'` (sign(landing_x) = sign(prev.contact_x))

**Implementation:** Computed in Edge Function `buildShotInserts()` after building all shot inserts, grouped by point_id:

```typescript
// supabase/functions/process-match/index.ts - buildShotInserts()
if (shot.shot_number === 1) {
  const absX = Math.abs(shot.landing_x);
  if (absX >= 2.74) shot.zone = "Wide";
  else if (absX >= 1.37) shot.zone = "Body";
  else shot.zone = "T";
} else {
  if (Math.abs(shot.landing_x) <= 1.0) shot.zone = "Middle";
  else if (Math.sign(shot.landing_x) !== Math.sign(prev.contact_x)) shot.zone = "Crosscourt";
  else shot.zone = "Down the Line";
}
```

### 10.4 Video Time & Duration Columns ✅

**Status:** ✅ Implemented (January 2026)

**Added columns:**

- `points.video_time` (REAL) - Video timestamp in seconds for start of point
- `points.duration` (REAL) - Point duration in seconds
- `shots.video_time` (REAL) - Video timestamp in seconds for this shot

**Purpose:** Enable video navigation at both point and shot level for match review

---

## 11. Open Questions / Future Considerations

1. **Opponent Tracking:** Should we create a separate `opponents` table or use the `users` table for opponents?

2. **Historical Data:** How far back should we support data imports?

3. **Data Sharing:** Should users be able to share match data with coaches/analysts?

4. **Video Integration:** Should we support video file uploads linked to matches?

5. **Real-time Updates:** Should we support live match tracking via WebSockets?

6. **Export Functionality:** Should users be able to export their data in various formats?

7. **Multi-tenant Support:** Should coaches be able to manage multiple players?

---

## 12. Recent Bug Fixes & Changes (January 2026)

### Player Assignment Logic

**Issue:** player1/player2 were incorrectly assigned as winner/loser instead of host/guest teams.
**Fix:** Updated `buildMatchData()` to always assign:

- `player1` = `playerName` (Host Team - usually the user)
- `player2` = `opponentName` (Guest Team)

This ensures player1/player2 are always consistent with the match structure, regardless of who won. Scores are correctly mapped to each player.

### Duration Parsing

**Issue:** SwingVision exports duration as floating-point seconds (e.g., 3819.43), but the parser was treating them as milliseconds, making match durations appear ~1000x too short.
**Fix:**

- Parser now correctly converts seconds to milliseconds: `seconds * 1000`
- Duration column type corrected to `BIGINT` (milliseconds) instead of `TEXT`
- Added duration input field in Advanced Settings for manual editing (accepts seconds)
- Display logic in Confirm step uses `formatDuration()` which expects milliseconds

**Storage Format:** Duration is always stored in milliseconds in the database.

### UI Updates

- Added duration input field to Advanced Settings (Match Duration section)
- Users can now manually adjust match duration if auto-parsed value is incorrect
- Duration displays as "H:MM" format in confirmation view (e.g., "1:03" for 1 hour 3 minutes)

### Set Point & Match Point Calculation

**Issue:** SwingVision's "Set Point" column only flagged set points in Set 1, leaving Sets 2 and 3 with zero set points. This broke `is_match_point` since it depended on `is_set_point`.

**Example bug (Point 181):**
- `point_score: "40-0"`, `game_score: "5-4"`, `set_score: "1-1"`
- Guest serving at game point, would win set 6-4 and match 2-1
- Should be `is_set_point: true` AND `is_match_point: true`
- Actually stored as both `false`

**Fix:** Added `calculateSetPoint()` helper function that computes set points based on game/point scores using college tennis rules (no-ad scoring):
- Game point at 40 (40-40 = deciding point where both have game point)
- Set won at 6 games with 2+ lead, or 7-5, or tiebreak at 6-6
- Tiebreak set point at 6+ points with 1-point lead

The function now tracks WHO has the set point (host vs guest), enabling correct match point calculation.

---

## 13. Glossary

| Term        | Definition                                                 |
| ----------- | ---------------------------------------------------------- |
| ELC         | Electronic Line Calling - automated line-call technology   |
| SwingVision | AI-powered tennis tracking app for amateur/college players |
| UTR         | Universal Tennis Rating - player rating system             |
| RLS         | Row Level Security - Postgres feature for access control   |
| UE          | Unforced Error                                             |
| FE          | Forced Error                                               |
| BP          | Break Point                                                |
