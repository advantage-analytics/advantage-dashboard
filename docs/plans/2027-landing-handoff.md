# Handoff: bring the landing site in line with the final 2027 pricing

Paste everything below the line into a new Claude Code session in
`advantage-landing`. Written 2026-11-27 from the dashboard's final pricing
(`advantage-dashboard/docs/plans/2027-pricing.md`, "Final pricing"). It
replaces the 2026-11-26 handoff: where the two disagree, this one is right.

---

You're working in `advantage-landing`. The dashboard sells the January 1, 2027
plans from its own `src/lib/billing/plans.ts`; this site keeps its own copy in
`src/lib/plans.ts`. Pricing was finalised on 2026-11-27. Make the changes
below, keep every figure in `src/lib/plans.ts` (nothing typed into a page),
and open a PR. Don't change the dashboard from here.

## Personal plans

1. **Rename Coach and Coach Pro to Player and Player Pro**, ids `player` and
   `player-pro`. Where the plans are introduced, the audience line is **"For
   players and parents."** Remove any wording that says one plan covers
   several players.
2. **Headline every plan in matches, with hours as sub-copy:**

   | Plan       | Monthly | Yearly | Headline                         | Sub-copy                                       |
   | ---------- | ------- | ------ | -------------------------------- | ---------------------------------------------- |
   | Free       | $0      | —      | Free for SwingVision users       | (no video hours)                               |
   | Player     | $150    | $1,650 | About 3 verified matches a month | 5 hours of match video · every match verified  |
   | Player Pro | $300    | $3,300 | About 6 verified matches a month | 10 hours of match video · every match verified |

   The match counts 3 and 6 are stated figures: store them, don't compute
   them from the hours.

3. **Free** shows "Unlimited SwingVision imports" and "20 Ask questions a
   month", and **no free match**: `FREE_MATCH_OFFER` is off, and nothing
   promises a free analyzed match or any video hours.
4. **Ask:** Free 20, Player 150, Player Pro 300 questions a month.
5. **First month 30% off** for new customers on a monthly plan: $105 for
   Player, $210 for Player Pro. Monthly only; yearly keeps its one month free
   and the two don't stack. Keep the percentage as one constant in `plans.ts`
   and build every sentence from it ("30% off your first month", "$105 today,
   then $150 a month"). Nothing should still say "half off" or 50%.
6. **Never show a price per hour** for a plan, anywhere. The one place an
   hourly price appears is the extra-hours line below.

## College plans

7. Price · hours · "About N verified matches", for the spring and for the
   full year:

   | Plan    | Spring                | Full year             | Covers                                 | Ask, team pool a month |
   | ------- | --------------------- | --------------------- | -------------------------------------- | ---------------------- |
   | Starter | $3,000 · 80 h · 45    | $4,800 · 130 h · 70   | Your top courts, every dual            | 500                    |
   | Program | $7,500 · 225 h · 125  | $10,500 · 325 h · 180 | Nearly every singles match, every dual | 1,000                  |
   | Elite   | $12,000 · 400 h · 220 | $16,500 · 550 h · 305 | Every match, plus fall and practice    | 2,000                  |

   Lead each card with the matches, with the hours beneath, as on the
   personal plans.

8. **Ask is one pool for the whole team each month** (500 / 1,000 / 2,000),
   not a number per person.
9. **Rush and Priority are not in any plan.** Remove Program's included Rush,
   Elite's included Rush and its Priority hours, and the Priority add-on. Show
   one line, "Rush and Priority: coming soon", where plan contents are listed,
   and soften any FAQ answer that promises them today.
10. **No Schedule** in the college feature lists.
11. Don't print a roster size or seat limit: none is decided.

## Extra hours

12. One line, wherever extra hours are offered: **"$35 an hour (about $60 per
    extra match)"**. Anyone can buy them, with or without a plan, and they
    last 12 months. The $60 is a stated figure; keep it as a constant beside
    the $35. Verified by Advantage comes with a plan (Player, Player Pro or a
    college plan): don't say extra hours bought on Free are verified.

## FAQ

13. Add or update these answers:
    - **How long is a match?** A singles match is about 1.8 hours of video.
      Longer matches use more hours.
    - **Can I share a plan?** No: one person per account.
    - **I have two juniors.** A parent with two juniors needs two plans, one
      for each player.

## Links

14. `signUpHref()` sends `plan=player` or `plan=player-pro` with
    `period=monthly|yearly`. The dashboard signs the person up or in and lands
    them on Settings › Plan with the checkout open on that plan. It still
    accepts the old `plan=coach` and `plan=coach-pro` and reads them as the
    new plans, so the two sites don't have to ship on the same day.
    `plan=free` lands on Home.

## Check

- `src/lib/plans.ts` matches the tables above, figure for figure.
- Search the site for "Coach Pro", "Coach" used as a plan name, "half off",
  "50%", "first match free", "Rush included", "Priority hours" and any "$… an
  hour" or "per hour" outside the extra-hours line: none should remain. A
  coach as a person ("your coach", "head coach") is fine.
- No cost, vendor rate or margin appears anywhere.
