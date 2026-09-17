# Stage 02 blocked: live schema access

## Blocker

The design contract requires live database schema verification. The Supabase MCP
can return its project URL, which matches this checkout's configured project
(`pouxujkhtbvkdwbzfvka`), but both `execute_sql` and `list_tables` return
`Insufficient scope`. This is a connector authorization failure, not evidence
about the database's RLS policies.

No database writes were attempted. No primary `design.md` has been written, so
the runner must not advance to stage 03.

## Findings to preserve

- Route trace: `/dashboard/matches/[matchId]` renders `FilmTab` through
  `src/app/dashboard/matches/(detail)/[matchId]/page.tsx`. Its sibling layout
  supplies the match and points through `MatchDataProvider`.
- `FilmTab` renders `FilmEmptyState` when no video is supplied. Its populated
  view uses the same point stops for the embedded player and fullscreen player.
- `getMatchVideo` checks match visibility using the caller's Supabase client,
  then reads processing-job object keys using the admin client and signs an Azure
  playback URL. Its current implementation has no independent attachment lookup.
- `MatchVideo.startTimeSeconds` is the number of seconds subtracted from source
  point timestamps. `film-timeline.ts` centralizes that conversion and the
  windows used for seeking, looping, next/previous, and dead-time skipping.
- The video-analysis configuration allows MP4, MOV, M4V, AVI, MKV, and WebM
  containers and sets an exclusive decimal 8 GB bound (`7,999,999,999` bytes).
  These are existing analysis-upload settings, not proof that each container and
  codec can be played in every browser without conversion.
- The UI guardrails describe Azure as the current video store and retaining the
  uploaded source for playback. They also require object cleanup as part of match
  deletion; an independent attachment must participate in that lifecycle.

## Approaches to finish evaluating

1. **Independent attachment metadata plus a playback offset — recommended.**
   Upload into private Azure storage and associate the committed file and its
   alignment with the existing match. Reuse the shared Film timeline conversion.
   This supports replacement and correction without accumulating changes to the
   original imported timestamps. Requires a verified persistence, authorization,
   and cleanup design.
2. **Store attachments as analysis processing jobs.** Reuses the existing video
   lookup, but couples a file attachment to job status, auto-submission, quota,
   and vendor processing. Avoid unless inspection demonstrates a safe existing
   distinction; the feature does not ask for new analysis.
3. **Rewrite imported event timestamps on every alignment.** Makes stored times
   reflect the uploaded recording directly, but complicates reversal, repeated
   corrections, and failed replacements. Avoid in favor of preserving the source
   clock and applying one saved offset consistently to playback.

## Provisional interaction and timing direction

- In Film, offer Add video when absent and Replace video / Adjust alignment when
  present, subject to verified mutation permissions.
- Choose a file, preview it, and mark the first imported point's serve contact
  using playback or an editable timestamp. Ask for explicit confirmation; do not
  assume the first point is at video zero.
- For source first-point time `S` and chosen video time `V`, save an offset of
  `S - V`; an event at source time `T` plays at `T - (S - V)`. Allow either sign.
  Do not change event durations. Recompute corrections from the source clock.
- Verify coverage without the Film player's cosmetic lead-in/run-out padding.
  Show "This video is not long enough." when the actual match timeline does not
  fit. How to determine the final event's end requires the live timing schema.
- Keep the old attachment and alignment active until a replacement or correction
  succeeds. Failed or cancelled work must preserve them.
- Follow the design system's white surfaces, dialog and field vocabulary,
  accessible controls, and one primary action. Keep upload progress factual.
- Use the existing near-8 GB ceiling as the proposed initial attachment size
  policy, separate from vendor analysis requirements. Final format support needs
  an explicit playback/normalization decision; an extension allowlist alone does
  not satisfy the requested broad format support.

## What unblocks this stage

1. Restore the Supabase connector's authorization for read-only schema and SQL
   access on the configured project.
2. Inspect the live match, point, shot, processing-job, and any existing attachment
   schema, including event timing fields, mutation policies, and deletion rules.
3. Resolve this blocker file (the pipeline requires its removal or resolution)
   and rerun `/feature-next swingvision-add-video` to finish stage 02.

Remaining design work: confirm the persistence and permission contracts; define
safe attachment commit/replacement and cleanup; settle supported codecs and any
conversion requirement; resolve retention; and write the full architecture,
components, data flow, error handling, and test cases in `design.md`.

## Also consulted

Beyond the stage's declared brief, map, guardrails, design-skill entry point, and
empty references directory:

- `.claude/skills/trace-route/SKILL.md` — required route-tracing procedure.
- `.skills/advantage-analytics-design/reference/chrome.md`, Dialog section —
  dialog geometry, controls, and action grammar.
- `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` — Film import and props.
- `src/app/dashboard/matches/(detail)/[matchId]/layout.tsx` — match-data provider.
- `src/components/dashboard/matches/match-detail/film/film-tab.tsx` — entry state,
  playback ownership, and shared timeline consumers.
- `src/components/dashboard/matches/match-detail/film/film-timeline.ts` — clock
  conversion, point duration fallback, and playback padding.
- `src/lib/data/match-video-server.ts` — video type, authorization, lookup, signing.
- `src/lib/services/splitstep/config.ts`, video validation constants — current
  analysis-upload container allowlist and size limit.
- `.env.local`, only `NEXT_PUBLIC_SUPABASE_URL` — project identity comparison;
  no credentials copied into this artifact.
- Supabase MCP `get_project_url` — configured project confirmed;
  `execute_sql` and `list_tables` — schema access unavailable (`Insufficient scope`).
