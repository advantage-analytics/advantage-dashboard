"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  insertLegalAcceptances,
  readMissingLegalDocuments,
} from "./acceptance-server";
import { LEGAL_VERSIONS, isLegalDocument } from "./versions";

export type AcceptLegalTermsResult = {
  ok: false;
  /**
   * `terms-changed`: a version the screen rendered is not current any more,
   * so the account read words that are no longer the terms.
   */
  reason: "terms-changed" | "failed";
};

/**
 * The terms screen's "Agree and continue".
 *
 * `rendered` is the document → version map the page showed, round-tripped
 * through the form. It never chooses what is written (always `LEGAL_VERSIONS`);
 * it only lets someone who read an older text be told so instead of being
 * recorded as agreeing to words they never saw. Which documents are written is
 * the server's own answer — whatever this account is still missing — never a
 * list the client sends. Success redirects to the dashboard.
 */
export async function acceptLegalTerms(
  rendered: Record<string, string>,
): Promise<AcceptLegalTermsResult> {
  for (const [document, version] of Object.entries(rendered ?? {})) {
    if (!isLegalDocument(document) || LEGAL_VERSIONS[document] !== version) {
      return { ok: false, reason: "terms-changed" };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row, error: roleError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // The role decides whether the Guardian Terms are owed. Guessing on a
  // failed read would record a guardian as agreeing without them.
  if (roleError) return { ok: false, reason: "failed" };

  const missing = await readMissingLegalDocuments(
    supabase,
    user.id,
    (row?.role as string | null | undefined) ?? null,
  );
  // A document the page did not show is one this account has not read.
  if (missing.some((document) => !(document in (rendered ?? {})))) {
    return { ok: false, reason: "terms-changed" };
  }

  const result = await insertLegalAcceptances(supabase, user.id, missing);
  if (!result.ok) return { ok: false, reason: "failed" };

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
