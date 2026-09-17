# Admin uploads verification — T19

Executed September 17, 2026 UTC in the isolated `codex/admin-uploads` worktree,
starting at `6f769786`. These are authenticated checks of the actual Next app,
Supabase Auth/PostgREST/Storage, source RPCs and processing workers. Browser
submissions were not mocked. Production deployment and vendor accuracy were not
part of this run.

## Local environment

The disposable project is `admin-uploads-t19`: app `http://localhost:3119`,
Supabase API `http://127.0.0.1:56321`, PostgreSQL port 56322, Azurite port 10000,
and a vendor transport substitute on port 3118. Existing unrelated containers
were left intact. The local database uses a schema-only export of the linked
live baseline (no athlete rows), followed by the six Phase 2b migrations and
`20260917065829_fix_admin_attachment_shot_lookup.sql`. None was applied remotely.

Setup and restart instructions are in
`/private/tmp/t19-integration/environment-readme.md`. Private local credentials
are in that directory's `app-env.json`; do not commit or publish it. Start the app
with `node /private/tmp/t19-integration/start-app.cjs` from this worktree. The
runner clears repository environment variables before injecting disposable ones.
Start workers with `supabase functions serve --workdir /private/tmp/t19-integration`;
JWT verification remains enabled. Start the vendor with
`node /private/tmp/t19-integration/vendor.cjs`.

The actual repository `process-match` worker is copied into the local function
root. Its required `generate-key-moments` dependency is absent from the repository;
the deployed source was downloaded read-only, inspected, and served against the
local database. No replacement implementation was used for successful processing.
Optional `generate-insights` is unavailable locally to avoid external LLM calls.
AI commentary remains unverified.

Fixtures include member and nonmember admins, an ordinary coach and player, six
roster athletes, and program `19191919-1111-4111-8111-111111111111` (T19 Test
University). The video is generated white 1080p/30fps H264 footage, 61 seconds.
The six-sheet SwingVision workbook contains two 6–0 sets and 48 points. Both
workbook variants passed the actual validator/parser. The intentionally mismatched
variant was refused by the server without changing a result.

The vendor substitute actually reads the signed Azure blob, records the request,
and delivers signed callbacks. Authorization, quota, job persistence, webhook
validation, result storage and transcript/stat derivation remain application code.
The synthetic transcript has 156 points/1,076 shots and does not reconcile with
the entered score; actual product policy marks it `0.3.0-unreconciled`. This run
proves integration and preservation, not the quality of real video analysis.

## Executed browser and database evidence

| Flow                   | Observed result and persisted evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New tournament         | Nonmember admin entered T19 Invitational, Alex Morgan vs Pat Rivera, R16, 6–3 6–4. Review and save succeeded. Match `c982a961-542d-4fea-bbf8-42fd73fb9289`; history says Saved. Actual Team Schedule peek shows R16, Alex Morgan, 6–3 6–4, Won.                                                                                                                                                                                                                                                                           |
| Dual and partial retry | New T19 Rivals event `8572fdaa-7b8c-4b28-9804-af983518db83` had five submitted lines. A disposable trigger failed S2 only: UI showed four saved and one failed, retained inputs, and offered retry. After removing the trigger, retry saved S2. Operation `0ec1ccf9-7ab7-42da-8392-e2ecf8bbb80a` and all item IDs stayed identical; four successful result IDs stayed identical; exactly one match and audit were added. Team Home/Schedule show S1 6–0 6–0, S2 6–3 6–4 and doubles forfeits, 5/9 lines, 2–1 in progress. |
| New file               | Operation `dc741155-5a72-4bc5-83dc-5d87e57d57e0`, match `c6741568-5248-4a1d-959c-569fea177db5`: completed through actual Edge processing, one attempt/file/item/audit, 48 points and two statistics rows. History says Imported. The actual report displays 48 points, 12 games, 48 Alex Morgan aces and 6–0 6–0.                                                                                                                                                                                                         |
| New video              | Match `269bfe93-cc8b-425e-915e-a349164dd1f8`, job `937911a7-1c8d-441e-94ec-ecd668a08c5e`: browser validation and fixed-camera/bottom-player selection succeeded. Transport received top opponent/bottom Alex, server-first scores and window 0–61. Signed callback, stored results and actual derivation completed with 156 points, 1,076 shots and two statistics rows. History moved from Stats pending to Analyzed; report showed the saved window/score during processing.                                            |
| File attachment        | Nonmember admin selected coach match `1cb46e8c-a47d-4fee-a9e5-76e5068efcd4` through the new recorded-result picker. Review displayed preserved score/identity without editable fields. Actual processing completed and history says Analysis attachment / Imported.                                                                                                                                                                                                                                                       |
| Video attachment       | Member admin selected coach match `d91faae8-68b3-4d46-a3d5-aaabd99e10d0`. Recorded score and scoring rules were locked. Job `8fb0333f-c5f5-46f0-9861-0c3b9da93608` completed through the actual callback/derivation path. History says Analysis attachment / Analyzed and identifies memberadmin Tester.                                                                                                                                                                                                                  |

For **both attachments**, before/after comparison preserved match ID, creator,
program, event entry, both player identities, opponent identity, names, score,
result, round, tournament, date, match type, format and court. Only provider,
analysis method and (for file processing) key moments changed. Two video jobs
produced exactly two usage rows and **122 charged seconds**, all on the target
program. Final console evidence: seven operations, 11 items, 11 audits. The coach
fixtures and the member admin's ordinary dashboard draft did not appear as console
submissions.

An earlier local file operation remains Failed because the worker's required
key-moments function was initially unavailable. The UI refused unsafe duplicate
processing after partial data existed. That failed attempt was not reset or
represented as successful. A fresh operation completed after setup was repaired.
An earlier worker boot failure also exposed the retry-with-same-file UI; its
stored operation/file identity was retained.

Evidence files under `/private/tmp/t19-integration/` include `partial-before.json`,
`partial-after.json`, `partial-comparison.json`, `file-evidence.json`,
`video-completion.json`, `attachment-before.json`, `attachment-after.json`,
`attachment-comparison.json`, `console-evidence.json` and `console-counts.json`.
They contain disposable fixture data. Keep this environment until review is done;
the paths are local artifacts, not CI-hosted attachments.

## Dashboard regressions

- Personal import draft saved, navigated to Matches, and resumed at the file step.
- Switching to the team landed on Team Home with team navigation, roster and
  allowance. A fresh team wizard did not inherit the personal import subject.
- A Jamie Lee team video draft saved and appeared in Matches. Its Continue link
  loaded the saved provider and returned to the athlete picker. This is the
  documented contract in `upload-draft-behavior.md`: team drafts deliberately
  re-ask identity rather than infer an athlete from a name.
- Personal and team draft controls remain present; console wizard draft/workspace
  switching controls are absent. Console exit/success links return to admin routes.
- Team and console allowance displays agree at their existing precision (75.0 h;
  122 seconds does not change that rounded display). Exact charging was checked
  in persisted usage, not inferred from display rounding.
- All 31 previously skipped direct-write eligibility cases ran against actual
  local Auth/PostgREST and passed. They cover personal/team identity, roster,
  status, upload policy, scheduled lines, client updates and processing access.
  Fixtures explicitly create public profiles because schema-only exports omit
  the Auth signup trigger. Logic tests additionally cover draft refusal and
  failure without navigation.

## Desktop comparison

Recorded browser screenshots in this task compare the actual routes with the
supplied `UploadForTeam.dc.html` frame at 1280 × 720. The frame was served unchanged
on local port 3117. Its external logo asset did not resolve; the actual app logo
was present. The actual dual review/partial state, existing dual form and history
were inspected with real persisted data.

The delivered shell retains the white surface, centered 1,000px content width,
quiet top navigation, title/team hierarchy, four-column kind choices and blue
selection. The comparison found an undefined `--radius-float` token on choice
cards; it now uses the existing 12px `--radius-dropdown` token. Functional
variations from the static frame are explicit: all nine lineup positions are
available, recorded results are read-only, partial-save status/retry is visible,
and the shared file/video wizard retains its own full-page layout. The frame's
old attribution copy and generic step counter are not substituted for current
console provenance or provider-specific step order.

This is an inspected desktop comparison, not a pixel-diff claim. Screenshots are
in the task's browser output; no durable screenshot bundle or exhaustive
responsive/browser matrix was produced. Those additional checks remain
unperformed. The native date picker crashed the embedded browser; using native
keyboard date segments allowed the real forms to complete without changing them.

## Corrections and checks

Integration findings corrected in T19:

1. Connect the existing protected attachment service to a guarded result picker,
   server-derived preset and stable operation/item IDs. Unexpected lookup errors
   are visible rather than silently presented as no eligible results.
2. Accept the shared wizard's court labels and optional empty surface in both
   admin submission services, including indoor hard court.
3. Correct the attachment SQL guard to follow `shots.point_id → points.id`.
   A fresh migration preserves prior migration history and privileges; database
   fixtures now model that actual foreign-key shape.
4. Add a nonproduction, loopback-only Azure endpoint for the disposable emulator;
   production and remote overrides are rejected.
5. Repair local Auth test profile setup and the missing choice-card radius token.

Executed focused checks include 31 real direct-write eligibility tests, 18
PostgreSQL/PGlite contract tests, revised attachment/court/entry/transport tests,
scoped lint and typecheck. The queue's full mechanical gate and independent
completion review are recorded in its appended T19 run log after execution.
Production build, complete-branch RLS/pipeline reviews and release checks belong
to T20. Hosted migrations, deployed processing functions, real vendor execution,
AI commentary, push and merge remain unperformed.
