# Admin team page — fidelity pass at 1440 (T20)

Measured 2026-09-26. **Canvas** values are `getComputedStyle` / `getBoundingClientRect`
readings of `TeamPage.dc.html` loaded in Chromium at 1440 wide. **App** values are the
same readings of `/admin/teams/edaf1aa0-b346-4a9f-aa8d-d47d586d25a4` (ZZ Test Program)
on the dev server at 1440×900, signed in as a throwaway admin. App values are taken
**after** this diff's fixes. Where ZZ has no data that renders a row, the row is noted
and was populated temporarily during the flow run (see _Flows_), then restored.

Verdicts: **match** · **fixed-in-this-diff** (backed by a hunk in this diff) ·
**deliberate deviation** (with the decision that made it).

## Measured constants

### Page and layout

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Page padding                      | 28 / 56 / 72                   | 28 / 56 / 72                   | match                                                                                                                    |
| Header → section pills            | 24px                           | 24px (was 48px)                | fixed-in-this-diff — `team-page-header.tsx` dropped `pb-6`; the layout's `gap-6 pt-6` already owns the 24px rhythm       |
| Section pills → grid              | 24px                           | 24px                           | match                                                                                                                    |
| Grid columns                      | `924px 380px` (minmax(0,1fr) 380px) | `924px 380px`             | match                                                                                                                    |
| Grid gap                          | 24px                           | 24px                           | match                                                                                                                    |
| Column stack gap                  | 24px                           | 24px                           | match                                                                                                                    |
| Rail width                        | 380px                          | 380px                          | match                                                                                                                    |

### Header

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Crest → text gap                  | 20px                           | 20px                           | match                                                                                                                    |
| Crest size / radius               | 64×64, 12px                    | 64×64, 12px (image and initials) | match                                                                                                                  |
| Crest initials                    | 18px / 600                     | 16px / 600                     | deliberate deviation — T9: 18px is off the type scale and fails `check-design-drift.mjs` check 2                         |
| Crest upload badge                | 26×26, 8px, offset −6/−6       | 26×26, 8px, offset −6/−6, card shadow + 1px inset ring | match                                                                             |
| h1                                | 30/36, 300, −0.6px             | 30/36, 300, −0.6px             | match                                                                                                                    |
| h1 → pills gap                    | 10px                           | 10px (was 8px)                 | fixed-in-this-diff — `gap-2` → `gap-2.5`                                                                                 |
| Status pill (`Active` / `Unclaimed`) | 20px tall, 11px/500, pad 8, radius 999 | 18px tall, 10px/500, pad 7, fully round | deliberate deviation — `StatePill` is the DS's one state-pill primitive and its 18px, 10/500 geometry is DS law (`reference/settings.md`, `reference/tables.md` law 4); the canvas' `.pill` is a transcription of it |
| Pilot pill                        | 22px, 12px/500, pad 9, `#eaf5e8`/`#2d6a27` | `h-[22px] px-[9px] text-[12px] font-medium` (`plan-pills.tsx`) | match — ZZ is `unclaimed`, so the pill does not render there; verified from source, not measured |
| Facts line                        | gap 18, 12px ink-600, 13px icons | gap 18, 12px ink-600, 13×13 icons | match (measured with City/State and a conference set on ZZ during the flow run)                                    |
| `Edit details` button             | 36px tall, 13px/500, radius 6  | 102×36, 13px/500, radius 6     | match                                                                                                                    |
| `⋯` more-actions button           | 36×36, radius 6                | 36×36, radius 6                | match                                                                                                                    |
| `Upload for this team` button     | 36px primary, between the two  | absent                         | deliberate deviation — T10 follow-up 2 / T22 owns it once admin uploads lands                                            |

### Section pills

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Pill height                       | 26px                           | 26px                           | match                                                                                                                    |
| Pill radius                       | 999px                          | 9999px (`--radius-pill`)       | match — both fully round at 26px                                                                                         |
| Pill font                         | 12px, 400 rest / 500 active    | 12px, 400 rest / 500 active    | match                                                                                                                    |
| Pill padding / row gap            | 11px / 8px                     | 11px / 8px                     | match                                                                                                                    |
| Pill border                       | 1px `#f3f3f3` rest, `#e5e5ea` active | 1px `#f3f3f3` rest, `#e5e5ea` active | match (T8 kept `--border-hairline`; both resolve to ink-100)                                                     |
| Active pill on load                 | `Overview`                     | `Overview`                     | fixed-in-this-diff — originally a scroll-anchor bug (`People` lit at scroll 0); since 2026-09-26 the pills filter the main column by `?view=` and Overview is simply the default view |

### Cards

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Card radius                       | 14px                           | 14px                           | match                                                                                                                    |
| Card border / shadow              | 1px `#f3f3f3`, `0 2px 8px rgba(0,0,0,.06)` | same                | match                                                                                                                    |
| Card padding — People             | 24 / 24 / 16                   | 24 / 24 / 16 (was 18 / 24)     | fixed-in-this-diff — `pt-6 pb-4` on the card                                                                             |
| Card padding — Requests           | 24 / 24 / 18                   | 24 / 24 / 18 (was 18 / 24)     | fixed-in-this-diff — `pt-6`                                                                                              |
| Card padding — Roster, Schedule   | 24 / 24 / 14                   | 24 / 24 / 14 (was 18 / 24)     | fixed-in-this-diff — `pt-6 pb-3.5`                                                                                       |
| Card padding — rail (Pilot, Usage, Conference, Details) | 24        | 24 (was 18 / 24)               | fixed-in-this-diff — `py-6`                                                                                              |
| Card padding — Activity log       | not drawn                      | 18 / 24 (`SettingsCard` default) | deliberate deviation — T8: the canvas draws no Activity card; it keeps the shared default                              |
| Card title                        | 14px / 500                     | 13px / 500                     | deliberate deviation — user decision 2026-09-26: keep the shared `SettingsCardTitle` size (every Settings card uses it) rather than fork an admin title for 1px |

### People and Requests rows

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Person row height / padding / gap | min 52, 8px, gap 12            | 47 (auto), 9px, gap 10, hairline above | deliberate deviation — user decision 2026-09-26: `AdminPersonRow` keeps the DS Settings person row (`reference/settings.md`: one line, 22px avatar, name 12/500) over the canvas' two-line row (24px avatar, 13/500 name over email) |
| Role / state column (`pcol`)      | 72px right-aligned             | role `MenuSelect` / `Invited` `StatePill` (18px) | deliberate deviation for the pill geometry (DS `StatePill`, as above); column width follows the row restructure in follow-up 3 |
| `Transfer ownership` placement    | on the owner's row             | on each coach/staff row        | deliberate deviation — T11: the canvas placement needs a recipient picker no task specifies                              |
| Uploads switch                    | 36×20 (canvas toggle)          | 36×20 `AdvSwitch`              | match                                                                                                                    |

### Tables

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Roster columns                    | `20 / 1fr / 48 / 96 / 64 / 168`, gap 24 (358px flex at 1440) | `20px 358px 48px 96px 64px 168px`, gap 24 | match                                                                                 |
| Roster header row                 | min 32, pad 4 / 6              | min 32, pad 4 / 6              | match                                                                                                                    |
| Roster body row                   | min 52, pad 8 / 12, margin −12, 898 wide | min 52, pad 8 / 12, margin −12, 898×52 | match (measured with a player added during the flow run)                                                   |
| Roster row hover wash             | `.tr:hover` surface-muted      | none                           | deliberate deviation — T13: rows are inert; Data Table law 5 ties the wash to a row action                               |
| Schedule columns                  | `52 / 1fr / 72 / 56 / 124`, gap 24 (474px flex) | `52px 474px 72px 56px 124px`, gap 24 | match                                                                                          |
| Schedule header row               | min 32, pad 4 / 6              | min 32, pad 4 / 6              | match                                                                                                                    |
| Schedule body row                 | min 52, pad 8 / 12, margin −12 | same `ROW` constant as the roster (`-mx-3 min-h-[52px] px-3 py-2`) | match — ZZ has no events, so verified from `admin-schedule-table-layout.ts`, not measured |
| Undecided result words            | 12px ink-600                   | 11px ink-500                   | deliberate deviation — T14: DS law over the canvas                                                                       |

### Rail cards

| Constant                          | Canvas                         | App (1440)                     | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Fact (`kv`) row — Details         | min 36, pad 6 / 0, 12px        | min 36, pad 6 / 0, 12px        | match                                                                                                                    |
| Fact (`kv`) row — Pilot           | min 36, pad 6 / 0, centred, gap 16 | min 36, pad 6 / 0, centred, gap 16 (was 28px tall, pad 5, baseline, gap 12) | fixed-in-this-diff — `pilot-usage-card.tsx` `Kv`                  |
| Pilot figure                      | 28px / 300, −0.5px             | 24px / 300, −0.4px (`text-title-lg`) | deliberate deviation — DS `reference/settings.md`: the quota figure is 24px/300                                    |
| Pilot bar                         | 330×6, radius 3                | 330×6, radius 3 (`HoursMeter`) | match                                                                                                                    |
| Pilot buttons                     | 32px, 12px/500, radius 6; grow from content (185 / 137) | 32px, 12px/500, radius 6; 185 / 137 (was 161 / 161) | fixed-in-this-diff — `flex-1` → `grow`, the canvas' `.grow` (basis auto)     |
| Conference mark                   | 40×40, radius 8                | 40×40, radius 8 (was 6)        | fixed-in-this-diff — `conference-mark.tsx` gives the 40px size `--radius-element`, the canvas' `.crest.lg` (also the conference drawer's head mark) |
| Meta text (counts, dates)         | 12px ink-600                   | 11px ink-500                   | deliberate deviation — T14: DS law over the canvas for meta text                                                         |

**Counts:** 52 rows — 30 match, 10 fixed-in-this-diff, 12 deliberate deviation.

## Flows exercised on ZZ Test Program

Run 2026-09-26 through the UI as a throwaway admin (`t20shot-…@example.com`). A second
throwaway user (`t20member-…@example.com`) was inserted as a ZZ coach so a non-owner row
existed for the Uploads switch. "Audit" is the `program_audit_log` action written during
the step; "Activity card" is the top row after reload.

| Flow                       | Result | Audit action                   | Activity card top row                         |
| -------------------------- | ------ | ------------------------------ | --------------------------------------------- |
| Crest upload (Save crest)  | saved `crest_path` | **none** — `set_program_crest` writes no audit row | unchanged |
| Crest remove (⋯ › Remove crest) | cleared, storage object removed | **none** — same RPC | unchanged |
| Edit details (City, State) | saved  | `program.details_changed`      | Program details changed · T20 Harness · Sep 26 |
| Invite (`@example.com`, Player) | invite row created | `invite.created`       | Invitation sent · T20 Harness · Sep 26        |
| Resend                     | invite refreshed; card showed the Resend "address doesn't look deliverable" note (example.com), nobody emailed | `invite.created` | Invitation sent |
| Revoke                     | invite removed | **none** — `revoke_program_invite` writes no row although the label `invite.revoked` exists | unchanged |
| Uploads toggle (off, on)   | `upload_enabled` false → true | **none** — `set_member_upload_enabled` writes no audit row (T11 follow-up 2) | unchanged |
| Add player                 | player created | `player.added`             | Player added · T20 Harness · Sep 26           |
| Change conference          | conference set | `program.conference_changed` | Conference changed · T20 Harness · Sep 26    |
| Change pilot end date      | `pilot_ends_on` 2026-12-31 | `pilot.end_changed` | Pilot end date changed · T20 Harness · Sep 26 |
| End pilot                  | `pilot_ended_at` set | `pilot.ended`        | Pilot ended · T20 Harness · Sep 26            |

Afterwards ZZ was restored from a pre-run snapshot: every `programs` column the flows
touched (crest, city/state, conference, pilot columns) compared equal to the snapshot;
the added player was archived; the invite was revoked; the coach row and both throwaway
users were deleted. Audit rows stay, as expected.

## Labels

Every user-visible label on the page was compared with the canvas text. Identical unless
listed here:

| Canvas                                   | App                                                     | Why                                                                          |
| ---------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Upload for this team` (header)          | absent                                                  | T10 follow-up 2; T22 fills the slot                                          |
| `Enter results for this team` (Schedule) | absent                                                  | T14; T22 once `adminUploadHref` exists                                       |
| `Players use their own 2 h before the team pool` | `poolRuleNote()`: "Uploads here draw on the team pool. A member's own 2 h covers their personal uploads only." (by org type) | corrected stale copy — T16: the canvas sentence is false for every org type (`quota.ts`) |
| `1.5 of 2 h` usage row form              | never rendered                                          | T16: unreachable, same reason                                                |
| `Transfer ownership` on the owner row    | on coach/staff rows                                     | T11 (placement, not wording)                                                 |
| Claim strip "…approved itself Aug 26 — the address is on the recorded staff list." | verbatim for a staff-list match, plus three honest variants | T12: the canvas sentence is true for one claim path only |
| Pilot confirm dialog                     | "Ending a pilot is a record, not a gate…"               | T15: nothing server-side gates on the pilot columns, so "uploads stop" would be false |
| `Change` (Conference)                    | `Set conference` / `No conference yet` when none        | T17: the canvas only draws the assigned state                                |
| Sibling state as plain text              | grey `StatePill`                                        | T17                                                                          |
| `vs Harvard` (roster last match)         | bare opponent name                                      | T13: matches the dashboard's own cell                                        |
| Centred `—` in roster/schedule           | `EmptyMark`                                             | T13                                                                          |
| Schedule `Not played` / `Awaiting results` | same, plus `In progress` and the tournament mark     | T14: the loader has six states, the canvas draws three                       |
| Details `Who edits the schedule: Staff`  | `All staff`                                             | shared vocabulary — `uploadPolicyLabel("staff")`, the Settings wording (T18) |
| `4 of 25 seats`                          | `<used> of <seats> seats` + ` · <n> held` when invites are pending | T11: prints the loader's held count rather than hiding it       |
| Empty states (no canvas text)            | "Nobody has joined…", "Nobody is waiting to join.", roster/schedule/usage/conference empties | the canvas draws populated data only |
| No Activity card on canvas               | `Activity log` card, `<n> entries`, sentence labels     | T8 / T19                                                                     |

## Follow-ups (not fixed here — each needs more than a constant)

1. **Three writes left no audit row** at the time of this pass: crest upload/remove
   (`set_program_crest`), invite revoke (`revoke_program_invite`) and the Uploads switch
   (`set_member_upload_enabled`). **Fixed after the pass** by migration
   `20260926192327_audit_crest_upload_toggle_revoke`: they now write
   `program.crest_changed`, `invite.revoked` and `member.upload_changed`. The _Flows_
   table above records what was observed on the day.
2. The Pilot card renders `End pilot` and `No end date set` on a program that has never
   had a pilot (ZZ is `unclaimed`, no approval). Worth an explicit no-pilot state.
