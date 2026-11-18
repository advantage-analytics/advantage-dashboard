/**
 * Where a draft resumes: the wizard of the workspace it was saved in.
 *
 * In a module of its own, with no "use client", so the Matches page — a server
 * component — can redirect a saved `?draft=` link to it.
 */
export function draftHref(id: string, scope: "personal" | "team"): string {
  return scope === "team"
    ? `/dashboard/team/upload?draft=${id}`
    : `/dashboard/matches/new?draft=${id}`;
}
