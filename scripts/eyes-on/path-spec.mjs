// Argument parsing for scripts/eyes-on/capture.mjs, kept free of side effects
// so a spec can import it without a browser, a dev server or credentials.

/** The prefix that selects the team workspace for a path outside /dashboard/team. */
export const TEAM_PREFIX = "team:";

/**
 * Parse one path argument: `[team:]<path>[::<click>…]`.
 *
 * Returns `{ team, path, clicks }` — `team` is true for a `team:` prefix or a
 * path under `/dashboard/team`; `path` has the prefix stripped; `clicks` are
 * the `::` segments after the path, untouched. Returns null when the argument
 * is not a path spec (it must start with `/` once any prefix is removed).
 */
export function parsePathSpec(arg) {
  const prefixed = arg.startsWith(TEAM_PREFIX);
  const rest = prefixed ? arg.slice(TEAM_PREFIX.length) : arg;
  if (!rest.startsWith("/")) return null;
  const [path, ...clicks] = rest.split("::");
  return {
    team: prefixed || path.startsWith("/dashboard/team"),
    path,
    clicks,
  };
}
