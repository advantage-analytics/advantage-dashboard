# Run log — claude/roster-new-player-form-abafe7

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add neutral icons to the roster drawer's Options menu — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** In `src/components/dashboard/team/player-drawer.tsx`'s `MemberMenu`, added leading Lucide glyphs (`Upload`, `Pencil`, `Trash2`) to the three Options-popover rows, each `size-[13px]` `strokeWidth={1.5}` `aria-hidden` `text-[var(--ink-400)]` in a shared `shrink-0` column with `gap-2.5` to the text. No gating/behaviour logic touched.

## T2 · Drop the event/school suffix from the drawer's recent-match rows — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** Removed the ` · {match.event}` suffix from the drawer's recent-match row in `player-drawer.tsx`; removed `RosterRecentMatch.event`, `DbMatchRow.tournament_name`, the select column, and the map assignment in `team-roster-server.ts`. `tests/team-roster-ids.spec.ts`'s fixture at ~163 builds an unrelated `DbRecentMatch` type from `team-home-server.ts` and needed no change — verified independently, not just taken on the subagent's word.
