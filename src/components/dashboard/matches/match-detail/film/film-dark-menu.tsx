"use client";

import { ChosenCheck, FloatMenu } from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";

/**
 * The float menu on the film — the product's one dropdown surface drawn on
 * the dark scope (handoff F4): 10px radius, 5px inset, rgba(20,20,22,.97)
 * with a 10%-white hairline. The surface is `FloatMenu` (positioning,
 * dismissal, focus); the rows are hand-built because `FloatMenuItem` carries
 * the light inks and the DS says hand-build when a primitive fights the
 * geometry. `ChosenCheck` is still the one mark that means "chosen".
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
      className="border border-white/10 bg-[rgba(20,20,22,0.97)]"
    >
      {children}
    </FloatMenu>
  );
}

/** Sentence-case section label, 11px at 45%. */
export function FilmDarkMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-[9px] pt-[7px] pb-[5px] text-[11px] text-white/45">
      {children}
    </span>
  );
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
  /** A trailing glyph for an action row, e.g. a chevron. */
  trailing?: React.ReactNode;
  onSelect: () => void;
}) {
  const radio = chosen !== undefined;
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? chosen : undefined}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[6px] px-[9px] py-[7px] text-left transition-colors duration-100",
        "hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none",
        chosen && "bg-white/[0.07]",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[12px] text-white">{label}</span>
        {description && (
          <span className="text-[11px] text-white/45">{description}</span>
        )}
      </span>
      {radio ? <ChosenCheck chosen={chosen} /> : trailing}
    </button>
  );
}

export function FilmDarkMenuDivider() {
  return <div aria-hidden="true" className="my-[5px] h-px bg-white/10" />;
}

export function FilmDarkMenuNote({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FilmDarkMenuDivider />
      <span className="block px-[9px] pt-[7px] pb-2 text-[11px] text-white/40">
        {children}
      </span>
    </>
  );
}
