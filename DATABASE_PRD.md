# PRD: Advantage Analytics Platform - Database & Architecture

## 1. Project Overview

**Project Name:** Advantage Analytics Dashboard
**Version:** 1.0 (Phase 1 Complete)
**Last Updated:** January 2026

**Objective:** Build a tennis analytics platform that ingests match data from Electronic Line Calling (ELC) providers (SwingVision, ATP Tour, etc.), stores it in Supabase, and enables performance analysis and visualization.

---

## 2. Current Implementation Status

### Phase 1: File Upload & Storage ✅ COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| User Authentication | ✅ | Supabase Auth with email/password |
| SwingVision File Upload | ✅ | .xlsx file validation and storage |
| Storage Bucket | ✅ | `match-data` bucket with user folders |
| Match Records | ✅ | Basic match metadata storage |
| Provider Strategy Pattern | ✅ | Extensible for ATP, WTA, etc. |
| RLS Policies | ✅ | User-scoped data access |

### Phase 2: Data Processing 🔜 PLANNED

| Feature | Status | Description |
|---------|--------|-------------|
| SwingVision Parser | 🔜 | Extract points/shots from xlsx |
| Points Table | 🔜 | Point-by-point data storage |
| Shots Table | 🔜 | Granular shot physics data |
| Match Stats | 🔜 | Pre-calculated KPIs |

### Phase 3: Analytics & Visualization 🔜 PLANNED

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-match Aggregation | 🔜 | Cross-match filtering |
| Performance Trending | 🔜 | KPI trends over time |
| Heatmap Visualization | 🔜 | Shot placement visuals |
| Opponent Analysis | 🔜 | Head-to-head comparisons |

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

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key, links to auth.users |
| email | TEXT | NO | User email (unique) |
| first_name | TEXT | YES | First name |
| last_name | TEXT | YES | Last name |
| phone | TEXT | YES | Phone number |
| dob | DATE | YES | Date of birth |
| nationality | TEXT | YES | Country of origin |
| state | TEXT | YES | State/region |
| country | TEXT | YES | Current country |
| hand | TEXT | YES | Dominant hand (left/right) |
| backhand | TEXT | YES | Backhand type (one-handed/two-handed) |
| height | TEXT | YES | Player height |
| weight | TEXT | YES | Player weight |
| school_name | TEXT | YES | School/university name |
| class | TEXT | YES | Academic class year |
| role | TEXT | YES | User role (free/premium) |
| utr_id | INTEGER | YES | UTR player ID |
| atp_id | UUID | YES | ATP player ID |
| wta_id | UUID | YES | WTA player ID |
| is_admin | BOOLEAN | NO | Admin flag (default: false) |
| created_at | TIMESTAMPTZ | YES | Account creation time |

#### B. Table: `matches`

Match records with metadata for filtering and organization.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| created_by | UUID | YES | FK → users.id (match owner) |
| player1_name | TEXT | NO | Winner/first player name |
| player1_id | UUID | YES | FK → users.id (if registered) |
| player2_name | TEXT | NO | Loser/second player name |
| player2_id | UUID | YES | FK → users.id (if registered) |
| tournament_name | TEXT | YES | Event/tournament name |
| round | TEXT | YES | Match round (Finals, SF, etc.) |
| date | TIMESTAMPTZ | NO | Match date and time |
| score | JSONB | YES | `{player1: [6,4,6], player2: [3,6,2]}` |
| format | JSONB | YES | `{best_of: 3, ad_scoring: true}` |
| result | TEXT | YES | Match result description |
| status | TEXT | YES | Processing status |
| source_provider | TEXT | YES | Data source (swing-vision, atp-tour) |
| analysis_method | TEXT | YES | Analysis type (elc, ai) |
| match_type | TEXT | YES | singles, doubles, mixed-doubles |
| court_type | TEXT | YES | hard, clay, grass, carpet |
| private | BOOLEAN | YES | Visibility flag |
| verified | BOOLEAN | YES | Admin verification (default: false) |

#### C. Table: `match_files`

Tracks uploaded data files linked to matches.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| match_id | UUID | YES | FK → matches.id |
| uploaded_by | UUID | YES | FK → users.id |
| provider_id | TEXT | NO | Provider (swing-vision, atp-tour) |
| file_name | TEXT | YES | Original filename |
| file_size | BIGINT | YES | Size in bytes |
| storage_path | TEXT | YES | Path in storage bucket |
| status | TEXT | YES | uploaded, validated, processed, failed |
| uploaded_at | TIMESTAMPTZ | YES | Upload timestamp |
| utr_id | INTEGER | YES | UTR match ID (if applicable) |

#### D. Table: `waitlists`

Early access waitlist management.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| email | TEXT | NO | Email (unique) |
| name | TEXT | NO | Full name |
| status | TEXT | NO | pending, invited, joined |
| date | TIMESTAMPTZ | NO | Signup date |
| invited_at | TIMESTAMPTZ | YES | When invite sent |
| joined_at | TIMESTAMPTZ | YES | When user joined |

#### E. Table: `contact_submissions`

Contact form submissions from marketing site.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| name | TEXT | NO | Submitter name |
| email | TEXT | NO | Submitter email |
| phone | TEXT | YES | Phone number |
| role | TEXT | YES | User role/type |
| school | TEXT | YES | School/organization |
| message | TEXT | YES | Message content |
| status | TEXT | YES | pending, reviewed, responded, archived |
| created_at | TIMESTAMPTZ | YES | Submission time |
| reviewed_at | TIMESTAMPTZ | YES | Review timestamp |
| reviewed_by | UUID | YES | FK → users.id (admin) |

#### F. Table: `newsletter_subscribers`

Newsletter email subscriptions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| email | TEXT | NO | Email (unique) |
| status | TEXT | YES | active, unsubscribed, bounced |
| source | TEXT | YES | Signup source (website, footer, etc.) |
| subscribed_at | TIMESTAMPTZ | YES | Subscription time |
| unsubscribed_at | TIMESTAMPTZ | YES | Unsubscription time |

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

| Table | Policy | Rule |
|-------|--------|------|
| users | Own profile | `auth.uid() = id` |
| matches | Own matches | `auth.uid() = created_by` |
| match_files | Own files | `auth.uid() = uploaded_by` |
| contact_submissions | Public insert | Anyone can submit |
| contact_submissions | Admin read | `is_admin = true` |
| newsletter_subscribers | Public insert | Anyone can subscribe |
| newsletter_subscribers | Admin read | `is_admin = true` |
| storage.objects | Own files | `auth.uid()::text = foldername[1]` |

---

## 5. Provider Support

### 5.1 Current Providers

| Provider | Status | File Type | Validation |
|----------|--------|-----------|------------|
| SwingVision | ✅ Active | .xlsx | 6 required sheets |
| ATP Tour | 🔜 Planned | .csv | TBD |
| WTA | 🔜 Planned | TBD | TBD |
| Hawk-Eye | 🔜 Planned | TBD | TBD |

### 5.2 SwingVision File Structure

Required sheets in SwingVision export:
1. `Settings` - Match configuration
2. `Shots` - Individual shot data
3. `Points` - Point-by-point results
4. `Games` - Game scores
5. `Sets` - Set scores
6. `Stats` - Aggregate statistics

---

## 6. Future Schema (Phase 2)

### 6.1 Planned Tables

When file processing is implemented, these tables will store parsed data:

#### Table: `points` (Planned)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| match_id | UUID | FK → matches |
| point_number | INT | Sequence in match |
| set_number | INT | Current set |
| game_number | INT | Current game |
| set_score | TEXT | e.g., "1-0" |
| game_score | TEXT | e.g., "4-2" |
| point_score | TEXT | e.g., "30-40" |
| server_is_player1 | BOOLEAN | Who served |
| won_by_player1 | BOOLEAN | Point winner |
| is_break_point | BOOLEAN | Break point flag |
| is_set_point | BOOLEAN | Set point flag |
| is_match_point | BOOLEAN | Match point flag |
| rally_length | INT | Number of shots |
| result_type | TEXT | Winner, UE, FE, Ace, etc. |

#### Table: `shots` (Planned)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| point_id | UUID | FK → points |
| shot_number | INT | 1=serve, 2=return, etc. |
| is_player1 | BOOLEAN | Who hit it |
| shot_type | TEXT | serve, forehand, backhand, etc. |
| spin_type | TEXT | topspin, slice, flat |
| speed_mph | FLOAT | Ball speed |
| contact_x | FLOAT | Court position (0-1) |
| contact_y | FLOAT | Court position (0-1) |
| landing_x | FLOAT | Bounce position (0-1) |
| landing_y | FLOAT | Bounce position (0-1) |
| result | TEXT | in, out, net, winner, error |

#### Table: `match_stats` (Planned)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| match_id | UUID | FK → matches |
| is_player1 | BOOLEAN | Which player |
| aces | INT | Total aces |
| double_faults | INT | Total DFs |
| first_serve_pct | FLOAT | 1st serve % |
| first_serve_won_pct | FLOAT | 1st serve points won % |
| second_serve_won_pct | FLOAT | 2nd serve points won % |
| break_points_saved_pct | FLOAT | BP saved % |
| break_points_converted_pct | FLOAT | BP converted % |
| winners | INT | Total winners |
| unforced_errors | INT | Total UEs |
| forced_errors | INT | Total FEs |
| net_points_won_pct | FLOAT | Net approach success % |
| avg_rally_length | FLOAT | Average rally length |

---

## 7. API Routes

### 7.1 Current Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/upload` | POST | Upload match file |

### 7.2 Planned Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/process` | POST | Process uploaded file |
| `/api/matches` | GET | List user's matches |
| `/api/matches/[id]` | GET | Get match details |
| `/api/matches/[id]/stats` | GET | Get match statistics |
| `/api/matches/[id]/points` | GET | Get point-by-point data |
| `/api/analytics/trends` | GET | Get performance trends |

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

---

## 9. Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| Initial schema | - | Base tables (users, matches, etc.) |
| add_storage_path_to_match_files | 2026-01 | Added storage tracking columns |
| add_match_metadata_columns | 2026-01 | Added source_provider, analysis_method, etc. |
| fix_match_files_rls_policies | 2026-01 | Proper user-scoped RLS |
| add_verified_column_to_matches | 2026-01 | Admin verification flag |
| cleanup_unused_tables | 2026-01 | Removed conferences, players, schools, video_files |
| cleanup_unused_bucket | 2026-01 | Removed conferences bucket |
| create_contact_submissions_table | 2026-01 | Contact form storage |
| create_newsletter_subscribers_table | 2026-01 | Newsletter signups |

---

## 10. Open Questions / Future Considerations

1. **Opponent Tracking:** Should we create a separate `opponents` table or use the `users` table for opponents?

2. **Historical Data:** How far back should we support data imports?

3. **Data Sharing:** Should users be able to share match data with coaches/analysts?

4. **Video Integration:** Should we support video file uploads linked to matches?

5. **Real-time Updates:** Should we support live match tracking via WebSockets?

6. **Export Functionality:** Should users be able to export their data in various formats?

7. **Multi-tenant Support:** Should coaches be able to manage multiple players?

---

## 11. Glossary

| Term | Definition |
|------|------------|
| ELC | Electronic Line Calling - automated line-call technology |
| SwingVision | AI-powered tennis tracking app for amateur/college players |
| UTR | Universal Tennis Rating - player rating system |
| RLS | Row Level Security - Postgres feature for access control |
| UE | Unforced Error |
| FE | Forced Error |
| BP | Break Point |
