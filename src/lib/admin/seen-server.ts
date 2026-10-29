import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "New since you last looked" for the admin console — per admin, per surface,
 * stored in `public.admin_seen` (migration `20261028213209_admin_seen`).
 *
 * Why the database and not the browser: the console is used from more than
 * one machine, the nav counts are computed on the server, and the repo keeps
 * every other "has this person seen X" fact server-side too.
 *
 * A surface keeps one watermark row (`item_key = '*'`) with two stamps:
 *
 *   * `seen_at` — the admin's latest look at the page. The NAV TAB counts rows
 *     newer than this: what arrived since you last opened the page.
 *   * `prev_seen_at` — the look before. The PAGE marks rows newer than this as
 *     New, so a reload in the same sitting keeps its dots.
 *
 * A look more than `SITTING_MS` after the last one starts a new sitting and
 * moves `seen_at` into `prev_seen_at`. Every other row is one item the admin
 * opened, which clears that row's dot at once whatever the stamps say.
 *
 * Reads and writes run on the service-role client: the table has no client
 * grants, and every caller sits behind `requireAdminOrNotFound()` /
 * `requireAdmin()` already.
 */

export type AdminSurface =
  "today" | "matches" | "requests" | "labels" | "pilots" | "teams" | "ask";

const WATERMARK = "*";

/** Looks this close together are one sitting. */
const SITTING_MS = 30 * 60 * 1000;

/** An admin's very first look treats the last week as new. */
const FIRST_LOOK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface SeenState {
  /** Rows created after this are New on the page. ISO. */
  since: string;
  /** Item keys this admin has opened on this surface. */
  opened: ReadonlySet<string>;
}

/** Is this row New: created after the sitting began, and not opened since. */
export function isFresh(
  seen: SeenState,
  key: string,
  createdAt: string | null | undefined,
): boolean {
  if (!createdAt) return false;
  if (seen.opened.has(key)) return false;
  return Date.parse(createdAt) > Date.parse(seen.since);
}

/**
 * Reads the surface's state for the page about to render, and records this
 * look. Call once per page render.
 */
export async function lookAtSurface(
  adminId: string,
  surface: AdminSurface,
  now: Date = new Date(),
): Promise<SeenState> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("admin_seen")
    .select("item_key, seen_at, prev_seen_at")
    .eq("admin_id", adminId)
    .eq("surface", surface);

  if (error) {
    // Never fail a page over a dot: no state means nothing reads as New.
    console.error("[admin seen] read failed", {
      surface,
      error: error.message,
    });
    return { since: now.toISOString(), opened: new Set() };
  }

  const rows = (data ?? []) as {
    item_key: string;
    seen_at: string;
    prev_seen_at: string | null;
  }[];
  const watermark = rows.find((row) => row.item_key === WATERMARK);
  const opened = new Set(
    rows.filter((row) => row.item_key !== WATERMARK).map((row) => row.item_key),
  );

  let since: string;
  let prev: string;
  if (!watermark) {
    since = new Date(now.getTime() - FIRST_LOOK_WINDOW_MS).toISOString();
    prev = since;
  } else if (now.getTime() - Date.parse(watermark.seen_at) > SITTING_MS) {
    since = watermark.seen_at;
    prev = watermark.seen_at;
  } else {
    since = watermark.prev_seen_at ?? watermark.seen_at;
    prev = since;
  }

  const { error: writeError } = await db.from("admin_seen").upsert(
    {
      admin_id: adminId,
      surface,
      item_key: WATERMARK,
      seen_at: now.toISOString(),
      prev_seen_at: prev,
    },
    { onConflict: "admin_id,surface,item_key" },
  );
  if (writeError) {
    console.error("[admin seen] watermark write failed", {
      surface,
      error: writeError.message,
    });
  }

  return { since, opened };
}

/**
 * What the nav counts against: per surface, the admin's latest look and the
 * items opened. Read-only — the header never moves a watermark.
 */
export async function loadNavSeen(
  adminId: string,
  now: Date = new Date(),
): Promise<Record<AdminSurface, SeenState>> {
  const fallback = new Date(now.getTime() - FIRST_LOOK_WINDOW_MS).toISOString();
  const surfaces: AdminSurface[] = [
    "today",
    "matches",
    "requests",
    "labels",
    "pilots",
    "teams",
    "ask",
  ];
  const result = Object.fromEntries(
    surfaces.map((surface) => [
      surface,
      { since: fallback, opened: new Set<string>() },
    ]),
  ) as Record<AdminSurface, { since: string; opened: Set<string> }>;

  const { data, error } = await createAdminClient()
    .from("admin_seen")
    .select("surface, item_key, seen_at")
    .eq("admin_id", adminId);
  if (error) {
    console.error("[admin seen] nav read failed", { error: error.message });
    return result;
  }

  for (const row of (data ?? []) as {
    surface: AdminSurface;
    item_key: string;
    seen_at: string;
  }[]) {
    const entry = result[row.surface];
    if (!entry) continue;
    if (row.item_key === WATERMARK) entry.since = row.seen_at;
    else entry.opened.add(row.item_key);
  }
  return result;
}

/** Records that the admin opened one row. */
export async function markItemSeen(
  adminId: string,
  surface: AdminSurface,
  key: string,
): Promise<void> {
  if (!key || key === WATERMARK || key.length > 200) return;
  const { error } = await createAdminClient().from("admin_seen").upsert(
    {
      admin_id: adminId,
      surface,
      item_key: key,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "admin_id,surface,item_key" },
  );
  if (error) {
    console.error("[admin seen] item write failed", {
      surface,
      error: error.message,
    });
  }
}
