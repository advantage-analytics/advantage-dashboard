# SplitStep API — our reference copy

**Source:** the vendor's page at <https://splitstep.ai/api-docs.html>, read
2026-10-10. Where what we have measured in real payloads differs from the page,
the measurement is noted in a **We see** line, because the code follows the
payloads. The page has no version number or changelog, so diff it against this
file when it changes. Customer-facing copy calls the provider "Advantage
Intelligence"; "SplitStep" is internal only.

Where each part lives in our code:

| Vendor surface          | Our code                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `POST /jobs`            | `src/lib/services/splitstep/job-request.ts`, `submit-match-video.ts`               |
| `GET /jobs/{job_id}`    | `reconcile.ts` (polls stuck jobs)                                                  |
| `DELETE /jobs/{job_id}` | `POST /api/splitstep/jobs/[jobId]/cancel`                                          |
| Webhooks                | `src/app/api/webhooks/splitstep/route.ts`, `webhook-payload.ts`, `webhook-auth.ts` |
| Result files            | `vendor-archive.ts` (keeping them), `derivation/` (reading them)                   |

## Authentication and base URL

- The base URL is assigned per customer (`SPLITSTEP_API_URL`). The vendor's
  example client uses a placeholder.
- Requests send the header `X-Api-Key: <key>` (`SPLITSTEP_API_KEY`).
- The webhook signing secret is separate from the API key
  (`SPLITSTEP_WEBHOOK_SECRET`).
- The page does not document rate limits.

## Endpoints

| Method | Path             | Does                  | Returns                                                                             |
| ------ | ---------------- | --------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/jobs`          | Submits a job         | `job_id`, `video_id`, `status: "queued"`, `message`                                 |
| GET    | `/jobs/{job_id}` | Gets one job's status | `job_id`, `video_id`, `status`, `queued_at`, `updated_at`, and `error` once failed  |
| GET    | `/jobs`          | Lists in-flight jobs  | `jobs[]` of queued or processing jobs: `job_id`, `video_id`, `status`, `updated_at` |
| DELETE | `/jobs/{job_id}` | Removes a queued job  | 200; the record is deleted. Queued jobs only                                        |

We don't call `GET /jobs`.

### Job request (`POST /jobs`)

| Field                   | Type          | Req. | Meaning                                                                                       |
| ----------------------- | ------------- | ---- | --------------------------------------------------------------------------------------------- |
| `MatchID`               | string        | yes  | Unique id for the video. The vendor returns it as `video_id`                                  |
| `VideoUrl`              | URL           | yes  | An Azure Blob URL, normally with a SAS token. Any other host is refused (`VIDEO_URL_INVALID`) |
| `InitialTopPlayer`      | string        | yes  | The player at the **top** of the frame at `StartTime`. Camera-relative, not player 1          |
| `InitialBottomPlayer`   | string        | yes  | The player at the bottom of the frame at `StartTime`                                          |
| `StartTime` / `EndTime` | float s       | yes  | The window to process, in seconds from the video's start                                      |
| `SetGameScores`         | `[[n, n], …]` | yes  | Games per set, as `[top, bottom]`, e.g. `[[6,4],[6,1]]`                                       |
| `FixedCamera`           | bool          | yes  | False if the camera pans                                                                      |
| `Ad`                    | bool          | yes  | Advantage scoring                                                                             |
| `MatchDate`             | `YYYY-MM-DD`  | no   |                                                                                               |

`InitialTopPlayer` and `SetGameScores` are the two inputs that silently swap
every statistic when wrong (`docs/ui-revamp-guardrails.md`).

## Webhooks

Each job sends two deliveries: one when queued, and one when it completes or
fails. Each is signed with `X-HMAC-Signature`, which is
`base64(HMAC-SHA256(secret, raw body))`. We compare it in constant time.

| Event     | `status`                       | Fields                                                                                                 |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Queued    | `queued`                       | `job_id`, `video_id`, `message`                                                                        |
| Completed | `job_completed`                | `job_id`, `video_id`, `message`, `strokes_url`, `players_url`, `trajectories_url`, `trimmed_video_url` |
| Failed    | `job_failed`                   | `job_id`, `video_id`, `message`, `error{code, category, message, detail, step}`                        |
| Stale     | `job_failed`, code `JOB_STALE` | as Failed, plus `queued_at` and `updated_at`                                                           |

- Every URL on a completion is an Azure SAS URL **valid for 7 days**.
- `trajectories_url` may be `null`.
- The top-level `message` is kept only for backward compatibility. Don't parse
  it; branch on `error.code`, or on `error.category` for codes we don't know
  yet.
- The page states no retry or delivery guarantee. The vendor told us by email
  there is no retry, so the route returns 200 before doing any slow work.
- **We keep everything a completion links to** (`vendor-archive.ts`):
  - the strokes JSON, plain;
  - the players JSON, gzipped, because a long match's file is 60–80 MB and the
    `match-results` bucket caps an object at 50 MB;
  - the trajectories JSON, plain;
  - the trimmed video, copied server-side into Azure `trimmed/…`.

  Anything a delivery misses is retried daily by
  `/api/cron/archive-vendor-files` while its URL lives.
  `scripts/splitstep-archive-vendor-files.ts` runs the same sweep by hand.

- Job statuses are `queued`, `job_processing`, `job_completed` and `job_failed`.

## Errors

`error.category` is `invalid_input` (the request or the video must change) or
`internal` (the vendor's fault). The vendor may add codes, so branch on
category by default. `step` names the pipeline step that failed. The page only
gives `downloading_video`; we have also seen `trimming_video`.

| Code                                                                                      | HTTP / where            | Category      | Meaning                                                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `INVALID_REQUEST`                                                                         | 422 on POST             | —             | Body failed schema validation                                                               |
| `MISSING_REQUIRED_FIELD`                                                                  | 422 on POST             | —             | A required field is missing                                                                 |
| `VIDEO_URL_INVALID`                                                                       | 422 on POST             | —             | `VideoUrl` is not an Azure Blob URL                                                         |
| `UNAUTHORIZED`                                                                            | 401                     | invalid_input | The key is missing or wrong                                                                 |
| `QUEUE_ERROR`                                                                             | 503 on POST             | —             | Couldn't queue the job; contact the vendor                                                  |
| `JOB_NOT_FOUND`                                                                           | 404 on GET/DELETE       | invalid_input | No such job for this key                                                                    |
| `JOB_NOT_REMOVABLE`                                                                       | 409 on DELETE           | invalid_input | The job is not queued; `detail` says processing, completed or failed                        |
| `STATUS_UNAVAILABLE`                                                                      | 503 on GET/DELETE       | internal      | The job store couldn't be read or updated                                                   |
| `VIDEO_UNREACHABLE`                                                                       | webhook                 | invalid_input | Couldn't fetch the video (expired SAS, or the blob moved)                                   |
| `VIDEO_TOO_LARGE`                                                                         | webhook                 | invalid_input | Over 8,000,000,000 bytes                                                                    |
| `VIDEO_UNREADABLE`                                                                        | webhook                 | invalid_input | Can't be decoded, or has no video stream                                                    |
| `VIDEO_RESOLUTION_TOO_LOW`                                                                | webhook                 | invalid_input | Below 1920×1080                                                                             |
| `VIDEO_FRAME_RATE_TOO_LOW`                                                                | webhook                 | invalid_input | Below 29.9 fps (29.97 is accepted). See vendor-questions Q14 for how it's measured          |
| `NO_COURT_VISIBLE` / `NO_PLAYERS_DETECTED` / `NO_STROKES_DETECTED` / `NO_SERVES_DETECTED` | webhook                 | invalid_input | Nothing usable was detected                                                                 |
| `INTERNAL_ERROR`                                                                          | webhook                 | internal      | Unexpected failure. With step `downloading_video` we auto-resubmit once (`resubmit-job.ts`) |
| `JOB_STALE`                                                                               | webhook, and 200 on GET | internal      | Stopped reporting progress and will not complete                                            |

`GET /jobs/{job_id}` error bodies carry only `job_id` and `error`.

## Video requirements

| Attribute  | Requirement                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| Resolution | At least 1920×1080                                                                 |
| Frame rate | At least 30 fps, 60 recommended. 29.97 is accepted; the floor is 29.9              |
| Format     | MP4/H.264 preferred; anything ffmpeg decodes                                       |
| Size       | Under 8 GB                                                                         |
| Length     | No limit. The window should cover whole games consistent with `SetGameScores`      |
| Play       | Singles only                                                                       |
| Camera     | Behind a baseline, centred, raised, with both baselines in view. Fixed if possible |

## Result files — shared conventions

- Missing values are `-9999.0` for floats, `-9999` for integers and `"None"` for
  strings.
- `_m` fields are metres on the court plane. The origin is the net midpoint;
  +y runs toward the far baseline (the top of the video) and +x toward the right
  sideline. Lines sit at roughly: sidelines x ±4.12, service lines y ±6.4,
  baselines y ±11.89. Our derivation converts these to its own frame in
  `derivation/court.ts`. Never mix the two frames.
- `_px` fields are pixels in the video frame.

### Strokes file (`strokes_url`) — one object per contact

| Field(s)                                                                                                               | Meaning                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `video_id`, `event_id`                                                                                                 | Match id; zero-based stroke index                                                                                                      |
| `frame`, `time`                                                                                                        | Contact frame; seconds from the start of the processed video                                                                           |
| `rally_id`, `rally_stroke_number`, `player_id`, `point_score`, `game_score`, `set_score`                               | Taken from input metadata **when it is provided**. We don't provide any                                                                |
| `pred_rally_id`, `pred_rally_stroke_number`, `pred_player_id`, `pred_point_score`, `pred_game_score`, `pred_set_score` | **Beta** predictions. Scores are hyphenated pairs; the page says `point_score` is from the server's perspective (vendor-questions Q10) |
| `stroke_type`                                                                                                          | `serve`, `groundstroke` or `volley`                                                                                                    |
| `stroke_side`                                                                                                          | `forehand`, `backhand` or `overhead`                                                                                                   |
| `stroke_score`, `side_score`                                                                                           | Detection and side confidence, 0–1                                                                                                     |
| `player_x_m`, `player_y_m`, `player_{x1,y1,x2,y2}_px`                                                                  | The hitter's court position and pixel box                                                                                              |
| `opponent_x_m`, `opponent_y_m`, `opponent_{x1,y1,x2,y2}_px`                                                            | The opponent's position at contact                                                                                                     |
| `speed_kmh`, `ang_vel_mag_rpm`, `spin_type`                                                                            | Ball speed after contact; spin in RPM; `topspin`, `backspin`, `sidespin` or `flat`                                                     |
| `initial_height_m`, `height_at_net_m`, `net_hit`                                                                       | Height at contact; height crossing the net; whether it hit the net                                                                     |
| `bounce_frame`, `bounce_score`, `bounce_{x,y}_m`, `bounce_{x,y}_px`                                                    | The next bounce. `bounce_frame` is typed as a float                                                                                    |
| `in`, `line_confidence`                                                                                                | The vendor's in/out call, with confidence from 0.5 to 0.9                                                                              |

**We see:** `net_hit` contradicting `height_at_net_m` (Q8b), and `in` on serves
judged against the service box with a bias near the line (Q8).

### Players file (`players_url`) — one object per tracked frame

The page lists only `frame`, `player_x_px`, `player_y_px`, `player_x_m` and
`player_y_m`.

**We see** more: on job `be930d79`, 101,929 rows, **one per frame per player**,
with:

- `player_position` (`top` or `bottom`);
- pixel boxes;
- per-frame swing scores `stroke_score`, `forehand_score`, `backhand_score`,
  `serve_score` and `smash_score`. `stroke_score` peaks near 1 at a swing.

Matched against the vendor's strokes, its swings found both shots a labeller had
added that match. It also fired on about 8% of gaps where nothing was missing.
Nothing reads the file yet; it is archived for that.

### Trajectories file (`trajectories_url`) — one object per tracked ball position

| Field                              | Meaning                                        |
| ---------------------------------- | ---------------------------------------------- |
| `frame`                            | This ball position's frame                     |
| `stroke_frame`                     | The frame of the stroke this flight belongs to |
| `bounce_frame`                     | The frame of its bounce, if any                |
| `ball_x_px`, `ball_y_px`           | Pixel position                                 |
| `ball_x_m`, `ball_y_m`, `ball_z_m` | Court position and height, in metres           |

**We see:** every row belongs to a vendor stroke, and each flight runs from
contact to its first bounce only. So the file can't reveal a stroke the vendor
missed. Checked against three hand-labelled matches (2026-10-10), it was also
not accurate enough to fill missing landings or decide in/out calls. It feeds
the ball paths drawn in the film room (`derivation/ball-paths.ts`).

## Not on the page

- Rate limits.
- The success HTTP status for `POST /jobs`.
- The full list of `step` values.
- Any retry or delivery guarantee for webhooks.
- The fields of the optional "statistics schema" (ask the vendor).
- Whether results can be re-requested after the 7-day SAS URLs expire. This is
  why we archive every file on arrival.
