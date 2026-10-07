# Brief — first-run onboarding (personal workspace)

## Goal

A first-time player should understand what Advantage gives them, and how to get it,
before they spend any of their video allowance. Today a new personal account lands on
the day-zero Home with one offer (upload a match) and nothing to look at until a match
has been uploaded and analysed. That can take hours, and some players have no footage
yet.

Onboarding should do two things:

1. **Show the product working**: a guided look at a real, finished match report, so
   the player sees the stats, court map, AI summary and film before committing a match
   of their own.
2. **Get their first real match in, correctly**: guide the first upload through the
   inputs that matter, and carry the player through the wait to their first report.

## Scope

Personal workspaces only. A first-time player experiences the following:

- **Sample match.** A single game from the Rudy vs Goodman match, shown as a finished
  match report with its film. It is read-only, permanently and visibly labelled as a
  sample, and the same for every account. It is not the player's data and never
  appears in anything that counts their matches.
- **Guided tour of the sample.** A short sequence of tooltips over the report's main
  sections. It can be dismissed, and it can be resumed later.
- **Routing from onboarding.** The recording-source answer in the existing `/onboarding`
  flow (step 5) decides where the player goes next: their first import, their first
  video upload, or the sample when they have nothing to upload yet.
- **Day-zero entry point.** The empty Home offers the sample as a secondary action next
  to the existing upload offer.
- **Guided first upload.** Explanatory copy on the wizard's player-identity inputs, and
  a preview of how much of the monthly allowance the upload will use, shown before the
  player submits.
- **While it analyses.** The analysis-in-progress screen points the player to the
  sample.
- **First real report.** The same tour runs once on the player's own first finished
  match.
- **Getting-started checklist.** A light progress indicator across these steps.
- **Remembered progress.** Tour and checklist state is stored per account, so it holds
  across devices and browsers.

## Non-goals

- Team workspaces, and coach, staff or program-owner onboarding (invites, budgets,
  roster).
- Changing what the existing `/onboarding` questions ask, or the persona model.
- Writing sample or mock rows into the player's `matches` / `points` / `shots` / stats,
  or letting the sample affect Home KPIs, the heatmap, AI insights or opponents.
- Changing the upload wizard's inputs, step order or validation. The upload changes are
  copy and a read-only preview only.
- Changing the Advantage Intelligence pipeline, quotas or pricing.
- Re-opening the day-zero Home design beyond adding the sample entry point.
- Adopting a third-party tour or tooltip library.

## Constraints

- **Guardrails.** `docs/ui-revamp-guardrails.md` must be read before any UI work. §4's
  three wizard inputs are the ones that, when wrong, attribute every statistic to the
  wrong player with nothing looking broken. Onboarding may explain them; it must not
  alter them.
- **Design system.** Tooltips and the checklist are built from our own design system
  (`.skills/advantage-analytics-design/SKILL.md`). Primary buttons come from
  `advButton()`.
- **Nothing invented.** The day-zero surfaces deliberately show no fabricated data. The
  sample is real data from a real match, and it must never read as the player's own.
- **Allowance.** An individual gets about 2 processing-hours a month, and one full match
  can use most of it. The allowance shown before upload must match what will actually
  be charged.
- **Naming.** "Advantage Intelligence" in every user-visible string. `splitstep` is
  internal only.
- **Video access.** The sample film must play for every signed-in account. Vendor and
  Azure signing code (`@azure/storage-blob`) must never reach a client bundle.
- **Database.** Any new function follows the no-`anon`-by-default grant rule. Any new
  per-account state is protected by RLS.
- **Platform.** Next.js 16 conventions, as in the repo's `AGENTS.md`. `npm run map`
  after any new route.

## Success criteria

- A new personal account with no matches can open the sample report from day-zero Home
  and from the end of onboarding, and finish or dismiss the tour.
- On the sample:
  - every section the tour points at renders with real values;
  - the film plays;
  - the "sample" label is visible at every scroll position.
- Opening the sample changes none of the player's own match counts, KPIs, heatmap, AI
  insight or opponents (checkable with a fresh account before and after).
- The recording-source answer leads to the matching next screen for each of its options.
- The first-upload wizard shows the helper copy on the player-identity inputs and an
  allowance preview before submission. Its inputs and payload are byte-identical to
  today's (`pipeline-guardrails-reviewer` passes).
- The analysis-in-progress screen links to the sample.
- The player's first finished match shows the tour once, and never again after it is
  finished or dismissed.
- Tour and checklist progress made in one browser is reflected in another for the same
  account.
- Team workspaces show none of this.
- The existing gates pass: lint, typecheck, tests, and `/pr-check` including the
  headless UI review.

## Open questions

1. **Consent and identity.**
   - Have Rudy and Goodman agreed to their match being shown to every new account?
   - Should their real names appear, or be replaced?
2. **Point of view.** Whose perspective does the sample report take (Rudy's or
   Goodman's)? This decides which player's stats the tour describes as "you".
3. **Which game, and its film.** Which game of the match is used, and is there an
   existing trimmed clip for it, or does one need cutting?
4. **Serving the shared clip.** The clip has to be readable by all accounts. Options
   include a long-lived public blob, a server-minted signed URL per view, or another
   host. The trade-off is cost and exposure.
5. **First real report.** Should the first-report tour also apply to a SwingVision
   import, or only to an Advantage Intelligence video upload?
6. **Existing accounts.** Do players who already have matches see the sample entry point
   or checklist at all, or is this only for accounts created after launch?
7. **Checklist lifetime.** When does the getting-started checklist disappear: when every
   step is complete, on dismissal, or after some period?
8. **Beta welcome dialog.** How does the existing `BetaWelcomeDialog` (shown once on the
   first dashboard visit) sequence with the tour, so a new player isn't met with two
   overlays at once?
