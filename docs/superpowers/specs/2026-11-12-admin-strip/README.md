# Admin console strip + labeller queue — design decisions (2026-11-12)

Point-in-time record of what the owner chose on the design canvas
(`https://claude.ai/artifact/5uL2qs4zLCZL9JMtzzUmmG`, private). The `.dc.html`
files beside this one are the chosen artboards, copied from that canvas. Each
is a template (`<sc-for>`, `<sc-if>`, `{{ }}`) plus a `renderVals()` data block
at the foot; the data is invented. Logos, crests and avatars in them are
placeholders: build with the app's own `ProgramCrest`, `AdminAvatar`,
`VerifiedMark` and `StepMark`.

The canvas is the source for layout and copy. Where it and the design system
(`.skills/advantage-analytics-design/SKILL.md`) disagree on a token, radius or
type size, the design system wins: the artboards were drawn with raw values.

## The work, in four pieces

1. **Stripped admin console** — this document's main subject. Screens only.
2. **Labeller queue and board** — due times, claiming, release, boards.
3. **Publish on submit, then the admin's check** — changes who publishes.
4. **Customer "Verification pending"** — depends on piece 2.

Pieces 2 to 4 are recorded here so piece 1 does not build against them by
accident. Do not start them from this file alone.

## Piece 1 — what was decided

| Screen | Artboard | Decisions |
| --- | --- | --- |
| Shell | every admin artboard | Four tabs, in this order: Today, Labels, Matches, Teams. Requests, Messages and Ask leave the tab row; they are reached from Today's rows and, so they stay reachable when Today is empty, from the account menu, alongside Conferences, Pilots, Outreach and the Pay report. Their routes stay; only the navigation changes. |
| Today | `AdminToday.dc.html` | One list of what needs the admin. Each row carries its own action (Check, Approve and Decline, Resubmit, Reply, Open, Add hours); the title opens the item. Sorted longest wait first, with a "Waiting" column. No filter pills and no Resolved view; kinds with no natural end keep a "Resolve" action on the row. Support messages join the list (the loader does not read them today). |
| Matches | `AdminMatches.dc.html` | One line per match: players, Workspace (crest + program, or avatar + "Personal"), one status mark + words, video hours, uploaded. Status pills plus a workspace filter. A row opens a side panel with the progress steps (Uploaded, Sent for analysis, Results landed, Being labelled, Published, Checked) and the match id. A failed analysis has Resubmit, on the row and on Today. |
| Teams | `AdminTeams.dc.html` | Crest, facts line, members, video hours used with a bar, owner. Two views: Programs and Pilot players (the Pilots page's list moves here). |
| Team detail | `TeamDetail.dc.html` | One centred column, no section pills, no side rail: header (crest upload, name, facts, hours bar with Add hours), Details as a row of facts with one Edit details button and the two join links with Copy, one People list (join requests first with Approve and Decline, then members and roster players together, "No account · Invite" as the only account state shown), Add player and Invite people, the three latest matches with a link to Matches filtered to this workspace, a link to the activity log. |
| Match overview | `MatchOverview.dc.html` | One centred column: header, a progress line counted in flags, the publish checklist as the body (each row opens the first point, set or game it concerns), upload details collapsed to one row. Left to check, Statistics from the labels and the Score card are removed. The "Every point checked" check is removed: the owner works until the flags are resolved, not every point. |

### Things the owner said in so many words

- Pages sit centred in their column. Not pushed to the left edge, not stretched
  edge to edge.
- On the team page they use, and want visible: uploading the crest, inviting
  people, adding players, and seeing and editing the details and the conference.
- "Too cluttered and busy" was the verdict on a team page with a link on every
  fact, five filter pills and a five-column people table. Keep it quiet.
- They sometimes filter Matches by workspace.

### Known gaps between the artboards and the code (checked 2026-11-12)

- The admin Matches list already has a Workspace column and a program filter.
- There is no admin action to resubmit a failed analysis; only the customer's
  "Retry analysis" exists.
- The team loader returns no last-activity time per member and no player join
  link. The "Active today" text in the artboard has no data behind it: leave
  that column out unless the time can be read cheaply. The player link
  (`/join/[token]`, "anyone with it joins as a player") is new to this page;
  the coach claim link (`/claim/[programKey]`, recorded contacts only) is the
  one the page shows today as "Join link".
- Video hours are set per account on the Pilots page; there is no team-level
  "Add hours".
- Only the count of flags still open is stored on a label session, not the
  count it started with. Until piece 2 records a starting count, the progress
  line reads "N flags left" with no bar.
- "Publish" on the match overview artboard is piece 3 wording. In piece 1 the
  button keeps today's "Mark complete" and today's behaviour.

## Pieces 2 to 4 — rules already settled

- Vocabulary: a match is **Published** when its labels go live, then
  **Checked** when the admin has looked. Players still see the Verified badge.
- Every labeller's submit publishes and verifies. The admin checks afterwards
  and can send a match back with a note; the badge stays on meanwhile.
- The admin can open and label any match, with no limit.
- Labellers choose among the first three matches due, hold one at a time, and
  see hours of video on every card. A claimed match with no work for 48 hours
  returns to the queue.
- Due time is the moment results land plus a window. Launch with one window of
  36 hours; the tiers (Express 6 h, Priority 24 h, Standard 36 h) come later,
  and the database knows only Standard and Express today.
- The queue starts from matches analysed on or after 2026-10-29. Older waiting
  matches stay out of it but can still be labelled from Matches. Test
  workspaces and zero-length videos never enter.
- Customers see "Verification pending" with a grey check and no time.
- Progress is counted in flags resolved, on every board.
- Pay stays tied to video hours, counted when a match is published, shown as
  published and checked.
