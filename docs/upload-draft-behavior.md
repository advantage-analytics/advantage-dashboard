# Upload wizard: Save draft behavior

**Status:** current as of 2026-09-12, verified against `codex/upload-flow-refinements` @
`246049e` and the live database (via the Supabase MCP — `match_drafts` is migration
`20260903060451`, applied; `upload_eligibility`, `20260911000000`, is **not**).
**Read alongside:** `work/upload-flow-refinements/02_design/output/design.md` §"Save
draft behavior contract — plan only", which this document expands and answers. This is
Plan 19 of that feature's pipeline — documentation only. It ships no code.

Every statement below is one of two kinds, and they are typographically distinct
throughout:

- **Shipped.** A description of what the code does today, each with the file and line
  that was read to confirm it.
- **> Recommendation:** blockquoted, italicized, and always opens with the word
  "Recommendation" — a proposal for future work. Nothing under a Recommendation heading
  exists in the codebase yet, and this document does not create a task to build it.

If a sentence is not inside a `> Recommendation:` block, it is a claim about shipped
behavior and is expected to hold up against the cited line.

---

## 1. What "Save draft" is, today

The wizard has two independent persistence mechanisms that are easy to conflate:

- **Local autosave** — every change to the form is written to
  `localStorage` 400ms after the last keystroke, unconditionally, whenever the wizard is
  open (`useUploadMatchWizard.ts:890-897`, the effect that calls
  `saveFormDataToStorage`). This is not "Save draft" — it has no button, no server
  round-trip, and no row. It exists so a browser refresh or an accidental navigation
  doesn't lose in-progress typing, and `DashboardShell` sweeps it the moment the route
  leaves `/dashboard/matches/new` (§4).
- **Save draft** — the footer button (`UploadMatchFlow.tsx:965-968`) that calls
  `handleSaveDraft` (`UploadMatchFlow.tsx:685-693`), which writes a `match_drafts` row via
  the `saveMatchDraft` server action (`src/lib/wizard/actions.ts:433-480`) and then
  navigates away. This is the only durable persistence a draft has.

`match_drafts` (`supabase/migrations/20260903120000_match_drafts.sql`) is a real table,
RLS-scoped to its author (`(select auth.uid()) = user_id`, confirmed live via
`pg_policies`). Each row carries flat columns for the Matches table's Resume list
(`player_name`, `event_label`, `step_index`/`step_count`, `file_name`) and one `payload`
jsonb column holding the whole `MatchDraft` object — `step`, `provider`, `formData`
(including any camera/trim answers already entered), `preset`, and `attachedLine`
(`types.ts:490-500`).

## 2. The seven behaviors

### Save

Shipped. Clicking "Save draft":

1. Writes the current `formData` and selected provider to `localStorage`
   (`UploadMatchFlow.tsx:686-688`) — the same local keys the autosave effect uses.
2. Sets `STORAGE_KEYS.DRAFT_KEPT` (`"uploadDraftKept"`) in `localStorage`
   (`UploadMatchFlow.tsx:690`), a signal read only by `DashboardShell` (§4).
3. Calls `saveDraft()` (`useUploadMatchWizard.ts:899-930`), which upserts one
   `match_drafts` row keyed on a client-generated `crypto.randomUUID()` the first time,
   and on the existing `draftId` thereafter (`useUploadMatchWizard.ts:900`,
   `actions.ts:433-480`, `onConflict: "id"`). Every subsequent Save draft on the same
   wizard session updates that same row rather than creating a new one.
4. Navigates to `exitHref` regardless of step 3's outcome — see the failure gap below.

The autosave in step 1 already runs continuously while the wizard is open
(`useUploadMatchWizard.ts:890-897`); Save draft's local write is redundant with it but
harmless.

### Resume

Shipped, with a real gap. `/dashboard/matches/new?draft=<id>` loads the row through
`loadMatchDraft` (`src/app/dashboard/matches/new/page.tsx:67-68`,
`actions.ts:488-498`), which is ownership-scoped by RLS (no explicit `user_id` filter in
the query itself, `actions.ts:488-495` — the policy is what makes another user's id
resolve to nothing). The wizard's mount effect then seeds `selectedProvider`, `formData`,
and `attachedLine` from the draft's payload (`useUploadMatchWizard.ts:1002-1012`).

The step it resumes to is decided by `draftResumeStep()`
(`subject-eligibility.ts:288-290`): a personal-workspace draft resumes on `"file"`; a
team-workspace draft resumes on `"provider"` (the who-played picker), never past it. This
is deliberate, not an oversight — the who-played answer (`MatchSubject`) is never
persisted in the draft at all, so a team draft that resumed past the picker would either
create a match for nobody or silently fall back to the uploader, which is the exact
attribution bug `MatchSubject` exists to prevent (comment at
`subject-eligibility.ts:275-286`). The file itself is never restored either — a `File`
object cannot survive `localStorage` or a jsonb column, so both kinds always land on a
step that re-asks for it.

**The gap:** nothing compares the draft's stored `program_id` to the workspace that is
currently active. `loadMatchDraft` (`actions.ts:488-498`) does not read or check
`program_id`, and the resume effect (`useUploadMatchWizard.ts:1002-1023`) applies the
draft's `provider`/`formData`/`attachedLine` unconditionally — there is no `if
(draft.programId !== activeWorkspace.id)` anywhere in that path. A draft saved under one
team workspace can be resumed while a different workspace (personal, or another program)
is active, carrying that draft's attached line and form answers into a workspace they
were never eligible for. Because the who-played subject is never restored, this cannot
mis-attribute a match to the wrong _player_, but it can attach the wrong event line, or
present opponent/roster context from a program the current workspace has no relationship
to.

### Replacement

Shipped for the video file, unverified for camera answers. Every call to `onVideoPick`
(including the one that runs on resume, when the user re-selects a file for a
video-provider draft) resets the trim window to the new file's full extent —
`videoStartSeconds: 0`, `videoEndSeconds: <new file's duration>`
(`useUploadMatchWizard.ts:1528-1541`). So a replaced video's trim bounds are always
revalidated against the file actually in hand, never carried over from a stale draft.

`onVideoPick` does **not** reset `initialTopPlayerIsPlayer1` or `fixedCamera` — those
camera-answer fields survive a file swap untouched. A camera answer given for the
previous video is not distinguished from one that has been re-confirmed against the
replacement.

Import-provider file replacement is a parse, not a probe, and clears the import identity
confirmation on a changed identity (`validation.ts` / `evaluateImportedIdentityMatch`,
referenced from the hook's `importIdentity` state) — that reset predates this task and is
part of the identity-confirmation work covered elsewhere in this branch, not draft
handling specifically.

### Discard

Partially shipped. There is no explicit "Discard draft" action distinct from Cancel in
the wizard's own footer — Cancel (any exit that is not Save draft) simply does not write
a `match_drafts` row, so nothing durable is created to discard. The Matches table's draft
list is presumed to offer its own delete affordance calling `deleteMatchDraft`
(`actions.ts:482-485`, a plain `.delete().eq("id", id)`); that call site was not located
inside the wizard component tree searched for this document and is out of scope for this
document's review of `useUploadMatchWizard.ts`/`UploadMatchFlow.tsx`.

`clearStorageData()` (`utils.ts:508-514`) removes all four local keys, including
`DRAFT_KEPT`, and is what a plain exit relies on via `DashboardShell` (§4) — but it never
touches the `match_drafts` table. Deleting the local copy and deleting the server row are
two different operations with no code path that guarantees both happen together outside
of match completion (§ Completion cleanup, below).

### Retention

Shipped: indefinite, no expiry. There is no cron job, no TTL column, and no
`cron/reclaim-videos`-style sweep referencing `match_drafts` anywhere in `src/app/api/`
or `supabase/functions/` (checked by name; none exists). A `match_drafts` row persists
until one of: a later Save draft on the same `draftId` (upsert, replaces it), an explicit
delete (`deleteMatchDraft`), or the completion cleanup below. This matches the design
contract's "retain drafts until explicit discard or successful completion; no new expiry
job" — that line is honored by omission, not by any code that enforces it.

### Completion cleanup

Shipped, best-effort. On a successful match insert, `handleCreateMatch` calls
`clearStorageData()` and then, if a `draftId` exists, fires
`deleteMatchDraft(draftId)` (`useUploadMatchWizard.ts:2279-2283`):

```
if (draftId) void deleteMatchDraft(draftId).catch(() => undefined);
```

The comment beside it (`useUploadMatchWizard.ts:2281-2282`) states the trade-off
explicitly: this is fire-and-forget, and a failed delete leaves a stale row behind rather
than blocking match creation. The stated consequence is "a stale Resume in the list, not
a wrong match" — i.e., the failure mode is understood and accepted as a dangling-but-safe
draft, not data corruption. Nothing currently guards against that stale draft's Resume
button being clicked after the match it describes already exists; resuming it would
reopen the wizard with the old answers and, on submission, attempt to create a _second_
match rather than update the completed one (there is no code that checks "does a match
already exist for this draft" before submitting from a resumed draft).

### Transfer-start behavior

Shipped, and structurally simpler than the phrasing of the brief implies: **a draft and
a started video transfer cannot coexist.** The video transfer (`createProcessingJob` and
`uploadAndSubmitVideo`, `useUploadMatchWizard.ts:2320-2390`) only begins after the
`matches` row insert has already succeeded — and that same success path deletes the
draft synchronously, before the transfer is kicked off
(`clearStorageData()` / `deleteMatchDraft(draftId)` at
`useUploadMatchWizard.ts:2279-2283`, which runs earlier in the same function than the
job-creation block at `useUploadMatchWizard.ts:2320+`). So there is no application state
in which a draft row exists _and_ a `processing_jobs` row for that same in-progress
upload exists at the same time. By the time bytes start moving, the thing that was a
draft is a real match with a real job id; if the job or the upload then fails, the
rollback path (`rollbackAndAnnounceFailure`, defined at `useUploadMatchWizard.ts:177`,
called at `:2345`) deletes the
_match_ row it just created (when it is safe to — see the `reusingMatch` guard in that
function), not a draft, because no draft exists at that point to roll back to. A design
statement like "transfer already started ⇒ treat it as an editable pre-upload draft" does
not apply to this codebase's state machine, because that state — mid-transfer with a
still-open draft — cannot occur.

## 3. Save-failure behavior today (the item most worth calling out)

Shipped, and it does not match the design's proposed contract. `handleSaveDraft`
(`UploadMatchFlow.tsx:685-693`) does:

```
localStorage.setItem(STORAGE_KEYS.DRAFT_KEPT, "1");
await saveDraft();
router.push(exitHref);
```

`saveDraft()` returns `false` on failure (`useUploadMatchWizard.ts:915`, when
`saveMatchDraft` comes back null — no workspace context, no signed-in user, or a
database error) but `handleSaveDraft` does not check that return value. The wizard
navigates to `exitHref` unconditionally. Local storage is left intact (the `DRAFT_KEPT`
flag was already set, so `DashboardShell` will not clear it on the way out), so the
in-progress answers are not lost to a page refresh — but nothing tells the user the
server-side draft was never written, and the Matches table's draft list will not show a
Resume row for it. This is the concrete instance of the defect the design document
flagged by inspection alone; this document confirms it by reading the call site.

## 4. `DashboardShell`'s localStorage sweep

Shipped, and load-bearing for the local/durable distinction above.
`DashboardShell` (`src/components/dashboard/dashboard-shell.tsx:58-66`) watches
`pathname` and, on every route change away from `/dashboard/matches/new`, checks
`STORAGE_KEYS.DRAFT_KEPT`:

```
if (!pathname.startsWith("/dashboard/matches/new")) {
  if (localStorage.getItem(STORAGE_KEYS.DRAFT_KEPT)) return;
  clearStorageData();
}
```

A plain Cancel/close leaves no `DRAFT_KEPT` flag, so the shell wipes `uploadFormData`,
`uploadedFile`, and `selectedProvider` the moment the route changes — this is what makes
a cancelled wizard actually forget the answers rather than resurface them on the next
unrelated visit to `/dashboard/matches/new`. Save draft sets the flag first
(`UploadMatchFlow.tsx:690`) specifically to suppress this sweep, and the wizard's own
mount effect removes the flag again on the next open
(`useUploadMatchWizard.ts:941`), so a second plain departure after a resumed draft clears
storage exactly as before.

## 5. Hard constraints on any future draft persistence work

These are not proposals — they are things a future implementation **must not do**,
independent of whichever recommendation below (or a different design) is chosen:

- **No `File` objects in the payload.** A browser `File` cannot be serialized to
  `localStorage` or to a jsonb column, and the code already treats this as settled: the
  draft only ever stores `fileName` as a label (`types.ts:499`,
  `saveMatchDraft` at `actions.ts:466`), and every resume path re-prompts for the file
  (`useUploadMatchWizard.ts:1016-1020`, comment: "The file never survives a draft").
  Nothing about future work should try to change this.
- **No credentials in the payload.** The Azure Blob SAS URL a processing provider mints
  for a video transfer must never be written to `match_drafts.payload`, to
  `localStorage`, or to any other draft-adjacent storage. This matters precisely because
  of §"Transfer-start behavior" above: since a draft is always deleted before a transfer
  begins, there is currently no code path that could accidentally carry a SAS credential
  into a draft row — but a future change that tried to let a draft "remember" an
  in-progress transfer would need to guard against exactly this.
- **No new expiry job.** Retention (§2) is indefinite by omission today, and that is the
  intended design, not an oversight to fix — see the design contract's "no new expiry
  job." A future implementation must not add a cron job, TTL column, or scheduled sweep
  for `match_drafts`.

## 6. Recommendations (future acceptance criteria — nothing here is built)

> **Recommendation: Save failure must not lose the user's place.** `handleSaveDraft`
> should branch on `saveDraft()`'s boolean result. On `false`, remain on the current step
> with the current `formData` untouched, surface an explicit error (e.g. "Couldn't save
> your draft — try again"), and offer a retry action, matching the design contract's "Save
> fails: stay in the wizard, keep answers, explain the failure, and offer retry; do not
> claim a draft was saved." Do not clear `DRAFT_KEPT` or navigate away in this branch.
>
> Acceptance: a simulated `saveMatchDraft` failure (network error, no workspace, RLS
> denial) leaves the wizard open, on the same step, with the same field values, and shows
> a visible failure message; the user is not redirected to the Matches table.

> **Recommendation: Durable, revalidated subject/workspace binding.** A saved draft
> should carry an explicit, checked binding to the workspace it was saved under (today's
> `program_id` column already exists for this) and — for a team draft — to the roster
> subject it was answering for, if that is ever added to the payload. On resume, before
> any of the draft's answers are applied to wizard state:
>
> 1. Compare the draft's `program_id` to the currently active workspace's id. If they
>    differ, do not apply the draft's `attachedLine`, `formData`, or `provider` silently;
>    either refuse to resume with an explanation, or require the user to switch workspace
>    first.
> 2. If a subject/athlete is ever persisted, revalidate it against the current roster
>    (`eligibleRosterOptions`/`rosterSubjectOrNull`, already used elsewhere in the hook
>    for live state at `useUploadMatchWizard.ts:1239` and `:1298`) and fall back to the
>    picker step, not to a stale id, if the roster no longer names that person.
>
> Acceptance: a draft saved under Program A, resumed while Program B (or the personal
> workspace) is active, does not apply Program A's attached line, event context, or form
> answers to the Program B session — the resume either blocks with an explanation or
> starts the wizard as if no draft were named.

> **Recommendation: Distinguish local recovery from durable save, explicitly.** The
> autosave effect (`useUploadMatchWizard.ts:890-897`) and Save draft
> (`UploadMatchFlow.tsx:685-693`) currently write to overlapping `localStorage` keys and
> can be conflated by a reader of the code (both call `saveFormDataToStorage`). A future
> pass should either rename the autosave's keys to make clear they are ephemeral
> browser-only recovery state with no server counterpart, or gate the header's "Draft
> saved" status copy (`UploadMatchFlow.tsx:669-675`) so it only reflects the durable
> `match_drafts` write, not the local autosave tick — today that status string can read
> "Draft saved" from local autosave alone, before the user has ever clicked the Save
> draft button.
>
> Acceptance: the wizard's UI never claims "Draft saved" in a way a user would reasonably
> read as "there is a Resume row for this in the Matches table" unless a `match_drafts`
> row actually exists.

> **Recommendation: Prevent a stale completed draft from creating a duplicate match.**
> Before submitting from a resumed draft, check whether a match already exists for that
> draft (e.g., by having `deleteMatchDraft`'s caller confirm success before treating
> completion as final, or by storing the resulting `matchId` back onto the draft row
> and checking it on resume). This closes the gap in §"Completion cleanup" where a
> `deleteMatchDraft` failure leaves a stale, resumable draft for a match that already
> exists.
>
> Acceptance: resuming a draft whose match was already created (because the delete
> failed) does not create a second `matches` row; it either declines to resume with an
> explanation, or routes the user to the existing match.

None of the four recommendations above are implemented by this document, and none of
them should be read as authorizing implementation — they restate, with file/line
grounding, the same four gaps the design document (§"Save draft behavior contract — plan
only") identified by inspection. Building any of them is separate scoped work with its
own task and its own tests.
