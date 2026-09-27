import { test, expect } from "@playwright/test";
import type { AdminReconcileResult } from "@/lib/services/programs/admin-reconciliation";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Uploads — `reconcileAdminSubmissionAction`'s revalidate-only-on-
 * success rule (T30). `history-actions.ts` loaded offline through
 * `fixtures/vm-modules`, with `next/cache` and the reconciliation service
 * stubbed by a recording `revalidatePath` and a scripted
 * `reconcileAdminSubmission`; `resumeAdminResults`/`abandonAdminResults` are
 * untested no-op fakes since only the reconcile action changed here.
 */

function load(scriptedResult: AdminReconcileResult) {
  const revalidateCalls: string[] = [];
  const serviceCalls: {
    operationId: unknown;
    itemId: unknown;
    mode: unknown;
  }[] = [];
  const loader = createLoader({
    stubs: {
      "next/cache": {
        revalidatePath: (path: string) => {
          revalidateCalls.push(path);
        },
      },
      "@/lib/services/programs/admin-reconciliation": {
        reconcileAdminSubmission: async (input: {
          operationId: unknown;
          itemId: unknown;
          mode: unknown;
        }) => {
          serviceCalls.push(input);
          return scriptedResult;
        },
        resumeAdminResults: async () => ({ ok: true }),
        abandonAdminResults: async () => ({ ok: true }),
      },
    },
  });
  const actions = loader.load("src/app/admin/uploads/history-actions.ts") as {
    reconcileAdminSubmissionAction: (
      formData: FormData,
    ) => Promise<AdminReconcileResult>;
  };
  return { ...actions, revalidateCalls, serviceCalls };
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test("an ok result revalidates the uploads page exactly once and is returned unchanged", async () => {
  const result: AdminReconcileResult = {
    ok: true,
    mode: "abandon",
    kind: "video",
    matchId: "match-1",
    matchDeleted: true,
  };
  const { reconcileAdminSubmissionAction, revalidateCalls } = load(result);
  const returned = await reconcileAdminSubmissionAction(
    formData({ operationId: "op-1", itemId: "item-1", mode: "abandon" }),
  );
  expect(returned).toBe(result);
  expect(revalidateCalls).toEqual(["/admin/uploads"]);
});

test("a refused result never revalidates and is returned unchanged", async () => {
  const result: AdminReconcileResult = {
    ok: false,
    message: "This submission no longer exists.",
  };
  const { reconcileAdminSubmissionAction, revalidateCalls } = load(result);
  const returned = await reconcileAdminSubmissionAction(
    formData({ operationId: "op-1", itemId: "item-1", mode: "abandon" }),
  );
  expect(returned).toBe(result);
  expect(revalidateCalls).toEqual([]);
});

test("the form fields reach the service as the strings the spec set", async () => {
  const result: AdminReconcileResult = {
    ok: true,
    mode: "complete",
    kind: "file",
    matchId: null,
    matchDeleted: false,
  };
  const { reconcileAdminSubmissionAction, serviceCalls } = load(result);
  await reconcileAdminSubmissionAction(
    formData({ operationId: "op-42", itemId: "item-99", mode: "complete" }),
  );
  expect(serviceCalls).toEqual([
    { operationId: "op-42", itemId: "item-99", mode: "complete" },
  ]);
});
