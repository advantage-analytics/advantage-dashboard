"use client";

import { useState } from "react";
import { ChevronDown, Layers, PanelRight, PanelTop } from "lucide-react";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { cn } from "@/lib/utils";
import {
  LAYOUT_MODES,
  LAYOUT_MODE_LABEL,
  type LabelLayoutMode,
} from "./label-layout";

/**
 * The console header's "Layout" control (T24): a `FloatMenu` listing the
 * three ways the video and the court can sit against the table — Overlay,
 * Docked top, Docked side — with the current one checked.
 *
 * The trigger is `MenuSelect`'s pill, drawn by hand because it names the
 * control ("Layout") rather than the value: the glyph beside the word is the
 * mode — stacked layers for the floating cards, a top panel for the band, a
 * right panel for the column — so the current choice still reads at a glance
 * without the pill growing to "Docked side". Each row carries a second line
 * saying what choosing it does, since "Overlay" alone would not.
 */

const MODE_ICON: Record<LabelLayoutMode, typeof Layers> = {
  overlay: Layers,
  "docked-top": PanelTop,
  "docked-side": PanelRight,
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
