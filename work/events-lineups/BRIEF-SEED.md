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

1. **The earlier 5a/5b work is abandoned — the design file governs.** A
   previous run implemented designs 5a and 5b (the schedule day-zero empty
   states, coach and player variants) in
   `src/components/dashboard/schedule/schedule-list.tsx` (`EmptySchedule`).
   The human has since said to ignore and abandon that work. It is **not** a
   constraint on this run and it is **not** a reason to narrow scope: copy
   `Events & Lineups.dc.html` exactly, and where this design covers the same
   empty states, re-implement them from the design and overwrite what is
   there. The old run's "keep the header and New event CTA consistent with
   the existing codebase" instruction is likewise void — it belonged to that
   brief, not this one. Those commits were left in place rather than
   reverted, on the assumption that this run overwrites them in the same
   files; nothing downstream should treat them as already-approved.
2. **"Don't worry about the database or linking to external pages"** — the
   human has scoped this to presentation. Static or mock data in place of
   live queries is expected, not a shortcut to flag.
