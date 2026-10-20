import { createClient } from "@/lib/supabase/server";
import type { CreditPackId } from "@/lib/services/credits/packs";

/** One credit lot, as Settings › Plan's history (A3) lists it. */
export interface CreditLot {
  id: string;
  pack: CreditPackId | null;
  source: "purchase" | "grant";
  seconds: number;
  remainingSeconds: number;
  /** ISO instants. */
  boughtAt: string;
  expiresAt: string;
}

/**
 * The signed-in player's credit lots, oldest first — the order they are spent
 * in when expiry ties purchase order. Read as the user: `video_credits` RLS
 * lets the owner read their own rows and nobody else's. A failed read is an
 * empty history, logged; the balance itself is read elsewhere.
 */
export async function getCreditHistory(userId: string): Promise<CreditLot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_credits")
    .select(
      "id, pack, source, seconds, remaining_seconds, created_at, expires_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[credits] could not read credit history", {
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    pack: (row.pack as CreditPackId | null) ?? null,
    source: row.source as "purchase" | "grant",
    seconds: row.seconds as number,
    remainingSeconds: row.remaining_seconds as number,
    boughtAt: row.created_at as string,
    expiresAt: row.expires_at as string,
  }));
}
