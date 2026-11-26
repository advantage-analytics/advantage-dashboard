# Handoff: bring the landing site in line with the dashboard's 2027 plans

Paste everything below the line into a new Claude Code session in
`advantage-landing`. Written 2026-11-26 from the dashboard's build plan
(`advantage-dashboard/docs/plans/2027-pricing.md`) and Cj's decisions.

---

You're working in `advantage-landing`. The dashboard is building the January 1,
2027 plans from this site's `src/lib/plans.ts`, but a few decisions made since
then change what the site should say. Make these changes, keep every figure in
`src/lib/plans.ts` (nothing typed into a page), and open a PR. Don't change the
dashboard from here.

## Changes

1. **No free match.** Set `FREE_MATCH_OFFER = false`. The Free plan stays on
   the page, but as the SwingVision plan: SwingVision imports, 20 Ask
   questions a month, and your team's film. No video hours. Rewrite its line
   (and `FREE_MATCH_LINE`'s uses) so nothing promises a free analyzed match.
2. **Ask on Free.** Wherever plans compare Ask, Free gets "20 questions a
   month", not "No". Coach and Coach Pro stay "Unlimited", with a short
   fair-use note (the exact paid limits are being decided separately; don't
   print numbers).
3. **First month half off.** Coach and Coach Pro monthly plans are 50% off the
   first month for new customers ($75 and $150), monthly only; yearly keeps
   its one month free and the two don't stack. Add it as a constant in
   `plans.ts` and show it on the plan cards and in the pricing FAQ.
4. **Rush and Priority are not live yet.** Every match runs at Standard speed
   for now. Mark Rush and Priority "coming soon" (or remove them from the plan
   cards), including Program's "3 Rush included" and Elite's Priority hours,
   and soften any FAQ answer that promises them today.
5. **Schedule isn't live.** Leave Schedule out of the college feature lists.
6. **Plan links.** `signUpHref()` should keep sending `?plan=<id>&period=…`.
   The dashboard now signs the person up or in and lands them on Settings ›
   Plan with the checkout dialog open on that plan; there is no checkout page.
   No change needed beyond keeping the parameters, but check every
   "Choose Coach" / "Choose Coach Pro" link uses `signUpHref()`.
7. **Extra hours** are $35 each, last 12 months, and need no plan. Make sure
   the copy says so and doesn't imply a plan is required.
8. **Upgrades.** Moving up is self-serve in the dashboard (no email needed):
   a new month starts that day with the new plan's hours, and you're credited
   for the unused part of the old plan. Moving down still happens at renewal.
   Update the FAQ answer that says to email for both.

## Check

- `npm run build` and whatever lint/test scripts the repo has.
- Read `/pricing`, the home FAQ, `llms.txt` and the structured data once more
  for any leftover "first match free", Rush/Priority-today or Free-without-Ask
  wording.
- List anything the dashboard would need to change for Cj, rather than
  changing it.
