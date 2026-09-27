"use server";

import { revalidatePath } from "next/cache";
import {
  reconcileAdminSubmission,
  type AdminReconcileResult,
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
