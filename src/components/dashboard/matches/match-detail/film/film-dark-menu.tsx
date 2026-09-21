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
      className="border-white/10 bg-[rgba(20,20,22,0.97)]"
    >
      {children}
    </FloatMenu>
  );
}

/** Sentence-case section label, 11px at 45%. */
export function FilmDarkMenuLabel({ children }: { children: React.ReactNode }) {
  return <FloatMenuLabel>{children}</FloatMenuLabel>;
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
  if (trailing !== undefined) {
    return (
      <FloatMenuItem
        label={label}
        description={description}
        trailing={trailing}
        onSelect={onSelect}
      />
    );
  }
  return (
    <FloatMenuItem
      label={label}
      description={description}
      chosen={chosen}
      onSelect={onSelect}
    />
  );
}

export function FilmDarkMenuDivider() {
  return <FloatMenuDivider />;
}

export function FilmDarkMenuNote({ children }: { children: React.ReactNode }) {
  return <FloatMenuNote>{children}</FloatMenuNote>;
}
