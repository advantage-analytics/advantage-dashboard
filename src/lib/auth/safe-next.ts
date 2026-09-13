/** Where auth lands when the requested destination is missing or untrustworthy. */
const FALLBACK = "/dashboard";

/**
 * Clamp a `next=` parameter to a path on this origin.
 *
 * Both auth callbacks take their redirect target from the query string, so the
 * value is attacker-controlled. This resolves the candidate against a throwaway
 * origin and checks where it actually landed, rather than pattern-matching for
 * known-bad prefixes.
 *
 * The distinction matters. A blocklist of `//` and `/\` looks sufficient and is
 * not: browsers strip ASCII tab, CR and LF *before* parsing a URL, so
 * `/<TAB>/evil.com` survives every prefix test and then collapses to
 * `//evil.com` in the Location header. Parsing sees what the browser will see.
 * Returning the parsed components rather than the raw string also normalises
 * those characters away instead of forwarding them.
 */
export function safeNext(value: string | null): string {
  if (!value) return FALLBACK;

  const base = "https://next.invalid";
  try {
    const url = new URL(value, base);
    // Anything absolute, protocol-relative, or non-http lands on a different
    // origin (javascript: and data: resolve to the opaque origin "null").
    if (url.origin !== base) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
