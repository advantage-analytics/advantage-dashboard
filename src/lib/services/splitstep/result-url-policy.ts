/**
 * Where a vendor result URL may point before this server fetches it.
 *
 * A completion delivery carries four signed URLs (`strokes_url`,
 * `players_url`, `trajectories_url`, `trimmed_video_url`) and the webhook
 * downloads the first three server-side. The route records whatever URL the
 * vendor sent — that is deliberate, it keeps hand recovery possible — but the
 * fetch itself must not be steerable: a forged or replayed delivery pointing
 * at `169.254.169.254`, `localhost` or an internal host would otherwise have
 * the webhook make that request and file the response as match results.
 *
 * So this is an exact-hostname allowlist, checked at the fetch and nowhere
 * else. Every live result URL to date is on the vendor's own Azure account
 * (`splitstepclientvideos.blob.core.windows.net`); our own storage account is
 * allowed too, since results may one day be handed back via it; anything else
 * has to be named in `SPLITSTEP_RESULT_HOSTS`. Matching is on `hostname`
 * exactly — no suffix or substring — and `https:` only, so the fetch can also
 * use `redirect: "error"` without ever following a hop off the list.
 *
 * Pure: reads `process.env` on each call and imports nothing, so a spec can
 * load it for real.
 */

/** The vendor's Azure account, the origin of every result URL seen live. */
const VENDOR_RESULT_HOST = "splitstepclientvideos.blob.core.windows.net";

/**
 * The hosts a result fetch may go to: the vendor's account, ours when
 * `AZURE_STORAGE_ACCOUNT` is set, and any comma-separated entry in
 * `SPLITSTEP_RESULT_HOSTS`. Entries are lower-cased, which is how the URL
 * parser reports a hostname, so a mixed-case env value still matches.
 */
export function defaultResultHosts(): string[] {
  const hosts = new Set<string>([VENDOR_RESULT_HOST]);

  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim().toLowerCase();
  if (account) hosts.add(`${account}.blob.core.windows.net`);

  for (const entry of (process.env.SPLITSTEP_RESULT_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (host) hosts.add(host);
  }

  return [...hosts];
}

/**
 * True only for an `https:` URL whose hostname is exactly one of `hosts`.
 * Anything that does not parse is refused rather than guessed at.
 */
export function isAllowedResultUrl(
  url: string,
  hosts: readonly string[] = defaultResultHosts(),
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return hosts.includes(parsed.hostname);
}

/**
 * The hostname of a result URL for a log line or an error message — never
 * the URL itself, which carries a SAS token in its query.
 */
export function resultUrlHostname(url: string): string {
  try {
    return new URL(url).hostname || "(no host)";
  } catch {
    return "(unparseable)";
  }
}
