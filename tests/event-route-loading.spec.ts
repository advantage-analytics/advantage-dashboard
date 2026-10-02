import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

// Exercise the real route before rendering forms. Any whole-season read is a
// failure; missing events and access gates must still short-circuit correctly.
for (const leaf of ["edit", "score"]) {
  for (const scenario of [
    "staff",
    "player",
    "personal",
    "signed-out",
  ] as const) {
    test(`${leaf}: event-scoped loading for ${scenario}`, async () => {
      const calls: string[][] = [];
      const output = ts.transpileModule(
        readFileSync(
          resolve(`src/app/dashboard/team/schedule/[eventId]/${leaf}/page.tsx`),
          "utf8",
        ),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
          },
        },
      ).outputText;
      const exports: { default?: (props: unknown) => Promise<unknown> } = {};
      runInNewContext(output, {
        exports,
        require: (id: string) => {
          if (id === "next/navigation")
            return {
              redirect: (path: string) => {
                throw new Error(`redirect:${path}`);
              },
              notFound: () => {
                throw new Error("not-found");
              },
            };
          if (id === "@/lib/workspace/active-workspace-server")
            return {
              getWorkspaceContext: async () =>
                scenario === "signed-out"
                  ? null
                  : {
                      active: {
                        id: "program-a",
                        kind: scenario === "personal" ? "personal" : "team",
                        role: scenario === "staff" ? "coach" : "player",
                        eventsPolicy: "staff",
                      },
                    },
            };
          if (id === "@/lib/workspace/types")
            return {
              isProgramStaff: (workspace: { role: string }) =>
                workspace.role === "coach",
              canManageTeamSchedule: (workspace: { role: string }) =>
                workspace.role === "coach",
            };
          if (id === "@/lib/data/schedule-server")
            return {
              getEventDetail: async (programId: string, eventId: string) => {
                calls.push([programId, eventId]);
                return null;
              },
              getProgramSchedule: () => {
                throw new Error("unexpected-season-read");
              },
            };
          return new Proxy(
            {},
            {
              get: () => () => {
                throw new Error(`unexpected:${id}`);
              },
            },
          );
        },
      });
      const result = exports.default!({
        params: Promise.resolve({ eventId: "event-b" }),
        searchParams: Promise.resolve({}),
      });
      const expected =
        scenario === "staff"
          ? "not-found"
          : scenario === "signed-out"
            ? "redirect:/login"
            : scenario === "personal"
              ? "redirect:/dashboard"
              : "redirect:/dashboard/team/schedule/event-b";
      await expect(result).rejects.toThrow(expected);
      expect(calls).toEqual(
        scenario === "staff" ? [["program-a", "event-b"]] : [],
      );
    });
  }
}
