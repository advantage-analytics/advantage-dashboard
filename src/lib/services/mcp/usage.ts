import type { AskRpcClient } from "@/lib/services/ask/database";

/**
 * The hard daily cap's counter (`rate-limit.ts`): `ask_mcp_count_call()`
 * adds one to the caller's row for today in `ask_mcp_usage` and answers the
 * new count. It runs as the signed-in user — `auth.uid()` names the row —
 * on the bearer client, never the service role; a call with no session is
 * refused by the function itself.
 *
 * A counter that cannot be read is logged and answers 0: the in-memory
 * window still applies, and a database hiccup must not turn every tool
 * call into a refusal. The count is per UTC day, which is also when the
 * cap resets.
 */
export async function countMcpCall(user: AskRpcClient): Promise<number> {
  try {
    const { data, error } = await user.rpc("ask_mcp_count_call");
    if (error) {
      console.warn("[mcp] could not count the call", {
        sqlstate: error.code,
        error: error.message,
      });
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (error) {
    console.warn("[mcp] could not count the call", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
