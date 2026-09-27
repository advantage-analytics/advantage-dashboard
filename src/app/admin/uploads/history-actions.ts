"use server";

import { revalidatePath } from "next/cache";
import {
  abandonAdminResults,
  reconcileAdminSubmission,
  resumeAdminResults,
  type AdminAbandonResultsResult,
  type AdminReconcileResult,
  type AdminResumeResult,
} from "@/lib/services/programs/admin-reconciliation";

/**
 * The upload history's reconciliation form. The service re-checks the
 * session and supplies the actor; the form carries only the item and mode.
 */
export async function reconcileAdminSubmissionAction(
  formData: FormData,
): Promise<AdminReconcileResult> {
  const result = await reconcileAdminSubmission({
    operationId: formData.get("operationId"),
    itemId: formData.get("itemId"),
    mode: formData.get("mode"),
  });
  revalidatePath("/admin/uploads");
  return result;
}

/**
 * Resume a dual or tournament submission from its durable batch request. The
 * form carries only the operation id; the request is read server-side.
 */
export async function resumeAdminResultsAction(
  formData: FormData,
): Promise<AdminResumeResult> {
  const result = await resumeAdminResults(formData.get("operationId"));
  revalidatePath("/admin/uploads");
  return result;
}

/** Abandon a dual or tournament submission's pending items as the session actor. */
export async function abandonAdminResultsAction(
  formData: FormData,
): Promise<AdminAbandonResultsResult> {
  const result = await abandonAdminResults(formData.get("operationId"));
  revalidatePath("/admin/uploads");
  return result;
}
