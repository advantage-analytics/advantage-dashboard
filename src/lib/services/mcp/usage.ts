import type { AskRpcClient } from "@/lib/services/ask/database";

/**
 * The hard daily cap's counter (`rate-limit.ts`): `ask_mcp_count_call()`
 * adds one to the caller's row for today in `ask_mcp_usage` and answers the
 * new count. It runs as the signed-in user — `auth.uid()` names the row —
 * on the bearer client, never the service role; a call with no session is
 * refused by the function itself.
 *
 * Fails closed: a counter that cannot be read or answers something other
 * than a number is logged and answers null, and the caller refuses the
 * call (`server.ts`, as `rate_limited` with a short retry). The cap is the
 * only bound on what a connector can spend in a day, so a database hiccup
 * must not lift it. The count is per UTC day, which is also when the cap
 * resets.
 */
export async function countMcpCall(user: AskRpcClient): Promise<number | null> {
  try {
    const { data, error } = await user.rpc("ask_mcp_count_call");
    if (error) {
      console.warn("[mcp] could not count the call", {
        sqlstate: error.code,
        error: error.message,
      });
      return null;
    }
    if (typeof data !== "number") {
      console.warn("[mcp] the call counter answered no number", {
        type: typeof data,
      });
      return null;
    }
    return data;
  } catch (error) {
    console.warn("[mcp] could not count the call", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
