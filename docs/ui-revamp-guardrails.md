# UI revamp guardrails — what the Advantage Intelligence pipeline needs from the UI

**Status:** current as of 2026-08-15, branch `splitstep-integration` @ `60204fd`
**Read alongside:** [`r2-and-webhook-overview.md`](r2-and-webhook-overview.md) (how the pipeline works), [`ux-overhaul-brief.md`](ux-overhaul-brief.md) (what to build — but see §6, parts of it are stale)

The video pipeline works end to end and has carried one real full-length match.
This document exists so a UI rewrite does not silently break it. It is written
for an agent or developer who did not build the integration.

The short version: **the UI owns everything the player sees. It does not own the
five inputs the vendor needs, the status vocabulary, or the deletion path.**
Redesign freely around those.

---

## 1. What is done — do not re-litigate

Verified against a real job (86 min, vendor job `778912d7`, our job
`2a11168d`), not a test harness:

| | Evidence |
|---|---|
| Chunked upload → Azure | 1.54 GB committed |
| Auto-submit on upload completion | vendor accepted, `external_job_id` recorded |
| `VideoUrl` SAS | vendor fetched it |
| Webhook receipt + HMAC | 2 deliveries, both `signature_verified: true` |
| Signature enforcement | `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true`, suite green |
| Results JSON | 645 KB → `match-results` bucket |
| Trimmed video capture | 1.43 GB copied into our container, `copyStatus: success` |
| Source reclaim | 1.54 GB deleted, vendor's SAS neutralised |
| Quota | reserved to the second; refund on failure tested |

Turnaround was 75 minutes for an 86-minute video. Their results SAS expires
after ~7 days.

**What the trimmed video actually is** (watched 2026-08-16, after the table
above was written): the `StartTime`/`EndTime` window from our own job request,
re-encoded. Not dead time removed, no annotations, no overlays. Submitted window
5181.207s, returned video 5181.268s. Anything in the UI that offers this file to
a player should call it the match video, never a highlight or condensed cut —
for a player who trimmed nothing it is their upload at a lower bitrate.

---

## 2. Never touch

**The SwingVision path.** `swingvision-parser.ts`, `swingvision-validator.ts`,
the `process-match` Edge Function, and every existing row. Every video code path
is additive; nothing about the file-import flow was changed and nothing should
be. Doubles teams and existing users depend on it.

**`calculate_match_stats`.** If you believe it must change, stop and ask.

**Existing match data.** No backfills, no mutations.

**These files are the integration, not UI.** Changing them to suit a layout is
almost always the wrong fix:

```
src/app/api/webhooks/splitstep/route.ts    receives vendor deliveries
src/app/api/splitstep/jobs/route.ts        submits a job, reserves quota
src/app/api/splitstep/upload-url/route.ts  mints the browser's write SAS
src/lib/services/splitstep/**              payload build, keys, quota, Azure, reclaim
supabase/migrations/**                     never edit an applied migration
```

**Never invent vendor behaviour.** If the API docs do not say it, ask. The
payload carries a live credential to an athlete's video; a guess is not free.

**Customer-facing strings never name SplitStep.** Internally `splitstep`; in any
user-visible string the provider is **"Advantage Intelligence"**.

---

## 3. Touch carefully — the seams

These are UI files, so a revamp will rewrite them. Each carries an invariant
that is not obvious from reading the component.

### 3.1 The upload wizard — `components/dashboard/matches/new-match-wizard/`

**Five fields are required by the vendor and validated in
`lib/services/splitstep/job-request.ts`.** Drop one, or make it optional, and
submission returns 422 with a field list:

- both player names
- at least one non-zero set score
- `initialTopPlayerIsPlayer1` — which end you were on at video start
- `fixedCamera` — did the camera stay put
- `adScoring` — ad or no-ad

They are typed `boolean | null | undefined` on purpose. **Do not "simplify" them
to `boolean` with a default.** A null coerced to `false` is a wrong answer that
looks like a real one — see §4.

**The trim window is not cosmetic.** `videoStartSeconds`/`videoEndSeconds` become
the vendor's `StartTime`/`EndTime` *and* `billable_seconds`, which is what the
2-hour monthly cap is charged against. Removing the trim step means every job
bills the full recording.

**`useUploadMatchWizard.ts` invariants:**
- The `processing_jobs` insert must `.select("id").single()`, and every later
  write must key on that id. Keying on `match_id` touches every job a
  resubmitted match ever had.
- Upload progress is throttled to 0.1% steps. Do not write per chunk.
- Auto-submit fires after the terminal `status: 'uploaded'` write. **A submit
  failure must not mark the job failed** — the bytes are in Azure and `uploaded`
  is the one state a retry needs nothing re-uploaded from.

### 3.2 Analysis status — `lib/data/match-analysis.ts`

Shared by the matches list *and* the match detail page, so both agree about one
row. It was consolidated here after they disagreed once.

**There are three predicates and they mean different things.** Collapsing them
reintroduces fixed bugs:

| Predicate | Question | Drives |
|---|---|---|
| `isInFlight` | will this ever change? | grouping, filtering, the match page's short-circuit |
| `isWorking` | is something happening *right now*? | the animated sheen |
| `isLiveUpdating` | is a DB update actually coming? | Realtime subscriptions |

`uploaded` is in-flight, not working (nothing to animate), but *is* live-updating
(auto-submit fires in seconds). `processed` is in-flight, not working, and **not**
live-updating — subscribing on it held a WebSocket open forever per user.

**`resolveAnalysisStatus(status, derivation_version)` needs both columns.** The
vendor's `completed` means *their* half is done. Until derivation runs, the UI
must show `processed` → **"Stats pending"**, not "Analyzed". Treating `completed`
as "show stats" renders a page of empty charts, which reads as "you hit no
serves".

### 3.3 The match detail short-circuit — `app/dashboard/matches/[matchId]/page.tsx`

When `isInFlight(status) || isAnalysisFailed(status)`, the page renders hero +
summary + `MatchAnalysisProgress` and **returns early**. Keep that gate. Every
stat section below it would draw zeroes.

### 3.4 Match deletion — `app/api/matches/[matchId]/route.ts`

Storage keys live on `processing_jobs`, which **cascades away with the match**.
All cleanup must run *before* the row delete, and must cover all three:
`video_object_key`, `trimmed_object_key`, `results_object_key`. Missing one
strands multi-GB blobs that nothing can name. This has been the bug twice.

### 3.5 Safe to redesign freely

Layout, typography, spacing, card structure, charts, court visualisations,
copy, navigation, empty states, the progress track's appearance
(`analysis-progress-track.tsx`), and the wizard's step *presentation* — as long
as §3.1's five fields still get collected.

~~`match-video-panel.tsx` and `use-video-upload.ts` are **dead**.~~ **Deleted**
on `claude/pilot-program-roadmap-724bdb`, once real playback existed to replace
them — a dead near-duplicate beside working code is how the wrong one gets
edited later.

---

## 4. The three inputs that silently corrupt everything

No downstream check can catch these. The page renders, the numbers look
plausible, and every statistic belongs to the wrong player.

1. **"Your end at video start"** is **camera-relative at the first frame** — is
   player 1 at the *top of the frame* (far side from the camera). Not the deuce
   side, not who served first, not a compass direction. Ends change every odd
   game, so it describes the opening and nothing else.
2. **Set scores are reordered top-player-first** before sending. That ordering
   depends on #1 being right.
3. **Tiebreak sets send the GAME count.** A 7-6 set is `[7, 6]` — never the
   tiebreak points.

If a redesign changes how these are asked, keep the *meaning* identical and
re-read `job-request.ts`'s header comment first.

**Open question:** our field says "video start", but the vendor analyses from
`StartTime`. If a trim begins several games in, ends may have changed between
frame zero and the trim point, and which one they mean is unconfirmed. Trim near
the start of the match and the ambiguity disappears.

---

## 5. Open action items — none are UI

**Blocking a production launch**
- `SPLITSTEP_API_KEY` is set on Vercel **Preview only**. Production submissions
  will 503 until it is added there.
- Vercel crons run against **Production only**, so `/api/cron/reclaim-videos`
  never fires on the Preview deployment that serves `advantage-analytics.dev`.
  Until this reaches Production, run the reclaim by hand:
  `npx tsx scripts/cleanup-orphan-storage.ts --apply`

**Ask the vendor** (contact: Christian; endpoint `https://splitstep.ngrok.io/jobs`)
- Echo `MatchID` on webhooks. Their payload carries `job_id` and `video_id` but
  not `MatchID`, which is why deliveries that beat our id write had to be adopted
  after the fact (`adopt-deliveries.ts`). Echoing it makes the race impossible.
- What does `player_detection_score: 0.549` indicate? It was the weakest of five
  quality scores on the first job, and player attribution is exactly what Phase 2
  depends on.
- Confirm the max video size. Docs say 8 GB enforced; an earlier call suggested
  10–12 GB. `MAX_VIDEO_SIZE_BYTES` takes the conservative number.
- Is a lost delivery recoverable? `GET /jobs/{job_id}` returns status but not
  `sas_url`/`trimmed_video_url`, so it does not get the results back.
- Is dead-time removal or an annotated render available at all? `trimmed_video_url`
  returns our submitted window re-encoded and nothing else. If a rally-only cut or
  an overlay render exists behind a flag we are not setting, that changes what the
  video surface can offer — and whether keeping their copy over ours is worth it.

**Code, non-UI**
- **Promote the five quality scores to columns.** `homography`, `ball_detection`,
  `bounce_detection`, `player_detection`, `stroke_detection` arrive on every
  completion and sit unqueryable in `raw_webhook_payload`.
- **Wire `GET {BASE_URL}/jobs/{job_id}`.** Three separate moments have wanted it:
  recovering a lost delivery, replacing the `vendor_first_downloaded_at` signal
  the Azure move killed, and answering "has it started yet".
- **Revisit the source-video delete now that "trimmed" is understood.** The
  policy retires our 1.54 GB master once the vendor's copy lands, which was
  written believing that copy was a shorter, better cut. It is the same footage
  at 2.2 Mbps minus the trim window, so the swap is a downgrade. Options: keep
  the source, keep whichever is longer, or keep theirs only when the player
  actually trimmed something. Not urgent — one job has run — but it decides
  what a player can still be given if Phase 2 ever needs a re-submit.
- **`trimmedCopyStatus()` cannot distinguish a failed copy from a pending one**
  (`video-url/azure-sas.ts`) — the catch returns `pending` for a 404. A copy
  whose blob never materialises looks in-progress forever while
  `trimmed_video_url` expires.
- **The untrimmed cost warning keys off the handles, not the cost.**
  `untrimmed = duration > 0 && start <= 0 && end >= duration - 1`, so trimming 15
  seconds off an 87-minute video suppressed a warning about spending 86 of 120
  monthly minutes. Should warn on the *share of remaining quota*.
- **Land `plan-role-split`.** Migration `20260806144035` is applied in
  production — `users.plan` exists, is backfilled, and is trigger-protected — but
  no deployed code reads it. Stripe and the subscription page still use
  `users.role`. They agree with each other so payments work; it is drift, not an
  outage. That branch is the missing code half.
- **Phase 4, retire R2** — on hold. If trimmed videos eventually move to R2 for
  zero-egress playback, deleting `workers/video-access/` now means rebuilding it.
- **Ten older migrations carry no applied version stamp.** Verify before trusting
  `supabase db push`.

**Gated, not forgotten**
- **Phase 2 derivation** — blocked on vendor questions Q8/Q9/Q13. This is what
  makes "Stats pending" resolve into real numbers. A real 596-stroke / 114-rally
  payload now exists as an input.
- ~~**Playback.**~~ **Shipped** on `claude/pilot-program-roadmap-724bdb` —
  `mintPlaybackSas()` (read-only, 30 minutes) plus `MatchVideoCard` on the match
  page, streamed direct from Azure because proxying breaks range requests. The
  R2 question it raised is now live rather than hypothetical: egress is $0 there
  against Azure's ~$0.087/GB, and video is being served. See
  [`pilot-branch-handoff.md`](pilot-branch-handoff.md).

---

## 6. Corrections to `ux-overhaul-brief.md`

That brief is dated 2026-08-06 and is still the best statement of *what to
build*. Four of its "broken" items are now fixed — do not action them:

- §2.2 #1 "`getMatchAnalysis` is a mock" — **fixed.** `match-analysis-server.ts`
  reads real `processing_jobs` rows.
- §2.2 #3 "CLAUDE.md describes a deleted app" — **fixed** in `60204fd`, along
  with the unreachable breadcrumb code.
- §2.2 #5 "⌘U documented as global / help says modal" — **fixed** in the same
  commit.
- §2.2 #2 the role collision — **half fixed.** The migration is applied; the code
  is on `plan-role-split` (see §5).

Also stale in its constraints table: it describes a Cloudflare Worker download
log as the "processing started" signal. R2 and the Worker are retired; source
video is in Azure Blob and that signal no longer exists.

---

## 7. Verification you can run

```bash
npx tsc --noEmit && npm run build && npm run lint   # expect 43 pre-existing warnings, 0 errors
npx tsx scripts/splitstep-webhook-test.ts --url https://www.advantage-analytics.dev
npx tsx scripts/cleanup-orphan-storage.ts           # dry run, deletes nothing
```

The webhook suite needs `SPLITSTEP_WEBHOOK_SECRET` in `.env.local` to match the
value in Vercel, or every signed delivery returns 401 — that is a local key
mismatch, not a broken deployment.

To check a job end to end:

```sql
select status, derivation_version, external_job_id,
       results_object_key, trimmed_object_key,
       jsonb_array_length(raw_webhook_payload) as payloads
from processing_jobs order by created_at desc limit 3;
```

A healthy completed job: `status = completed`, `derivation_version` null (so the
UI says "Stats pending"), both object keys set.
