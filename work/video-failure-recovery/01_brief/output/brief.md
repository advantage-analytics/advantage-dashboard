# Brief — Retry only where it can help, and surface every video failure

## Goal

When a match's analysis fails, the user should see what went wrong in plain
words and the one action that can actually fix it. Today Retry shows up for
every failure. Where it can't help, it wastes allowance and attempts. It is
missing where it would help, and some failures never reach the user at all.

Every failure should land in exactly one **recovery class**, and that class
decides both the action offered and the copy:

| Class | Meaning | Example |
| --- | --- | --- |
| **Retry** | Transient; trying the same thing again can succeed | vendor download failure, results download failing after the vendor completes, network error on submit |
| **Upload again** | The video bytes never landed, so there is nothing to retry from | network drop mid-upload, tab closed, job reaped after 15 min, Azure 403 |
| **Fix the recording** | The vendor rejected the video itself; re-sending the same file will fail again | `VIDEO_FRAME_RATE_TOO_LOW`, camera placement, video length |
| **Wait or ask** | Blocked by allowance or permission, not by the video | allowance used up, 422, not eligible |
| **Re-derive** | Vendor results are fine; our statistics step failed | transient `derivation_failed` (calculate_match_stats RPC or Postgres error) |

## Scope

1. **Server-side classification.** One source of truth maps a job's stored
   `error_code` / `error_category` / `error_step` (and status) to a recovery
   class. The match page, the drawers and the resubmit route all read the
   same answer, so the button and the route always agree.
2. **resubmitJob refuses permanent classes.** A manual resubmit of a
   Fix-the-recording, Upload-again or Wait-or-ask failure is refused with a
   clear reason. It does not reserve allowance or use up an attempt.
3. **Per-class action and copy** on every surface that shows a failed video
   job: the match page (`match-analysis-progress.tsx`), the match drawer
   (`match-drawer.tsx`) and the event-line drawer (`event-line-drawer.tsx`).
   Fix the Upload-again copy, which today claims the uploaded video is reused.
4. **Recovery where it's missing.**
   - Re-derive for transient `derivation_failed`.
   - Retry or recovery for a results download that fails after the vendor
     completes. Today those jobs sit at "Stats pending" forever, because
     `reconcile.ts` only polls submitting, queued and processing jobs.
5. **Surface hidden failures:**
   - Show the stored reason on a stalled `uploaded` row (allowance used up,
     422, not eligible).
   - Keep the vendor's submit reason instead of overwriting it with "Could
     not submit this match for analysis." (`submit-match-video.ts`).
   - Stop webhook signature 401s from leaving jobs at "Processing" forever,
     so the user sees a real state.
   - Stop swallowing SwingVision `process-match` errors
     (`src/app/api/upload/route.ts`, where invoke returns `{error}` and never
     rejects).
   - When a score fold is unreconciled, still publish the match, but show the
     user a plain caveat that the score could not be fully matched to the
     points. Today the only signal is a console.warn.
6. **No raw internals in user copy.** Azure XML, "Failed to fetch", "Edge
   Function returned a non-2xx status code" and Postgres errors never appear
   as the failure note. Every class gets plain copy.
7. **Early fps check in the upload wizard**, before upload, so no allowance
   is spent on a video the vendor will reject for frame rate.

## Non-goals

- **Ops alerting.** No admin console entries, emails or PostHog events for
  system-side failures. This feature fixes what users see; ops visibility is a
  separate feature.
- Changing the automatic retry policy (`isDownloadFailure()`, once per chain)
  or Azure block-upload retry. Both already classify correctly.
- Raising or reworking the three-attempt limit or the allowance model.
- Pre-checks for other vendor rejections (camera, length) beyond frame rate.
- Any change to what the vendor accepts.

## Constraints

- Read `docs/ui-revamp-guardrails.md` and `AGENTS.md` before any UI change.
  "Advantage Intelligence" is the only user-visible provider name, so
  `splitstep` never appears in copy.
- Check schema against the **live DB**, not `supabase/migrations/`:
  `processing_jobs` has `error_code`, `error_category`, `error_step`,
  `attempt_count`, `resubmitted_from_job_id` and `auto_resubmitted`.
- Build classification on the stored columns. Existing failed rows (for
  example job 45ff4bd7…, `VIDEO_FRAME_RATE_TOO_LOW` at `trimming_video`) must
  come out in the right class without being rewritten.
- Follow the design system (`.skills/advantage-analytics-design/SKILL.md`),
  and use `advButton()` for primary actions.
- Branch off `splitstep-integration`; the PR targets `splitstep-integration`.

## Success criteria

- Job 45ff4bd7… (frame rate too low) shows "Fix the recording" copy and no
  Retry. A manual POST to its resubmit route is refused with a clear reason,
  and no allowance or attempt is consumed.
- An upload-stage failure offers "Upload again", never a Retry that returns 409.
- A transient `derivation_failed` offers Re-derive, and running it produces
  stats without another vendor submission.
- A results download that fails after the vendor completes no longer stays at
  "Stats pending" indefinitely.
- A stalled `uploaded` row shows its stored reason. Vendor submit reasons
  reach the user. A webhook-signature failure does not leave a job at
  "Processing" forever. A SwingVision `process-match` error shows as a failure.
- An unreconciled score fold publishes with a visible caveat.
- No failure note shown to a user contains Azure XML, "Failed to fetch",
  "non-2xx", or a Postgres error string.
- A video below the vendor's frame-rate floor is stopped in the wizard before
  upload starts.
- The button shown and the route's decision come from the same server-side
  classification.

## Open questions

- **Frame-rate floor and detection.** What exact fps does the vendor reject
  below, and can the browser read fps reliably across the containers users
  upload (MOV/HEVC from iPhone, MP4)? If detection is uncertain for a file,
  should the wizard warn or block?
- **Unknown codes.** Which class does a failure with no `error_code`, or a
  code we have never seen, fall into? Retry, or a conservative "contact us"?
- **Webhook signature 401s.** When the signature fails, how should the job
  leave "Processing": reconcile polls the vendor directly, or the job times
  out into a class?
- **Re-derive against the attempt limit.** Does Re-derive count toward the
  three attempts? It never calls the vendor, and whether it reserves
  allowance is a question for design.
- **Wait or ask copy for teams.** On a team workspace, who does the user ask
  (owner or coach), and does the copy name them?
- **Where the fold caveat lives.** Is it on the match page only, or also on
  list and drawer rows?
