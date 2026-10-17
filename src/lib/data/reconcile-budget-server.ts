import { after } from "next/server";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";

/**
 * `reconcileBeforePageRead`, but the render waits at most `budgetMs` for it.
 *
 * A poll is one GET per stuck job with a 10 s timeout each, against a vendor
 * whose latency is not ours — enough to hold a whole page's first byte. Within
 * the budget the page renders what the poll learned, exactly as before; past
 * it the page renders the stored status (the same "slightly stale" answer a
 * failed poll gives) and the poll finishes under `after()`, so its status
 * write still lands for the next read instead of being cut off with the
 * invocation. Never rejects, like what it wraps.
 */
export async function reconcileWithinBudget(
  matchIds: string[],
  pageTag: string,
  budgetMs: number,
): Promise<void> {
  const settled = reconcileBeforePageRead(matchIds, pageTag);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  const winner = await Promise.race([
    settled.then(() => "done" as const),
    outOfTime,
  ]);
  clearTimeout(timer);
  if (winner === "done") return;

  console.info(
    `[${pageTag}] reconciliation over ${budgetMs} ms budget; finishing after the response`,
  );
  try {
    after(() => settled);
  } catch (err) {
    // Outside a request scope there is no response to finish after.
    console.warn(`[${pageTag}] could not defer reconciliation`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
