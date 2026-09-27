import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Give back one or more storage-purge claims that a deletion took and then
 * failed to use.
 *
 * `purgeMatchStorage` (`./purge-match-storage.ts`) starts by claiming each
 * match in `match_storage_purge_claims`, a service-role RPC; from then on the
 * admin console refuses every admission of it with
 * `match-deletion-in-progress`. The claim cascades away with the row, so a
 * delete that succeeds needs nothing — but one that fails leaves the row, and
 * the claim, standing for ever: it has no expiry and a retry reuses it. Both
 * `DELETE /api/matches/[matchId]` and `deleteAccount()` call this from every
 * failure branch after a purge may have run.
 *
 * Service-role, like the claim itself — callers have no access to the claim
 * table. `matchIds` must already be ones the caller was entitled to purge
 * (never taken from a request body here). Best-effort on purpose: a release
 * that fails is logged under `label` and swallowed, since a claim left behind
 * is recoverable by hand, while surfacing this failure over the caller's own
 * would report the wrong thing.
 */
export async function releaseStoragePurgeClaims(
  adminClient: SupabaseClient,
  matchIds: string[],
  label: string,
): Promise<void> {
  if (matchIds.length === 0) return;
  try {
    const { error } = await adminClient.rpc(
      "admin_release_match_storage_purge",
      { p_match_ids: matchIds },
    );
    if (error) {
      console.error(
        `[${label}] could not release the purge claim(s):`,
        error.message,
      );
    }
  } catch (error) {
    console.error(`[${label}] purge claim release threw:`, error);
  }
}
