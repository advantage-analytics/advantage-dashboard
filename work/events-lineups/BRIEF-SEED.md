# Brief seed — events-lineups

> Captured verbatim from the `/feature-new` invocation on 2026-08-31.
> Extend or replace this with anything more you want stage 01 to know
> (prose, bullets, a pasted voice note), then run `/feature-next
> events-lineups` to start the pipeline — stage 01 refines this into the
> brief.

"Copy this UI design exactly, don't worry about the database or linking to
external pages. We can do that later

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via
/design-login) to import this project:

https://claude.ai/design/p/afde9116-328b-445c-aeff-8b3c2a702d6f?file=Events+%26+Lineups.dc.html

Focus on these files (the whole project is readable):

- `Events & Lineups.dc.html`

Also read these files the selection imports:

- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/_ds_bundle.js`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/styles.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/base.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/colors.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/effects.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/fonts.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/spacing.css`
- `_ds/advantage-design-system-v3-abcb65f6-4e66-44bc-b9de-b3b47f4313c1/tokens/typography.css`
- `support.js`

Implement: `Events & Lineups.dc.html`"

---

## Runner notes (not the human's words — delete or edit freely)

Two things stage 01 should not have to rediscover:

1. **A previous run already shipped part of this file.** Designs 5a and 5b —
   the schedule day-zero empty states, coach and player variants — are
   implemented and committed on this branch in
   `src/components/dashboard/schedule/schedule-list.tsx` (`EmptySchedule`).
   That run's brief also asked that the header and the "New event" CTA stay
   consistent with the existing codebase rather than the mock. Stage 01
   should scope this run to what the design file contains *beyond* 5a/5b, and
   decide explicitly whether the shipped empty states are re-opened by "copy
   this UI design exactly" or left as they are.
2. **"Don't worry about the database or linking to external pages"** — the
   human has scoped this to presentation. Static or mock data in place of
   live queries is expected, not a shortcut to flag.
