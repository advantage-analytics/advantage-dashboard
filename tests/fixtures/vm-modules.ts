import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

/**
 * A tiny module loader for rendering real `.tsx` components offline.
 *
 * Playwright's own transform rewrites JSX in any `.tsx` a spec imports into
 * its component-testing element shape (`__pw_type`), which React's server
 * renderer rejects — so a spec cannot simply `import` a component and call
 * `renderToStaticMarkup`. `home-empty-loading.spec.ts` transpiles ONE file
 * with `typescript` and stubs every import; this generalises that to a
 * source tree: `@/` and relative imports are transpiled and loaded the same
 * way (cached per loader), `stubs` win over the file system, and anything
 * else — `react`, `lucide-react`, a package — comes from the real
 * `require`, or from a marker component when `markUnknown` is set.
 *
 * Nothing here is a bundler: no CSS, no `next/*` runtime (stub those), no
 * `"use client"` semantics (the directive is a harmless string).
 */
export type Stubs = Record<string, unknown>;

export function marker(name: string) {
  return function TestMarker() {
    return React.createElement("span", { "data-component": name });
  };
}

export function createLoader(
  options: {
    stubs?: Stubs;
    /** Return a marker component for any import that is not a file or a stub. */
    markUnknown?: boolean;
  } = {},
) {
  const cache = new Map<string, Record<string, unknown>>();
  const stubs = options.stubs ?? {};
  const root = process.cwd();

  function resolveFile(id: string, from: string): string | null {
    const base = id.startsWith("@/")
      ? resolve(root, "src", id.slice(2))
      : id.startsWith(".")
        ? resolve(dirname(from), id)
        : null;
    if (!base) return null;
    for (const candidate of [
      base,
      `${base}.tsx`,
      `${base}.ts`,
      resolve(base, "index.tsx"),
      resolve(base, "index.ts"),
    ])
      if (existsSync(candidate) && !candidate.endsWith("/")) {
        try {
          if (readFileSync(candidate)) return candidate;
        } catch {
          /* a directory */
        }
      }
    return null;
  }

  function load(file: string): Record<string, unknown> {
    const cached = cache.get(file);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: file,
    });
    runInNewContext(outputText, {
      exports,
      module: { exports },
      process,
      console,
      require: (id: string) => requireFrom(id, file),
    });
    return exports;
  }

  function requireFrom(id: string, from: string): unknown {
    if (id in stubs) return stubs[id];
    if (id === "react/jsx-runtime") return jsx;
    if (id === "react") return React;
    const file = resolveFile(id, from);
    if (file) {
      // A stub keyed by the resolved `@/` path wins over the file.
      const alias = `@/${file.slice(resolve(root, "src").length + 1).replace(/\.tsx?$/, "")}`;
      if (alias in stubs) return stubs[alias];
      return load(file);
    }
    if (options.markUnknown)
      return new Proxy({}, { get: (_, name) => marker(String(name)) });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id);
  }

  return {
    /** Load a source file (repo-relative) and return its exports. */
    load: (file: string) => load(resolve(root, file)),
  };
}
