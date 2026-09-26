/**
 * The active-workspace cookie, readable from both sides.
 *
 * `active-workspace-server.ts` resolves it (and re-exports the name for the
 * writers that already import it from there); this module exists so a client
 * component can read the same cookie without pulling a server module — and
 * `next/headers` with it — into the browser bundle.
 *
 * The cookie is not `httpOnly`, and needs no secrecy: it names a workspace
 * id, and the server re-validates it against membership on every request.
 * Reading it here decides nothing about access; it only tells the chrome
 * that it may be out of date.
 */

export const WORKSPACE_COOKIE = "advantage_workspace";

/** The cookie's value from a `document.cookie` string, or null. */
export function readWorkspaceCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== WORKSPACE_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * The cookie value the chrome should be refreshed for, or null when it agrees.
 *
 * No cookie means the server fell back to its default and the chrome drew
 * that, so there is nothing to disagree with. A cookie naming a workspace the
 * viewer does not belong to is still returned: the server will fall back, the
 * one refresh confirms it, and the caller's once-per-value guard keeps that
 * from repeating.
 */
export function staleChromeTarget(
  cookieValue: string | null,
  chromeWorkspaceId: string,
): string | null {
  if (!cookieValue || cookieValue === chromeWorkspaceId) return null;
  return cookieValue;
}
