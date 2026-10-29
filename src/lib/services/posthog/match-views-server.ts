import { unstable_cache } from "next/cache";
import { readShareToken } from "@/lib/data/match-share-format";
import { UUID_RE } from "@/lib/admin/validation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How often each match was looked at, for Admin › Matches — read from
 * PostHog's `$pageview` events on the server through the HogQL query API.
 *
 * Two pages count as a view of a match:
 *
 *   * `/dashboard/matches/<id>` — the report, for anyone signed in;
 *   * `/m/<token>` — a public share link, mapped back to its match through
 *     `match_share_links`. A link that has since been turned off no longer
 *     maps, so its views drop out with it.
 *
 * The admin's own report view lives at `/admin/matches/<id>`, a different
 * path, so it never reaches this query. Admins visiting the player-facing
 * pages are left out too: `distinct_id` is the Supabase user id once
 * `posthog.identify()` has run (`dashboard-shell.tsx`), and every admin's id is
 * excluded. An admin's visit made before PostHog identified them is anonymous
 * and cannot be told apart — the line says "admin views not counted", which
 * is true of every identified one.
 *
 * Optional and never fatal. Without `POSTHOG_PERSONAL_API_KEY` (a personal
 * key scoped to `query:read`, server-only) or a PostHog host this resolves to
 * null and the page prints "—"; a failed call does the same. Results are
 * cached for five minutes so a busy console costs PostHog one query per
 * window, and a failure is never cached.
 */

const WINDOW_DAYS = 30;
const REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 6000;

const MATCH_PATH = /^\/dashboard\/matches\/([0-9a-f-]{36})\/?$/i;
const SHARE_PATH = /^\/m\/([^/]+)\/?$/;

/**
 * The private API's origin. Ingestion runs on `us.i.posthog.com` (what
 * `NEXT_PUBLIC_POSTHOG_HOST` names); the query API is the app host beside it,
 * `us.posthog.com`. A host that is neither shape — a reverse proxy — cannot be
 * mapped, and the counts read as unmeasured rather than guessed.
 */
export function posthogApiOrigin(
  ingestHost: string | undefined = process.env.NEXT_PUBLIC_POSTHOG_HOST,
): string | null {
  if (!ingestHost) return null;
  try {
    const url = new URL(ingestHost);
    const host = url.hostname.toLowerCase();
    const regional = /^([a-z]+)\.i\.posthog\.com$/.exec(host);
    if (regional) return `https://${regional[1]}.posthog.com`;
    if (host === "app.posthog.com" || /^[a-z]+\.posthog\.com$/.test(host)) {
      return `https://${host}`;
    }
    return null;
  } catch {
    return null;
  }
}

function projectId(): string {
  return process.env.POSTHOG_PROJECT_ID?.trim() || "291029";
}

/** Is there anything to ask? False means every count is "—". */
export function matchViewsConfigured(): boolean {
  return Boolean(
    process.env.POSTHOG_PERSONAL_API_KEY?.trim() && posthogApiOrigin(),
  );
}

async function adminUserIds(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("users")
    .select("id")
    .eq("is_admin", true);
  if (error) throw new Error(`admin ids read failed: ${error.message}`);
  return ((data ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter((id) => UUID_RE.test(id));
}

async function shareTokenMatches(
  tokens: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(tokens)].filter(Boolean);
  for (let offset = 0; offset < unique.length; offset += 100) {
    const chunk = unique.slice(offset, offset + 100);
    const { data, error } = await createAdminClient()
      .from("match_share_links")
      .select("token, match_id")
      .in("token", chunk);
    if (error) throw new Error(`share links read failed: ${error.message}`);
    for (const row of (data ?? []) as { token: string; match_id: string }[]) {
      out.set(row.token, row.match_id);
    }
  }
  return out;
}

/** One HogQL round trip: pageviews per path over the window. Throws on failure. */
async function queryPageviews(
  origin: string,
  apiKey: string,
  excludedIds: string[],
): Promise<[string, number][]> {
  // The ids are validated UUIDs, so inlining them cannot break the query.
  const exclusion = excludedIds.length
    ? `AND distinct_id NOT IN (${excludedIds.map((id) => `'${id}'`).join(", ")})`
    : "";
  const query = `
    SELECT properties.$pathname AS path, count() AS views
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${WINDOW_DAYS} DAY
      AND (startsWith(properties.$pathname, '/dashboard/matches/')
        OR startsWith(properties.$pathname, '/m/'))
      ${exclusion}
    GROUP BY path
    LIMIT 50000`;

  const response = await fetch(
    `${origin}/api/projects/${encodeURIComponent(projectId())}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`PostHog query answered ${response.status}`);
  }
  const body = (await response.json()) as { results?: unknown };
  if (!Array.isArray(body.results)) {
    throw new Error("PostHog query returned no results array");
  }
  return body.results.flatMap((row): [string, number][] => {
    if (!Array.isArray(row)) return [];
    const [path, views] = row as [unknown, unknown];
    const count = Number(views);
    return typeof path === "string" && Number.isFinite(count)
      ? [[path, count]]
      : [];
  });
}

/** Match id → views over the window. Throws on any failure (never cached). */
async function computeMatchViews(): Promise<Record<string, number>> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const origin = posthogApiOrigin();
  if (!apiKey || !origin) throw new Error("PostHog query is not configured");

  const rows = await queryPageviews(origin, apiKey, await adminUserIds());

  const counts: Record<string, number> = {};
  const byToken: [string, number][] = [];
  for (const [path, views] of rows) {
    const match = MATCH_PATH.exec(path);
    if (match) {
      const id = match[1].toLowerCase();
      counts[id] = (counts[id] ?? 0) + views;
      continue;
    }
    const share = SHARE_PATH.exec(path);
    if (share) {
      const token = readShareToken(share[1]);
      if (token) byToken.push([token, views]);
    }
  }

  if (byToken.length) {
    const tokens = await shareTokenMatches(byToken.map(([token]) => token));
    for (const [token, views] of byToken) {
      const id = tokens.get(token);
      if (id) counts[id] = (counts[id] ?? 0) + views;
    }
  }
  return counts;
}

const cachedMatchViews = unstable_cache(
  computeMatchViews,
  ["admin-match-views-30d"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * Views per match over the last 30 days, admins excluded — or null when the
 * query is not configured or did not answer. A match absent from a non-null
 * map had no views.
 */
export async function getMatchViews30d(): Promise<Map<string, number> | null> {
  if (!matchViewsConfigured()) return null;
  try {
    return new Map(Object.entries(await cachedMatchViews()));
  } catch (cause) {
    console.error("[match views] PostHog query failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}
