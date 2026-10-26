import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGAL_VERSIONS,
  missingLegalDocuments,
  requiredLegalDocuments,
  type LegalDocument,
} from "./versions";

/**
 * Which legal documents the signed-in account has not agreed to at their
 * current version.
 *
 * Read through the SESSION client: `legal_acceptances` lets an account read
 * its own rows and nothing else (`20261026061004_legal_acceptances.sql`).
 *
 * A failed read answers "nothing missing", the opposite of the pilot terms'
 * fail-closed read, and on purpose. That check guards one action (creating a
 * team); this one guards the whole dashboard, and a lookup that errors —
 * including the window between a deploy and its migration — must not lock
 * every account out of its matches. The miss is logged, and the screen asks
 * on the next visit that reads cleanly.
 */
export async function readMissingLegalDocuments(
  supabase: SupabaseClient,
  userId: string,
  role: string | null,
): Promise<LegalDocument[]> {
  const required = requiredLegalDocuments(role);
  const { data, error } = await supabase
    .from("legal_acceptances")
    .select("document, version")
    .eq("user_id", userId)
    .in(
      "version",
      required.map((document) => LEGAL_VERSIONS[document]),
    );

  if (error) {
    console.error("[legal] could not read acceptances", {
      message: error.message,
    });
    return [];
  }
  return missingLegalDocuments(required, data ?? []);
}

/**
 * Record a current-version acceptance of each of `documents` for the
 * signed-in account. The insert policy refuses any other version, so the
 * literal written here and `current_legal_version()` must agree — which is
 * the point of keeping them in step.
 */
export async function insertLegalAcceptances(
  supabase: SupabaseClient,
  userId: string,
  documents: readonly LegalDocument[],
): Promise<{ ok: boolean }> {
  if (documents.length === 0) return { ok: true };
  const { error } = await supabase.from("legal_acceptances").insert(
    documents.map((document) => ({
      user_id: userId,
      document,
      version: LEGAL_VERSIONS[document],
    })),
  );
  if (error) {
    console.error("[legal] could not record acceptance", {
      message: error.message,
    });
    return { ok: false };
  }
  return { ok: true };
}
