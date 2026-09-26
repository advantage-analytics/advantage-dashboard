# design-sync notes — Advantage Analytics

Repo-specific facts a re-sync needs. `config.json` holds the values the
converter reads; this file holds the why and the gotchas. First sync: 2026-09-25,
into the Claude Design project **Advantage Analytics — Code Components**
(`235baf04-01f4-4821-b6e2-0431ecb68846`, https://claude.ai/design/p/235baf04-01f4-4821-b6e2-0431ecb68846).
It is the code-derived sibling of the hand-built _Advantage Design System v3_
project, not a replacement for that rulebook. Re-syncs: fetch its `_ds_sync.json`
to `.design-sync/.cache/remote-sync.json` and run the driver with `--remote`.

## Shape and build

- **This is a Next.js app, not a component library.** No `dist/`, no `.d.ts`
  tree, no static stylesheet. `buildCmd` (`node .design-sync/build-pkg.mjs`)
  manufactures all three under `.design-sync/.cache/pkg/` (gitignored):
  `styles/app.css` (Tailwind-compiled `src/app/globals.css`), `index.tsx`
  (barrel of the SCOPE list in that script), `types/` (tsc declarations for
  the same files, `@/…` specifiers rewritten to relative). `--entry` points
  at the barrel, so the converter treats the repo root as the package.
- **The scope list lives in `build-pkg.mjs` (`SCOPE`)**, not in config —
  add a file there to sync a new component. `componentSrcMap` in config only
  pins multi-export files (float-menu, confirm-dialog, dialog, …) and drops
  pure internals (`DialogPortal`, `DialogOverlay`, `AlertDialogPortal`,
  `AlertDialogOverlay`, `PopoverAnchor`).
- **`next/link` is shimmed** (`.design-sync/shims/next-link.tsx`, wired via
  the generated `tsconfig.paths.json`). Bundled outside Next, the real Link
  drags the App Router internals in and throws `process is not defined` at
  load — which killed every export on the window global, not just the two
  that use it. Any new scoped file that imports `next/image`, `next/navigation`
  or Supabase needs the same treatment or must stay out of scope.
- **`.font-clash` is stripped** from the compiled CSS in `build-pkg.mjs`. It
  names "Clash Display", a marketing-page font the DS bans; left in, validate
  flags `[FONT_MISSING]` for a family the bundle can never provide.
- **Fonts are self-hosted**: `.design-sync/fonts.css` + `fonts/*.woff2` (Google
  Fonts latin variable subsets of Inter v20 and Roboto Mono v31, ~80 KB total)
  via `extraFonts`. next/font never emits `@font-face`, and its CSS variables
  (`--font-inter`, `--font-roboto-mono`) are bound by family name at the top
  of the compiled sheet — without that, `font-family: var(--font-inter)`
  falls back to the browser default.
- **Groups**: ui/ is a generic dir name, so every primitive landed in
  "general". `build-pkg.mjs` emits `docs/<Name>.md` stubs whose only content
  is a `category:` front-matter line (GROUPS map) and `docsDir: "docs"` binds
  them. Dashboard pieces keep their directory names (shared, settings,
  loading, matches, dashboard) — the converter only regroups cards that have
  no directory group.
- **`dtsPropsFor`** overrides seven contracts the extractor flattened wrongly:
  `won: boolean` lost its `null` (ResultMark), `viewer` lost `| null`
  (PlayerMark), and ScoreLine/WorkspaceMark/CardEmpty/MenuSelect/DateField
  referenced types (`ScoreLineSet`, `Workspace`, `CardEmptyBand`, `T`,
  `DateFieldHandle`) that never reach the emitted `.d.ts`. Re-check these
  after editing any of those components' props.

## Previews

- **Only the utility classes the app itself uses exist in the compiled sheet.**
  There is no Tailwind JIT in Claude Design. A preview (or a design) that
  writes `w-[40%]`, `size-[36px]` or `grid-cols-[1fr_80px_48px]` renders
  unstyled with no error. Layout glue in previews is inline style; a
  className is used only where a component accepts nothing else (`PendingBar`,
  `PersonAvatar`, `WorkspaceMark`) and then only with a class that already
  ships. Check with: `grep -c '\.w-\\\[40\\%\\\]' ds-bundle/_ds_bundle.css`.
- **Overlays** (`FloatMenu`, `ConfirmDialog`, `Dialog`, `AlertDialog`,
  `Popover`, `Tooltip`) run `cardMode: single` with a viewport. Dialogs need
  ≥ 640px of width or the shipped `sm:` footer layout stacks the buttons.
  Menus need enough bottom padding inside the story for the popover's height.
- **Radix autofocus** puts a focus ring on the first menu row / the Cancel
  button in the captures. That is the real open state, not a defect.
- **`ChromeTooltip`** cannot render its label statically (hover-only, no
  `open` prop is forwarded); its card is the trigger cluster plus a caption.
  `Tooltip` itself renders open via `open`.
- **`MenuSelect`** owns its open state; its card shows the three triggers.
  The open surface is `FloatMenu`'s card.

## Known render warns

(none carried — validate is clean after the fixes above)

## Re-sync risks

- `SCOPE` in `build-pkg.mjs` and `componentSrcMap` in config drift apart
  silently when a file gains or loses exports — a new export in a scoped
  file gets a card automatically; a renamed one leaves a stale pin.
- The compiled sheet is a snapshot of the app's utility usage. A refactor
  that stops using a class the previews rely on (`h-[22px]`, `h-[24px]`,
  `size-9`, `size-[40px]`, `w-[72px]`) un-styles those previews with no
  build error; the render check won't catch a width change either. Eyeball
  the review sheets after any large Tailwind churn.
- Fonts are pinned Google Fonts builds copied into the repo; they never
  update on their own. Fine, but say so if someone asks why Inter "looks
  old".
- Toolchain assumed: node 22, the repo's own tailwindcss 4.2 / typescript 5,
  converter deps installed into `.ds-sync/` with playwright 1.57 (matches
  the chromium-1200 build cached under `~/Library/Caches/ms-playwright`).
