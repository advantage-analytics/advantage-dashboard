import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * No `"use client"` file may reach a server-only module through its value
 * imports. A client import of `lib/user/roles.ts` once pulled the service-role
 * client into the Plan page's browser bundle; nothing failed, the build was
 * green, and the only symptom was server code shipping to every visitor.
 *
 * This is the enforcement the `server-only` package would otherwise give. That
 * package is not a dependency, and `scripts/*.ts` load `supabase/admin.ts`
 * outside Next, where it would throw — so the boundary is checked here instead.
 *
 * The walk follows `@/` and relative imports from each client file. It skips
 * `import type` (erased at compile time) and stops at `"use server"` files,
 * which a client receives as action references, not as code.
 */

const SRC = resolve("src");

/** Modules a client bundle must never contain. */
const SERVER_ONLY = [
  "lib/supabase/admin.ts",
  "lib/supabase/server.ts",
  "lib/user/roles.ts",
  // Imports `@azure/storage-blob`, which signs with the storage account key and
  // is a `serverExternalPackages` entry precisely so it never bundles. The
  // wizard runs the SAME media inspection locally, from
  // `lib/match-video/media-inspection.ts`, so the tempting import is one
  // directory away.
  "lib/services/match-video/probe.ts",
].map((p) => join(SRC, p));

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The file's `"use client"` / `"use server"` directive, if it has one. */
function directive(source: string): "client" | "server" | undefined {
  const match = source.match(
    /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use (client|server)["']/,
  );
  return match?.[1] as "client" | "server" | undefined;
}

/** Value-import specifiers. Comments are stripped first: prose mentioning "import" fooled an earlier regex. */
function valueImports(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const pattern =
    /(?:import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  const specs: string[] = [];
  for (const m of code.matchAll(pattern)) {
    if (m[1]) continue;
    specs.push(m[2] ?? m[3]);
  }
  return specs;
}

/**
 * One read per module for the whole run. Every client file starts its own walk,
 * and the shared ones (ui primitives, lib/utils) sit under hundreds of them.
 */
const moduleCache = new Map<
  string,
  { directive: "client" | "server" | undefined; targets: string[] }
>();

function moduleInfo(file: string) {
  let info = moduleCache.get(file);
  if (!info) {
    const source = readFileSync(file, "utf8");
    info = {
      directive: directive(source),
      targets: valueImports(source)
        .map((spec) => resolveImport(file, spec))
        .filter((target): target is string => target !== null),
    };
    moduleCache.set(file, info);
  }
  return info;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|mjs|js)$/.test(entry.name)) yield path;
  }
}

test("no client file reaches a server-only module", () => {
  const leaks: string[] = [];
  let clients = 0;

  for (const entry of sourceFiles(SRC)) {
    if (moduleInfo(entry).directive !== "client") continue;
    clients++;

    const parent = new Map<string, string | null>([[entry, null]]);
    const queue = [entry];
    while (queue.length) {
      const file = queue.shift()!;
      const { directive: kind, targets } = moduleInfo(file);
      if (file !== entry && kind === "server") continue;
      for (const target of targets) {
        if (parent.has(target)) continue;
        parent.set(target, file);
        queue.push(target);
      }
    }

    for (const serverOnly of SERVER_ONLY) {
      if (!parent.has(serverOnly)) continue;
      const chain: string[] = [];
      for (let f: string | null = serverOnly; f; f = parent.get(f) ?? null) {
        chain.unshift(relative(process.cwd(), f));
      }
      leaks.push(chain.join(" -> "));
    }
  }

  // Guards against the walk silently finding nothing (a moved src/, a broken directive regex).
  expect(clients).toBeGreaterThan(50);
  expect(
    leaks,
    "client bundle reaches server-only code — move the pure helpers a client needs into a module with no server imports",
  ).toEqual([]);
});
