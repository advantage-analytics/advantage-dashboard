import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync("src/lib/schedule/writes-server.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

/** Execute the actual extracted service using the action test's same I/O seams. */
export function loadScheduleWriter(
  resolveModule: (name: string) => unknown,
  globals: Record<string, unknown> = {},
): typeof import("@/lib/schedule/writes-server") {
  const exports = {};
  runInNewContext(code, { exports, require: resolveModule, ...globals });
  return exports as typeof import("@/lib/schedule/writes-server");
}
