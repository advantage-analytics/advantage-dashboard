import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canDeleteTeamScheduleEvent } from "@/lib/workspace/types";

function deletion(role: string, error: string | null = null) {
  const calls: unknown[] = [];
  const refreshed: string[] = [];
  const exports: Record<string, (id: string) => Promise<unknown>> = {};
  runInNewContext(
    ts.transpileModule(readFileSync("src/lib/schedule/actions.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require(name: string) {
        if (name === "@/lib/workspace/types")
          return { canDeleteTeamScheduleEvent };
        if (name === "next/cache")
          return { revalidatePath: (path: string) => refreshed.push(path) };
        if (name === "@/lib/workspace/active-workspace-server")
          return {
            getWorkspaceContext: async () =>
              role === "anonymous"
                ? null
                : {
                    active: {
                      kind: role === "personal" ? "personal" : "team",
                      role,
                      id: "program",
                      eventsPolicy: "staff",
                    },
                  },
          };
        if (name === "@/lib/supabase/server")
          return {
            createClient: async () => ({
              rpc: async (name: string, args: unknown) => {
                calls.push({ name, args });
                return { error: error ? { message: error } : null };
              },
            }),
          };
        return {};
      },
    },
  );
  return { run: exports.deleteEvent, calls, refreshed };
}

test("only team owners and coaches submit active-program deletion", async () => {
  for (const role of [
    "owner",
    "coach",
    "staff",
    "player",
    "personal",
    "anonymous",
  ]) {
    const action = deletion(role);
    const result = await action.run("event");
    if (["owner", "coach"].includes(role)) {
      expect(result).toEqual({ ok: true });
      expect(action.calls).toEqual([
        {
          name: "delete_schedule_event",
          args: { p_program_id: "program", p_event_id: "event" },
        },
      ]);
      expect(action.refreshed).toEqual([
        "/dashboard/team/schedule",
        "/dashboard/team/schedule/event",
      ]);
    } else {
      expect(result).toHaveProperty("error");
      expect(action.calls).toEqual([]);
      expect(action.refreshed).toEqual([]);
    }
  }
});

test("foreign-event, dependency, and audit failures return without revalidation", async () => {
  for (const message of [
    "That event is unavailable in your active program.",
    "This event has recorded matches or outcomes and cannot be deleted.",
    "Audit unavailable",
  ]) {
    const action = deletion("coach", message);
    expect(await action.run("event")).toEqual({ error: message });
    expect(action.refreshed).toEqual([]);
  }
});
