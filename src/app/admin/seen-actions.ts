"use server";

import { markItemSeen, type AdminSurface } from "@/lib/admin/seen-server";
import { requireAdmin } from "@/lib/services/programs/admin-guard";

const SURFACES: readonly AdminSurface[] = [
  "today",
  "matches",
  "requests",
  "labels",
  "pilots",
  "teams",
  "ask",
];

/**
 * A row was opened: clear its "New" dot for this admin. Fire-and-forget from
 * the page — a dot that survives a failed write is harmless, so nothing here
 * throws back at the caller.
 */
export async function markAdminRowSeen(
  surface: AdminSurface,
  key: string,
): Promise<void> {
  const admin = await requireAdmin();
  if (!admin || !SURFACES.includes(surface) || typeof key !== "string") return;
  await markItemSeen(admin.id, surface, key);
}
