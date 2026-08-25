# Tasks — claude/magical-hopper-ezu0ov

> Scope: bring the team roster surface to Advantage Design System v3 — `Team Roster.dc.html` section 07 (9a–9d), design only.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue, then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Bring the roster widget to Design 9a (v3 chrome)
- **status:** done
- **files:** src/components/dashboard/team/roster-table.tsx,
  src/app/dashboard/team/roster/page.tsx,
  src/components/dashboard/team/roster-header-buttons.tsx — a guess
  (read-only: src/lib/data/team-roster-server.ts,
  `_ds/advantage-design-system-v3-abcb65f6.../styles.css`)
- **done when:**
  - [ ] A leading lineup `#` column renders before Player: 24px fixed,
        `mono tabular` 11px `--ink-500`. Its header cell is `#` in
        `eyebrow-sm` followed by a 10px `arrow-up` icon. A member with
        `lineupSpot: null` and every invite row render an em dash in
        `--ink-400`. Row order is unchanged — the column labels the sort
        that `getRosterData` already returns.
  - [ ] Member rows use 8a's rounded inset hover: `padding: 12px 16px`
        pulled back by a -16px horizontal margin,
        `border-radius: var(--radius-element)`, hover fill
        `--surface-muted`. No `border-b` hairline survives between member
        rows, and horizontal padding has moved from the row (`px-6`) to
        the card (`2px 24px 6px`) — the comment at `roster-table.tsx:68`
        explaining why padding lives on the row is updated or removed, not
        left contradicting the code.
  - [ ] Invite rows stay in the same card below the member rows with no
        divider above them, keep the dashed 26px avatar and 12px
        `--ink-500` email, and their trailing pair reads `Resend`
        (`--blue`, 500 weight) then `Revoke` — the current "Withdraw"
        label is gone.
  - [ ] The page header matches 9a: `eyebrow` workspace line,
        `text-display` "Roster", `text-body-sm` standing line, then
        `Invite` as a v3 secondary and `Add player` as a v3 primary at
        36px, right-aligned and bottom-aligned with the heading block.
  - [ ] The diff touches no loader or query: `team-roster-server.ts`,
        `roster-actions.ts` and `team-actions.ts` are unchanged, and no
        new field is read off `RosterMember`. `npm run lint`,
        `npx tsc --noEmit` and `npm test` stay green.
- **notes:** Design 9a, `Team Roster.dc.html` section 07, project afde9116.
  Shipped code is 6a; 9a is 6a's columns with 5a's `#` column and 8a's row
  treatment. Deliberately out of scope, per "fold in the database
  requirements in a later phase": 9a's invite line reads "Invited Aug 4 by
  you · player role", and "by you" needs an inviter the loader does not
  return today — keep the existing "Invited {date} as {role}" wording.
  9b–9d are T2 and T3.

## T2 · Align the roster dialogs with 9b and 9c
- **status:** doing
- **files:** src/components/dashboard/team/roster-invite-dialog.tsx,
  src/components/dashboard/team/add-player-dialog.tsx — a guess
  (read-only: src/components/dashboard/team/dialog-shell.tsx,
  src/components/dashboard/team/invite-target-picker.tsx)
- **done when:**
  - [ ] The invite dialog's title renders the active program's name —
        "Invite to Meridian State" in the spec — instead of the literal
        "Invite to the program" at `roster-invite-dialog.tsx:159`.
  - [ ] Its description is 9b's single line, "Link the invite to a player
        you've added, or start fresh.", replacing both branches of the
        current `linked ? … : …` ternary.
  - [ ] The footer gains a left-aligned `Copy invite link` action — 14px
        `link` icon, placed before the flex spacer so Cancel and Send
        invite stay right — that puts a working `/join/<token>` URL on the
        clipboard and confirms in place. If no token can exist before Send,
        it renders disabled with that reason stated in the code rather than
        copying a dead link.
  - [ ] The add-player dialog's description is 9c's line: "A coach-managed
        profile — no login needed. You upload their matches; Advantage
        builds their stats the same."
  - [ ] No field or control is added or removed in either dialog: the
        invite dialog keeps its Player / Assistant coach role picker, and
        add-player keeps all six fields. `npm run lint`, `npx tsc --noEmit`
        and `npm test` stay green.
- **notes:** Both dialogs already match 9b/9c structurally — this is copy
  plus one action, not a rebuild. 9b draws no role picker because it is
  showing a player invite; 9a's own invite rows say "assistant coach", so
  the picker stays. 9c's info-row wording is left alone deliberately: the
  shipped "credit you as the person who added them" already carries the
  spec's "match cards credit 'added by Coach Vasquez'" without hard-coding
  a name.

## T3 · Add 9d's claim receipt above the roster
- **status:** todo
- **files:** src/app/dashboard/team/roster/page.tsx — a guess (read-only:
  src/components/dashboard/team/roster-table.tsx,
  src/lib/data/team-roster-server.ts)
- **done when:**
  - [ ] A receipt renders between the page header and the roster card
        whenever at least one member has `claimedToday`: a 14px
        `user-check` icon, a bold lead "{name} claimed their profile.",
        then the detail clause carrying matches kept, upload credits
        unchanged, and seats as "{used} of {seats}" — every number in
        `tabular`. Where more than one member claimed today the diff states
        its rule rather than silently rendering the first.
  - [ ] The receipt ends with a trailing `View profile` action linking to
        that member's `/dashboard/team/roster/{playerId}`.
  - [ ] Nothing renders when no member has `claimedToday` — no empty
        container and no reserved vertical space.
  - [ ] 7d's existing carriers are untouched: the "Claimed today" chip in
        the last-match cell (`roster-table.tsx:390` and `:404`) and the
        credit footnote (`page.tsx:117`) both still render.
  - [ ] Seat figures come from the `SeatUsage` the invite dialog is already
        given — no new loader, query or `RosterMember` field. `npm run
        lint`, `npx tsc --noEmit` and `npm test` stay green.
- **notes:** 9d's other two signals already ship; the banner is the whole
  delta. Design writes "Priya Sharma claimed her profile" — render it with
  "their", since the roster carries no pronoun for anyone.
