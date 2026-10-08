/**
 * Stand-ins for the sample page's browser harness (`sample-page-harness.tsx`).
 *
 * `match-report.tsx` puts `MatchReportMoreMenu` on its namespace object, so
 * the menu is in the bundle even though the sample page never renders it
 * (it returns `null` under `readOnly` either way). The menu dynamic-imports
 * the edit and delete dialogs, whose server actions pull `next/cache`,
 * `node:stream` and `posthog-js` into a plain webpack build. Alias both
 * dialog specifiers here: a chunk nobody can open, holding nothing.
 */
export function EditMatchDialog(): null {
  return null;
}

export function DeleteMatchDialog(): null {
  return null;
}
