"use client";

import { useState } from "react";
import { ChevronDown, Maximize2, PanelRight } from "lucide-react";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";
import {
  LAYOUT_MODES,
  LAYOUT_MODE_LABEL,
  type LabelLayoutMode,
} from "./label-layout";

/**
 * The console header's "Layout" control: a `FloatMenu` listing the two ways
 * the console can sit — Docked side, in the page, and Full screen — with the
 * current one checked.
 *
 * The trigger is `MenuSelect`'s pill, drawn by hand because it names the
 * control ("Layout") rather than the value: the glyph beside the word is the
 * mode — a right panel for the docked rail, the expand arrows for the full
 * screen — so the current choice still reads at a glance. Each row carries a
 * second line saying what choosing it does.
 */

const MODE_ICON: Record<LabelLayoutMode, typeof PanelRight> = {
  "docked-side": PanelRight,
  black: Maximize2,
};

export function LabelLayoutControl({
  mode,
  onChange,
}: {
  mode: LabelLayoutMode;
  onChange: (mode: LabelLayoutMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = MODE_ICON[mode];
  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={264}
      label="Layout"
      trigger={
        <button
          type="button"
          data-label-layout=""
          data-layout-mode={mode}
          aria-label={`Layout: ${LAYOUT_MODE_LABEL[mode].label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex h-[30px] shrink-0 cursor-pointer items-center gap-2 rounded-[6px] border bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-900)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open ? "border-[var(--blue)]" : "border-[var(--border-field)]",
          )}
        >
          <Icon
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>Layout</span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      }
    >
      {LAYOUT_MODES.map((candidate) => (
        <FloatMenuItem
          key={candidate}
          label={LAYOUT_MODE_LABEL[candidate].label}
          description={LAYOUT_MODE_LABEL[candidate].description}
          chosen={candidate === mode}
          onSelect={() => {
            setOpen(false);
            if (candidate !== mode) onChange(candidate);
          }}
        />
      ))}
    </FloatMenu>
  );
}
