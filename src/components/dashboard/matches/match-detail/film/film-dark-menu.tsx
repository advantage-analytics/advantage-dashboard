"use client";

import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
} from "@/components/ui/float-menu";

/**
 * The film's own names for the product's one dropdown surface
 * (`ui/float-menu.tsx`) on `tone="dark"` — thin wrappers, kept so the film's
 * call sites (`film-quick-filters.tsx`, `film-advanced-filters-dialog.tsx`)
 * don't churn. Phase 2A folded this file's hand-built row markup into
 * `FloatMenu`/`FloatMenuItem` themselves (the DS's "one implementation, two
 * surfaces" rule — the fullscreen court viewer needed the exact same dark
 * menu and a second hand-rolled copy was never on the table); everything
 * below just forwards to the shared component with `tone="dark"`.
 *
 * RULING (final review): the film room was never asked to be restyled. The
 * fold moved it a few values toward the viz dark tone — row radius, vertical
 * alignment, four text alphas, a divider alpha, a shadow, note padding — and
 * every one of those is restored here, on top of the shared components, via
 * `className` and the three narrow override props `float-menu.tsx` carries
 * for this file alone. The components are NOT forked; each override below
 * names the value it is putting back.
 */

export function FilmDarkMenu({
  open,
  onOpenChange,
  trigger,
  label,
  width = 268,
  align = "end",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  label: string;
  width?: number;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  return (
    <FloatMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      label={label}
      width={width}
      align={align}
      tone="dark"
      // RULING: deliberate deviation from the viz dark tone's surface
      // (`rgba(13,13,13,.88)` blur 10, f4b-report P2d/P2e/P2f/P2g/P2h) — the
      // film room keeps its own already-shipped `rgba(20,20,22,.97)`. It was
      // not restyled as part of this work; only its row markup was folded
      // into the shared `FloatMenu`/`FloatMenuItem`.
      //
      // Restored: the dark tone adds `backdrop-blur-[10px]` (invisible under
      // a .97 surface) and swaps the film's flat `0 6px 20px rgba(0,0,0,.12)`
      // for `--shadow-dropdown`, which is NOT invisible. Both put back.
      className="border-white/10 bg-[rgba(20,20,22,0.97)] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)] backdrop-blur-none"
    >
      {children}
    </FloatMenu>
  );
}

/** Sentence-case section label, 11px at 45%. */
export function FilmDarkMenuLabel({ children }: { children: React.ReactNode }) {
  // Restored: the dark tone lifts the label to 50% white.
  return <FloatMenuLabel className="text-white/45">{children}</FloatMenuLabel>;
}

export function FilmDarkMenuItem({
  label,
  description,
  chosen,
  trailing,
  onSelect,
}: {
  label: string;
  description?: string;
  /** Omit for an action row (no check slot). */
  chosen?: boolean;
  /** A trailing glyph for an action row, e.g. a chevron — `FloatMenuItem`'s
   * own `trailing` slot (folded in from this file's hand-built row). */
  trailing?: React.ReactNode;
  onSelect: () => void;
}) {
  // `chosen`/`trailing` are a discriminated union on `FloatMenuItem` now —
  // pass exactly one. A caller that omits `chosen` (this file's own
  // documented "omit for an action row") must still reach `FloatMenuItem`
  // WITHOUT a `chosen` key at all, not `chosen={false}`, since `FloatMenuItem`
  // treats `chosen === undefined` as the action-row signal.
  //
  // Restored on the row (the dark tone's values are in brackets):
  //   radius 6px [7px] · `items-center` [items-start] ·
  //   hover/focus and chosen wash `white/[0.07]` [`white/[0.08]`]
  // and on the description line, which `className` cannot reach:
  //   ink `white/45` [`white/50`] · gap 1px [`mt-0.5`, 2px]
  const rowClassName =
    "items-center rounded-[6px] hover:bg-white/[0.07] focus-visible:bg-white/[0.07]" +
    (chosen ? " bg-white/[0.07]" : "");
  const descriptionClassName = "mt-px text-white/45";

  if (trailing !== undefined) {
    return (
      <FloatMenuItem
        label={label}
        description={description}
        trailing={trailing}
        onSelect={onSelect}
        className={rowClassName}
        descriptionClassName={descriptionClassName}
      />
    );
  }
  return (
    <FloatMenuItem
      label={label}
      description={description}
      chosen={chosen}
      onSelect={onSelect}
      className={rowClassName}
      descriptionClassName={descriptionClassName}
    />
  );
}

export function FilmDarkMenuDivider() {
  // Restored: the dark tone deepens the divider to 12% white.
  return <FloatMenuDivider className="bg-white/10" />;
}

export function FilmDarkMenuNote({ children }: { children: React.ReactNode }) {
  // Restored: ink `white/40` [`white/45`], padding `pt-[7px] pb-2`
  // [`pt-[6px] pb-[7px]`], and the divider above it at 10% [12%].
  return (
    <FloatMenuNote
      className="pt-[7px] pb-2 text-white/40"
      dividerClassName="bg-white/10"
    >
      {children}
    </FloatMenuNote>
  );
}
