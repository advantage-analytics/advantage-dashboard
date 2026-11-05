// Argument parsing for scripts/eyes-on/capture.mjs, kept free of side effects
// so a spec can import it without a browser, a dev server or credentials.

/** The prefix that selects the team workspace for a path outside /dashboard/team. */
export const TEAM_PREFIX = "team:";

/**
 * The prefix that signs in as the labeller account (`EYES_ON_LABELLER_*`)
 * instead of the verifier, for a path outside /label.
 */
export const LABELLER_PREFIX = "labeller:";

/** The dynamic segment `fillSessionId` replaces in a labeller path. */
export const SESSION_ID_SEGMENT = "[sessionId]";

/** True for `/label` itself and anything beneath it — not `/labels…`. */
function isLabellerArea(path) {
  return path === "/label" || path.startsWith("/label/");
}

/**
 * Parse one path argument: `[team:|labeller:]<path>[::<click>…]`.
 *
 * Returns `{ team, labeller, path, clicks }`:
 *   - `team` is true for a `team:` prefix or a path under `/dashboard/team`;
 *   - `labeller` is true for a `labeller:` prefix or a path under `/label`,
 *     and a labeller path is never a team one (the labeller account has no
 *     workspace to select);
 *   - `path` has the prefix stripped;
 *   - `clicks` are the `::` segments after the path, untouched.
 * Returns null when the argument is not a path spec (it must start with `/`
 * once one prefix is removed — the two prefixes do not combine).
 */
export function parsePathSpec(arg) {
  let prefix = "";
  if (arg.startsWith(TEAM_PREFIX)) prefix = TEAM_PREFIX;
  else if (arg.startsWith(LABELLER_PREFIX)) prefix = LABELLER_PREFIX;
  const rest = arg.slice(prefix.length);
  if (!rest.startsWith("/")) return null;
  const [path, ...clicks] = rest.split("::");
  const labeller = prefix === LABELLER_PREFIX || isLabellerArea(path);
  return {
    team:
      !labeller &&
      (prefix === TEAM_PREFIX || path.startsWith("/dashboard/team")),
    labeller,
    path,
    clicks,
  };
}

/**
 * Replace a `[sessionId]` segment with the seeded labeller session's id
 * (`EYES_ON_LABELLER_SESSION_ID`, printed by seed-labeller-session.ts), so a
 * `routes:` line written as `labeller:/label/[sessionId]` opens a real
 * session. Without an id the path is returned unchanged (and will 404 — the
 * report says so).
 */
export function fillSessionId(path, sessionId) {
  if (!sessionId || !path.includes(SESSION_ID_SEGMENT)) return path;
  return path.split(SESSION_ID_SEGMENT).join(sessionId);
}
