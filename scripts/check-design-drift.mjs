#!/usr/bin/env node
// Makes the design system machine-checkable.
//
// SKILL.md is 2,384 lines of prose, so drift returns silently: a near-twin
// grey, a font size in a gap the scale never defined, a chart hue inlined
// instead of imported, a retired colour that three files still ship.
//
// ── Why a burn-down and not `=== 0` ─────────────────────────────────────────
// The tree is not clean today. A checker demanding zero would be red on day
// one, and a permanently-red gate trains everyone to ignore it — the same
// reasoning eslint.config.mjs records for the React Compiler rules. So each
// check carries a seed, and BOTH directions fail:
//
//   count > seed  →  regression. New drift landed.
//   count < seed  →  stale seed. Work cleared drift; ratchet the number down.
//
// The second half is what keeps a burn-down honest: a seed that is merely an
// upper bound rots upward as people fix things without lowering it.
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

// T12 closed the blind spot documented above (git-blame this comment for the
// original wording): the walk now covers .css too, so a utility class reached
// via `@apply` — `@apply border-border` in globals.css's own base layer was
// the exact case that motivated this — is counted exactly like one written in
// a component. `stripNonUtilities` does not care which file it is blanking;
// an `@apply` line is just text containing a utility class name, and every
// check below already runs on whatever `walk()` hands it.
const SRC = "src";

// ── The authority ───────────────────────────────────────────────────────────
// ONE file, not three. colors.css is where a colour decision is made; the two
// TypeScript modules below are transcriptions of it, for libraries that need
// runtime values (Recharts, inline SVG). Treating a transcription as an
// authority is how retired colour survives: player-colors.ts still exports the
// violet that colors.css retired in review decision C, so a checker trusting
// it would launder that violet as "in palette" — which is exactly the drift
// this file exists to catch. Check 5 audits the transcriptions instead.
const AUTHORITY = "src/styles/design-system/colors.css";
const TRANSCRIPTIONS = [
  "src/lib/design/data-viz.ts",
  "src/lib/design/player-colors.ts",
];

// ── Token DEFINITION files, as opposed to consumers ─────────────────────────
// Now that the walk covers .css, checks 1 (off-palette hex) and 3 (inlined
// viz hue) need to tell a file that DECLARES a colour from one that USES it —
// otherwise widening the walk turns every `--ink-900: #0D0D0D;` in the design
// system's own token layer into a "finding" against itself, which is not
// drift, it is the source of truth. colors.css is already exempt as
// AUTHORITY; the rest of src/styles/design-system/ and globals.css declare
// the same kind of thing (custom properties, semantic type-scale classes) and
// get the same treatment. This does NOT exempt them from check 4 (shadcn) or
// the default-palette check below — a `@apply border-border` or a stray
// `bg-blue-600` in globals.css is real drift regardless of which half of the
// file it lands in, which is the whole point of this task.
const CSS_TOKEN_DEFINITIONS = [
  "src/app/globals.css",
  "src/styles/design-system/effects.css",
  "src/styles/design-system/focus.css",
  "src/styles/design-system/index.css",
  "src/styles/design-system/spacing.css",
  "src/styles/design-system/typography.css",
];

// ── Unreachable code ────────────────────────────────────────────────────────
// Everything here sits behind a `ComingSoonPage` and has zero importers
// outside itself — verified, not assumed. It is kept as the seed for the real
// page, so it is not deleted; but sweeping it would spend a third of the
// effort on code nobody can reach AND leave dead code looking maintained.
// Re-verify before removing an entry: the day Statistics ships, these become
// live and must be swept.
const UNREACHABLE = [
  "src/components/dashboard/statistics/", // 19 files, behind /dashboard/statistics
  "src/lib/data/statistics-server.ts", // referenced only by the above
  "src/lib/data/statistics-client.ts",
  // Superseded by match-detail/shots/shots-tab.tsx, which is what [matchId]
  // actually code-splits to. Nothing imports this file — the only surviving
  // reference is a prose mention in splitstep/derivation/court.ts:90. Both
  // SKILL.md and AGENTS.md still describe it as live, which is how it kept
  // looking maintained.
  "src/components/dashboard/matches/visuals/court-visualization.tsx",
];

// ── Allowlist: third-party brand colour, which we do not get to choose ──────
const ALLOWED_HEX = {
  // Google's sign-in mark and its mandated button chrome. Google's brand
  // guidelines specify these exact values; restyling them breaks the terms.
  "src/components/auth/login-form.tsx": [
    "#4285F4",
    "#34A853",
    "#FBBC05",
    "#EA4335",
    "#3C4043",
    "#E8E8E8",
  ],
  // Third-party provider brand pills — each is that vendor's own colour.
  "src/lib/providers.ts": ["#2D8B4E", "#002B5C", "#5DADE2"],
};

// Mail clients do not support CSS custom properties, so shell.ts must carry
// literal hex — and AGENTS.md requires it to stay a hand-copy of the Supabase
// templates it mirrors. Tokenizing it would break that pairing to no benefit.
const HEX_EXEMPT = new Set(["src/lib/services/email/shell.ts"]);

// ── The type scale, from SKILL.md §"Type Scale" ─────────────────────────────
const TYPE_SCALE = new Set([8, 9, 10, 11, 12, 13, 14, 16, 28, 30, 40, 56]);

// ── shadcn's oklch token layer ──────────────────────────────────────────────
// Checks 1–3 are structurally blind to these: they resolve through CSS
// variables in oklch, so no hex ever appears. Without this check, tooltip.tsx
// painting `bg-primary` (black) where SKILL.md specifies `--ink-900` is
// invisible forever.
//
// The set is DERIVED, because globals.css already encodes the distinction:
// shadcn's @theme entries indirect to a bare variable (`--color-card:
// var(--card)`), while every DS entry carries a literal (`--color-border-card:
// #f3f3f3`). A hardcoded list would have flagged `border-card`, which is ours.
const GLOBALS = "src/app/globals.css";
const THEME_ENTRY_RE = /--color-([a-z0-9-]+):\s*([^;]+);/g;
// Only prefixes resolving from Tailwind's `--color-*` namespace. `shadow-` is
// deliberately absent: it resolves from `--shadow-*`, so `shadow-card` is the
// DS's own token (globals.css:63), not shadcn's `--color-card`.
const TW_PREFIXES =
  "bg|text|border|ring|fill|stroke|divide|outline|placeholder|caret|decoration";

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;
const TEXT_PX_RE = /\btext-\[(\d+)px\]/g;
const COLOR_PROP_RE =
  /\b(?:fill|stroke|stopColor|color|itemStyle|backgroundColor|borderColor)\s*[=:]\s*\{?["']?(#[0-9a-fA-F]{6})\b/g;

// ── Check 6 — Tailwind's default palette, which colors.css does not own ────
// Nothing caught `bg-blue-600` or `text-gray-500` before this: check 1 only
// sees literal hex, and check 4 only sees shadcn's oklch names. A default-
// palette class is neither — it is a real Tailwind utility that resolves to
// Tailwind's OWN colour, not a DS token, so `bg-blue-600` sits a shade off
// SKILL.md's Signal Blue and nothing before this check could tell.  Same
// prefix list as check 4 (the Tailwind namespaces a colour utility can use);
// full palette + the standard 50–950 shade scale so `border-neutral-200` is
// caught same as `bg-blue-600`.
const DEFAULT_PALETTE_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const DEFAULT_PALETTE_SHADES = "50|100|200|300|400|500|600|700|800|900|950";
const DEFAULT_PALETTE_RE = new RegExp(
  String.raw`\b(?:${TW_PREFIXES})-(?:${DEFAULT_PALETTE_COLORS})-(?:${DEFAULT_PALETTE_SHADES})\b`,
  "g",
);

// Blank out every region that can contain a shadcn-looking substring without
// being a utility class:
//   - comments, because a docstring may legitimately DISCUSS `bg-accent`
//     (new-match-wizard/styles.ts cites the DS spec by name in prose while its
//     code uses `bg-[#3B82F6]`)
//   - Tailwind arbitrary values and CSS custom-property names, because
//     `border-[var(--border-card)]` is a DS token, not `border-card`
//
// Each region is replaced by spaces of the SAME length, newlines kept, so the
// match index still maps to the right line in the original file. Replacing
// with a shorter literal silently reports every finding at the wrong line.
const blank = (m) => m.replace(/[^\n]/g, " ");
const stripNonUtilities = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/\[[^\]]*\]/g, blank)
    .replace(/--[a-z0-9-]+/g, blank);

const norm = (h) => h.toUpperCase();
const hexesIn = async (file) =>
  new Set(((await readFile(file, "utf8")).match(HEX_RE) ?? []).map(norm));
const isUnreachable = (file) => UNREACHABLE.some((p) => file.startsWith(p));

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if ([".ts", ".tsx", ".css"].includes(extname(entry.name)))
      out.push(path);
  }
  return out;
}

async function loadShadcnUtilities() {
  const text = await readFile(GLOBALS, "utf8");
  const names = [];
  for (const m of text.matchAll(THEME_ENTRY_RE))
    if (/^var\(--[a-z0-9-]+\)$/.test(m[2].trim())) names.push(m[1]);
  // No shadcn entries left means the layer is gone and there is nothing to
  // detect. A regex built from an empty alternation would instead match the
  // bare prefixes (`bg-`, `text-`, …) against the whole codebase — 1,020
  // findings at the exact moment the check finally succeeds.
  if (names.length === 0) return null;
  // Longest first, so `muted-foreground` wins over `muted` and the reported
  // match is the whole utility rather than its prefix.
  names.sort((a, b) => b.length - a.length);
  return new RegExp(
    String.raw`\b(?:${TW_PREFIXES})-(?:${names.join("|")})\b`,
    "g",
  );
}

const palette = await hexesIn(AUTHORITY);
if (palette.size === 0) {
  console.error(`${AUTHORITY}: no colours found — check the path`);
  process.exit(1);
}
const vizHues = new Set();
for (const t of TRANSCRIPTIONS)
  for (const h of await hexesIn(t)) vizHues.add(h);

const SHADCN_RE = await loadShadcnUtilities();
const findings = {
  hex: [],
  size: [],
  viz: [],
  shadcn: [],
  transcript: [],
  defaultPalette: [],
};
const SKIP = new Set([AUTHORITY, ...TRANSCRIPTIONS]);
// Hex-literal checks (1 and 3) only — NOT the full per-file SKIP above, which
// would also hide a `@apply border-border` or `bg-blue-600` regression inside
// these same files from checks 4 and 6. See the comment on
// CSS_TOKEN_DEFINITIONS for why a definition file is exempt from "is this hex
// off-palette" but not from "is this a utility class we don't own".
const HEX_CHECK_EXEMPT = new Set([...HEX_EXEMPT, ...CSS_TOKEN_DEFINITIONS]);

// Check 5 — the transcriptions must agree with the authority.
for (const file of TRANSCRIPTIONS) {
  const text = await readFile(file, "utf8");
  for (const m of text.matchAll(HEX_RE)) {
    const hex = norm(m[0]);
    if (palette.has(hex)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    findings.transcript.push(`${file}:${line}  ${hex}`);
  }
}

for (const file of (await walk(SRC)).sort()) {
  if (SKIP.has(file) || isUnreachable(file)) continue;
  const text = await readFile(file, "utf8");
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  const allowedHere = new Set((ALLOWED_HEX[file] ?? []).map(norm));

  if (!HEX_CHECK_EXEMPT.has(file))
    for (const m of text.matchAll(HEX_RE)) {
      const hex = norm(m[0]);
      if (palette.has(hex) || allowedHere.has(hex)) continue;
      findings.hex.push(`${file}:${lineOf(m.index)}  ${hex}`);
    }

  for (const m of text.matchAll(TEXT_PX_RE))
    if (!TYPE_SCALE.has(Number(m[1])))
      findings.size.push(`${file}:${lineOf(m.index)}  ${m[0]}`);

  // data-viz.ts:20 — "Do not inline a raw hex in a component." The rule is
  // about VIZ HUES, so membership in the viz set is what makes a colour prop a
  // finding; a chrome grey on an SVG stroke is check 1's business.
  //
  // There is deliberately no "but the file imports data-viz" exemption. A file
  // that imports it correctly writes `fill={VIZ_BLUE}` and has no literal to
  // match, so the exemption could only ever hide a file that imports the
  // module AND inlines a hue anyway — which is the violation, not an excuse.
  if (!HEX_CHECK_EXEMPT.has(file))
    for (const m of text.matchAll(COLOR_PROP_RE)) {
      const hex = norm(m[1]);
      if (!vizHues.has(hex) || allowedHere.has(hex)) continue;
      findings.viz.push(`${file}:${lineOf(m.index)}  ${hex}`);
    }

  // Checks 4 and 6 both hunt for a Tailwind utility class hiding somewhere
  // that isn't a comment, an arbitrary value, or a CSS custom-property name —
  // strip once, share the result. This is also what makes `@apply
  // bg-blue-600` inside a stylesheet count the same as `bg-blue-600` in a
  // component: `stripNonUtilities` only blanks comments/`[...]`/`--vars`, so
  // the class name inside an `@apply` line survives untouched.
  const stripped = stripNonUtilities(text);

  if (SHADCN_RE)
    for (const m of stripped.matchAll(SHADCN_RE))
      findings.shadcn.push(`${file}:${lineOf(m.index)}  ${m[0]}`);

  for (const m of stripped.matchAll(DEFAULT_PALETTE_RE))
    findings.defaultPalette.push(`${file}:${lineOf(m.index)}  ${m[0]}`);
}

// ── Seeds. Lower these as tasks clear drift; never raise one. ───────────────
const CHECKS = [
  {
    key: "hex",
    seed: 70,
    label: "off-palette hex",
    fix: "resolve to the token it duplicates, or promote a real role to colors.css",
  },
  {
    key: "size",
    seed: 6,
    label: "off-scale text-[Npx]",
    fix: "snap to the SKILL.md type scale, or add the missing step to it",
  },
  {
    key: "viz",
    seed: 1,
    label: "inlined viz hue",
    fix: "import the named export from lib/design/data-viz.ts (see its header)",
  },
  {
    key: "shadcn",
    seed: 0,
    label: "shadcn token utility",
    fix: "use the DS variable — --ink-*, --surface-*, --blue*",
  },
  {
    key: "defaultPalette",
    seed: 1,
    label: "Tailwind default-palette class",
    fix: "swap for the DS token that plays the same role — --ink-*, --blue*, --surface-*",
  },
  {
    key: "transcript",
    seed: 0,
    label: "transcription drift from colors.css",
    fix: "align the module to colors.css, or add the role to colors.css if it is real",
  },
];

const verbose = process.argv.includes("--verbose");
let failed = false;

for (const { key, seed, label, fix } of CHECKS) {
  const n = findings[key].length;
  console.log(`${n === seed ? "ok  " : "FAIL"} ${label}: ${n} (seed ${seed})`);
  if (n > seed) {
    failed = true;
    console.log(`     ${n - seed} new since the seed. Fix: ${fix}`);
  } else if (n < seed) {
    failed = true;
    console.log(
      `     seed is stale — lower it to ${n} in scripts/check-design-drift.mjs`,
    );
  }
  if (verbose || n > seed)
    for (const hit of findings[key].slice(0, verbose ? Infinity : 20))
      console.log(`       ${hit}`);
}

process.exit(failed ? 1 : 0);
