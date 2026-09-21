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
      // The film's dark surface predates the P2d spec values (`rgba(20,20,22,.97)`
      // vs the shared dark tone's `rgba(13,13,13,.88)`) — kept as-is here so this
      // fold changes row markup, not the film's own established surface colour.
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
  return (
    <FloatMenuItem
      label={label}
      description={description}
      chosen={chosen ?? false}
      trailing={trailing}
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
