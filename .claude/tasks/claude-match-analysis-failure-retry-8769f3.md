# Tasks — claude/match-analysis-failure-retry-8769f3

> Scope: Keep analyses that failed on the input from being retried — the resubmit ladder refuses an `invalid_input` failure on both the manual and automatic paths — and warn in the upload wizard, from the container's whole-track frame rate, before a video the analysis provider is likely to reject is uploaded.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Refuse to resubmit an `invalid_input` failure

- **status:** done
- **model:** sonnet
- **files:** src/lib/services/splitstep/resubmit-job.ts (parent select ~line 290, refusal after the `not_failed` check ~line 322, `ResubmitRefusalReason` ~line 126), src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts (`REFUSAL_STATUS`, ~line 36), tests/resubmit-authorization.spec.ts (extend — `parentJob()` fixture ~line 101, pattern: the "not failed, or has no video" test ~line 684)
- **done when:**
  - [ ] `resubmitJob()`'s parent select includes `error_category`, and immediately after the `status !== "failed"` refusal — before the `video_object_key` check — a parent with `error_category === "invalid_input"` returns `{ ok: false, reason: "input_rejected", message }`; `ResubmitRefusalReason` gains `"input_rejected"` with a doc comment and `REFUSAL_STATUS` maps it to `409`.
  - [ ] The message says retrying the same file would fail the same way and points to a new recording (suggested: `This video didn't meet one of the recording requirements, so retrying it would stop the same way. Upload a new recording instead.`); it contains `same way` and `new recording` and matches `/splitstep|swingvision/i` zero times (it is shown verbatim by `retry-action-button.tsx`).
  - [ ] `tests/resubmit-authorization.spec.ts`: `parentJob()` defaults `error_category: null`; a new test runs `parentJob({ error_category: "invalid_input" })` through both the manual helper and an `auto: true` call and `expectRefused(…, "input_rejected")` for each (no row written, no reservation, no vendor body, `rosterReads` empty); the accepted-path test still passes with `error_category: "internal"` set on the parent.
  - [ ] The refusal sits inside `resubmitJob()` so the four automatic callers — `src/app/api/webhooks/splitstep/route.ts`, `src/lib/services/splitstep/reconcile.ts`, `src/app/api/splitstep/jobs/route.ts` and the recursive call in `resubmit-job.ts` — inherit it unchanged; the first three are not in the diff, and `isDownloadFailure()` is not in the diff.
  - [ ] `npx tsc --noEmit` passes and `npx playwright test tests/resubmit-authorization.spec.ts` passes.
- **notes:** Live case job 45ff4bd7 (2026-09-28): `error_code = VIDEO_FRAME_RATE_TOO_LOW`, `error_category = invalid_input`, `error_step = trimming_video`. Resubmitting sends the identical blob, so it cannot succeed and spends quota. Automatic resubmission today only fires for `isDownloadFailure()` (step `downloading_video` / code `VIDEO_UNREACHABLE`), which the vendor categorises `video_access`/`internal`, so this does not interfere with the download-failure auto-retry; it is defence in depth. Known categories: `internal`, `video_access`, `video_quality`, `invalid_input`. Only `invalid_input` is refused here (`video_quality` left as is by decision). The UI side (hiding Retry) is T10–T12 on `claude/advantage-intelligence-ui-e6e2f7`; each is correct without the other.

## T2 · Read a video's whole-track average frame rate from its container

- **status:** todo
- **model:** opus
- **files:** src/lib/video/container-frame-rate.ts (new), tests/container-frame-rate.spec.ts (new) — patterns: `src/lib/video/trim.worker.ts` (`Input` + `BlobSource`), `src/lib/match-video/media-inspection.ts` (format list, `dispose()` in `finally`)
- **done when:**
  - [ ] A new module `src/lib/video/container-frame-rate.ts` exports `readAverageFrameRate(file: Blob, options?: { deadlineMs?: number }): Promise<number | null>`. It opens the file with mediabunny's `Input` over `BlobSource` with `formats: [MP4, QTFF]` only, takes the primary video track, and returns `(await track.computePacketStats()).averagePacketRate` (no `targetPacketCount`, so the whole track) rounded to 2 decimals. It calls `input.dispose()` in a `finally`.
  - [ ] It returns `null`, never throws, for: a container that is not MP4/QTFF, a file with no video track, any error from mediabunny, and a read that has not settled by `deadlineMs` (default a module constant of 4000 ms, documented). mediabunny is loaded with a dynamic `import("mediabunny")` inside the function: `grep -n '^import.*mediabunny' src/lib/video/container-frame-rate.ts` returns nothing, so the wizard's main bundle does not grow.
  - [ ] `tests/container-frame-rate.spec.ts` builds its fixtures in the spec with mediabunny's `Output` + `BufferTarget` + `EncodedVideoPacketSource` (no binary video committed) and asserts: an MP4 of 300 packets spaced exactly 1001/30000 s reads within 0.01 of 29.97; an MP4 whose packet timestamps average 29.80 fps (constant spacing with periodic doubled gaps) reads within 0.01 of 29.80; a MOV built the same way at 30 fps reads 30; a WebM built the same way reads `null`; a `Blob` of random bytes reads `null`. If the muxer refuses synthetic packets without a valid decoder description, the spec builds a minimal valid `avcC` in code and says so in a comment.
  - [ ] A deadline case: with `deadlineMs: 1` against a fixture the function returns `null` without an unhandled rejection (or, if that proves timing-flaky, the deadline is factored into an exported pure helper that the spec tests with a never-resolving promise).
  - [ ] `src/lib/video/probe.ts`, the validator and every wizard component are not in the diff (T3 wires it in), and `npx tsc --noEmit` passes.
- **notes:** Why (job 45ff4bd7, 2026-09-28): the vendor rejected a file whose metadata average is 29.94 fps ("video is 29.80 fps", floor 29.9). The wizard's probe samples ~20 frames near the start and snaps within 2%, so it read "30". A 20-frame sample cannot separate genuine 29.97 (which can read as low as 29.93 in Apple's 1/600 timebase) from a 29.94 variable-frame-rate average; the whole-track average can. For MP4/MOV the packet index lives in `moov`, so packet stats read the index, not the media data — a large file costs a few small slices. Matroska/WebM would need a cluster scan, which is why they return `null` and keep today's behaviour. mediabunny is already a dependency (1.56.2), used by `trim.worker.ts` and `media-inspection.ts`. `track.computeFrameRateMetrics()` also exists (`underlyingFrameRate === null` means VFR) — not required here; mention in the diff if it was useful.

## T3 · Warn in the wizard when the whole-track frame rate is below 29.96

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/lib/services/splitstep/config.ts (beside `MIN_VIDEO_FPS` ~line 53), src/lib/video/probe.ts (`VideoProbe`, `probeVideo`), src/lib/services/upload/validators/splitstep-validator.ts (`evaluateVideoProbe` warning channel ~lines 165-178, module header), src/components/dashboard/matches/new-match-wizard/FileStepContent.tsx (`videoFacts`, ~line 346), tests/upload-video-requirements.spec.ts (extend the "frame-rate boundary" describe)
- **done when:**
  - [ ] `config.ts` exports `FRAME_RATE_WARN_BELOW_FPS = 29.96` with a comment: the vendor rejects below 29.9 by its own measurement, job 45ff4bd7 was rejected at a 29.94 container average, and 29.96 sits just under genuine 29.97 (30000/1001) so constant-rate footage never warns. `grep -rn "29\.96" src` matches only `config.ts`.
  - [ ] `VideoProbe` gains optional `averageFps?: number | null`, set by `probeVideo()` from T2's `readAverageFrameRate(file)` run alongside the existing sample; `fps` keeps its current snapped meaning and a `null` average changes nothing.
  - [ ] `evaluateVideoProbe()` blocks exactly what it blocks today. For a probe that passes the gate with `averageFps != null && averageFps < FRAME_RATE_WARN_BELOW_FPS`, it returns `success: true` with one warning (replacing the "Recorded at … fps. 60 fps produces…" line) containing the average to 2 decimals (e.g. `29.94 fps`), the words `variable`, `${PROVIDER_DISPLAY_NAME}` and `constant 30 fps`, and matching `/splitstep|swingvision/i` zero times. Suggested: `This recording averages 29.94 fps, which usually means a variable frame rate, and Advantage Intelligence may reject it. Exporting at a constant 30 fps avoids that.` The validator also exports `formatProbeFps(probe): string | null` — the average to 2 decimals when that warning applies, `` `${probe.fps} fps` `` otherwise, `null` when `fps` is null — and `FileStepContent.tsx`'s `videoFacts` uses it (`grep -n "probe.fps ?" src/components/dashboard/matches/new-match-wizard/FileStepContent.tsx` returns nothing).
  - [ ] `tests/upload-video-requirements.spec.ts` gains cases with the existing `probe()` fixture: `{fps: 30, averageFps: 29.94}` → success, `warnings` length 1 containing `29.94 fps` and `constant 30 fps`, `formatProbeFps` → `"29.94 fps"`; each of `{fps: 30, averageFps: 29.97}`, `{fps: 30, averageFps: 30}`, `{fps: 60, averageFps: 59.94}`, `{fps: 30, averageFps: null}` and `{fps: 30}` → no warning containing `constant 30 fps`, `formatProbeFps` → `"30 fps"`/`"60 fps"`; `{fps: 24, averageFps: 24}` still fails; every pre-existing frame-rate test passes unedited.
  - [ ] Not in the diff: `VideoRequirements.tsx`, everything under `src/components/dashboard/matches/match-video-attachment/`, `snapToStandardFps()`, `STANDARD_FPS`, `FPS_SNAP_TOLERANCE`, `FPS_SAMPLE_FRAMES`, `src/lib/video/container-frame-rate.ts`. The validator's module header gains a paragraph recording the warning band, the live case, and that it warns rather than blocks until the vendor answers Q14 in `docs/splitstep-vendor-questions.md`. `npx tsc --noEmit` passes.
- **notes:** Decision (2026-09-28): warn, never block; use the whole-track average, not the 20-frame sample (author chose mediabunny over the sample-based draft). The vendor's own number for job 45ff4bd7 was 29.80 against a 29.94 container average, so its formula differs from ours; 29.96 catches that file without touching constant 29.97/30/60 footage. Non-MP4/MOV files get `null` from T2 and behave as today. The add-video path gets no warning — its header says it never reaches the analysis provider. `VideoRequirements.tsx`'s "30 fps minimum (29.97 fps accepted)" stays true. Guardrails §3.1: only the displayed fact changes in `FileStepContent`; the warnings list already renders (~line 545). Customer copy uses `PROVIDER_DISPLAY_NAME`, never the vendor's name.
