// /design-sync build step for this repo. Run from the repo root:
//   node .design-sync/build-pkg.mjs
//
// The app is a Next.js project, not a component library: there is no dist/,
// no .d.ts tree and no static stylesheet. This script manufactures the three
// things the design-sync converter needs, all under .design-sync/.cache/pkg/
// (gitignored, regenerated every run):
//   1. styles/app.css  - src/app/globals.css compiled by the repo's own
//                        Tailwind v4 (Claude Design has no JIT, so every
//                        utility the components use must be precompiled)
//   2. index.tsx       - a barrel re-exporting the scoped component files
//                        (the converter's --entry; esbuild bundles from it)
//   3. types/          - .d.ts tree emitted by the repo's tsc for the same
//                        files, plus types/index.d.ts (the converter reads
//                        <Name>Props from here)
// Which files are in scope is the SCOPE list below.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = resolve(here, ".cache/pkg");

// Repo-relative component files that make up the shipped design system.
// ui/ is the primitive layer; the dashboard entries are the reusable pieces
// that carry no page or data coupling.
const SCOPE = [
  // primitives
  "src/components/ui/adv-select.tsx",
  "src/components/ui/adv-switch.tsx",
  "src/components/ui/alert-dialog.tsx",
  "src/components/ui/confirm-dialog.tsx",
  "src/components/ui/date-field.tsx",
  "src/components/ui/dialog-problem.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/ui/empty-mark.tsx",
  "src/components/ui/float-menu.tsx",
  "src/components/ui/initials-avatar.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/kbd.tsx",
  "src/components/ui/label.tsx",
  "src/components/ui/menu-select.tsx",
  "src/components/ui/person-avatar.tsx",
  "src/components/ui/player-mark.tsx",
  "src/components/ui/popover.tsx",
  "src/components/ui/separator.tsx",
  "src/components/ui/state-pill.tsx",
  "src/components/ui/status-chip.tsx",
  "src/components/ui/tooltip.tsx",
  "src/components/ui/you-pill.tsx",
  // reusable dashboard pieces
  "src/components/dashboard/result-mark.tsx",
  "src/components/dashboard/score-line.tsx",
  "src/components/dashboard/workspace-mark.tsx",
  "src/components/dashboard/shared/insight-stat-chip.tsx",
  "src/components/dashboard/shared/chrome-tooltip.tsx",
  "src/components/dashboard/shared/card-empty.tsx",
  "src/components/dashboard/shared/card-footer.tsx",
  "src/components/dashboard/shared/vertical-steps.tsx",
  "src/components/dashboard/loading/pending.tsx",
  "src/components/dashboard/matches/widget-card.tsx",
  "src/components/dashboard/settings/settings-button.tsx",
  "src/components/dashboard/settings/settings-card.tsx",
];

rmSync(pkg, { recursive: true, force: true });
mkdirSync(join(pkg, "styles"), { recursive: true });

// 1. stylesheet ----------------------------------------------------------
const cssIn = resolve(root, "src/app/globals.css");
const cssOut = join(pkg, "styles/app.css");
const compiled = await postcss([tailwindcss({ base: root })]).process(
  readFileSync(cssIn, "utf8"),
  {
    from: cssIn,
    to: cssOut,
    map: false,
  },
);
// next/font defines --font-inter / --font-roboto-mono at runtime on <html>;
// outside Next nothing does and `font-family: var(--font-inter)` would fall
// back to the browser default. Bind the families by name; the @font-face
// rules ship via cfg.extraFonts (.design-sync/fonts.css).
// `.font-clash` is a marketing-page helper that names "Clash Display", a
// family the design system bans (Inter only) and no shipped component uses.
// Left in, the validator flags a font the bundle can never provide.
const appCss = compiled.css.replace(/\.font-clash\s*\{[^}]*\}\s*/g, "");
writeFileSync(
  cssOut,
  `/* design-sync: next/font variables bound by family name */\n` +
    `:root{--font-inter:"Inter";--font-roboto-mono:"Roboto Mono"}\n` +
    appCss,
);
console.error(
  `build-pkg: styles/app.css ${(compiled.css.length / 1024).toFixed(0)} KiB`,
);

// 2. barrel + package.json -------------------------------------------------
const noExt = (p) => p.replace(/\.tsx?$/, "");
const relFromPkg = (p) => relative(pkg, resolve(root, p)).split(sep).join("/");
writeFileSync(
  join(pkg, "index.tsx"),
  SCOPE.map((p) => `export * from "${noExt(relFromPkg(p))}";`).join("\n") +
    "\n",
);
const appVersion =
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version ??
  "0.0.0";
writeFileSync(
  join(pkg, "package.json"),
  JSON.stringify(
    {
      name: "advantage-analytics-ds",
      version: appVersion,
      private: true,
      module: "index.tsx",
      types: "types/index.d.ts",
    },
    null,
    2,
  ) + "\n",
);

// 3. declarations ---------------------------------------------------------
const tsconfig = {
  extends: resolve(root, "tsconfig.json"),
  compilerOptions: {
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    incremental: false,
    composite: false,
    plugins: [],
    rootDir: resolve(root, "src"),
    outDir: join(pkg, "types"),
    skipLibCheck: true,
  },
  include: SCOPE.map((p) => resolve(root, p)),
  exclude: [],
};
writeFileSync(
  join(pkg, "tsconfig.types.json"),
  JSON.stringify(tsconfig, null, 2),
);
try {
  execFileSync(
    resolve(root, "node_modules/.bin/tsc"),
    ["-p", join(pkg, "tsconfig.types.json")],
    { stdio: "inherit" },
  );
} catch {
  console.error(
    "build-pkg: tsc reported errors (see above) — declarations that did emit are kept",
  );
}
// tsc creates outDir only once it emits something; guarantee it so the barrel
// write and the walk below fail on a real problem, not on a missing folder.
mkdirSync(join(pkg, "types"), { recursive: true });
// types/index.d.ts mirrors the barrel, rooted at types/ (= src/). Every SCOPE
// entry is a literal "src/…" string, so stripping the prefix is a plain
// string op — no need to route it through path.relative.
writeFileSync(
  join(pkg, "types/index.d.ts"),
  SCOPE.map((p) => `export * from "./${noExt(p.replace(/^src\//, ""))}";`).join(
    "\n",
  ) + "\n",
);
// The emitted .d.ts keep `@/…` specifiers verbatim; the converter's ts-morph
// project has no path mapping, so rewrite them to relative paths. Node 22's
// readdirSync recursive mode lists every path under types/ in one call, and
// filtering on ".d.ts" already excludes directories, so no separate
// isDirectory check is needed.
let rewritten = 0;
const typesDir = join(pkg, "types");
for (const rel of readdirSync(typesDir, { recursive: true })) {
  if (!rel.endsWith(".d.ts")) continue;
  const p = join(typesDir, rel);
  const src = readFileSync(p, "utf8");
  const out = src.replace(/(["'])@\/([^"']+)\1/g, (_, q, rest) => {
    let r = relative(dirname(p), join(pkg, "types", rest))
      .split(sep)
      .join("/");
    if (!r.startsWith(".")) r = "./" + r;
    rewritten++;
    return `${q}${r}${q}`;
  });
  if (out !== src) writeFileSync(p, out);
}
console.error(
  `build-pkg: types/ emitted, ${rewritten} "@/" specifiers rewritten`,
);
// 4. path map for the converter's esbuild pass ---------------------------
// The converter resolves `paths` from the tsconfig named in config.json (no
// `extends` support), so give it a flat one: the app's `@/*` alias plus a
// stand-in for `next/link` — see .design-sync/shims/next-link.tsx for why.
writeFileSync(
  join(pkg, "tsconfig.paths.json"),
  JSON.stringify(
    {
      compilerOptions: {
        baseUrl: root,
        paths: {
          "@/*": ["src/*"],
          "next/link": [".design-sync/shims/next-link.tsx"],
        },
      },
    },
    null,
    2,
  ) + "\n",
);

// 5. card groups -----------------------------------------------------------
// The converter groups a card by its source directory, and everything under
// src/components/ui/ collapses to "general" (ui/ is a generic dir name). A
// doc stub whose only content is a `category` front-matter line regroups a
// card without replacing its synthesized prompt. Dashboard pieces keep their
// directory names (shared, settings, loading, matches, dashboard) — the
// converter only regroups cards that have no directory group.
const GROUPS = {
  Menus: [
    "FloatMenu",
    "FloatMenuItem",
    "FloatMenuNote",
    "FloatMenuDivider",
    "FloatMenuLabel",
    "FloatMenuCaption",
    "ChosenCheck",
    "MenuSelect",
  ],
  Dialogs: [
    "Dialog",
    "DialogTrigger",
    "DialogContent",
    "DialogHeader",
    "DialogFooter",
    "DialogTitle",
    "DialogDescription",
    "DialogClose",
    "DialogProblem",
    "AlertDialog",
    "AlertDialogTrigger",
    "AlertDialogContent",
    "AlertDialogHeader",
    "AlertDialogFooter",
    "AlertDialogTitle",
    "AlertDialogDescription",
    "AlertDialogAction",
    "AlertDialogCancel",
    "ConfirmDialog",
    "ConfirmProse",
    "ConfirmAside",
    "ConfirmNote",
    "Em",
  ],
  Overlays: [
    "Popover",
    "PopoverTrigger",
    "PopoverContent",
    "Tooltip",
    "TooltipTrigger",
    "TooltipContent",
    "TooltipProvider",
  ],
  Fields: ["Input", "Label", "AdvSelect", "AdvSwitch", "DateField"],
  "Avatars & Pills": [
    "InitialsAvatar",
    "PersonAvatar",
    "PlayerMark",
    "StatePill",
    "StatusChip",
    "YouPill",
    "EmptyMark",
    "Kbd",
  ],
  Layout: ["Separator"],
};
mkdirSync(join(pkg, "docs"), { recursive: true });
let stubs = 0;
for (const [group, names] of Object.entries(GROUPS)) {
  for (const n of names) {
    writeFileSync(
      join(pkg, "docs", `${n}.md`),
      `---\ncategory: ${group}\n---\n`,
    );
    stubs++;
  }
}
console.error(`build-pkg: ${stubs} group stubs → docs/`);
console.error(`build-pkg: done → ${relative(root, pkg)}`);
