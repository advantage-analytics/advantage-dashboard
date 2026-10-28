/**
 * `reportMatchIssue` for browser harnesses: the real one is a server action
 * (`report-issue-actions.ts`), which a plain webpack bundle cannot build. The
 * harnesses never file a report; this answers success so a page that does
 * still settles.
 */
export async function reportMatchIssue(): Promise<{ ok: true }> {
  return { ok: true };
}
