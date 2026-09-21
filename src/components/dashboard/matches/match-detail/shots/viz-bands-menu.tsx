"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MoveVertical } from "lucide-react";

import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { formatDistanceValue } from "@/lib/format/distance";
import { schemeLabel, type DepthScheme } from "@/lib/data/viz-bands";
import { cn } from "@/lib/utils";

import { useVizBands } from "./viz-bands-context";
import type { Cut } from "./viz-model";

/**
 * The bands control in the fullscreen viewer's bottom slab (Phase 2B, Task
 * 3; spec Appendix P2l) — the trigger, and the preset menu behind it.
 *
 * It only exists on the three return cuts: `returnPlacement` reads DEPTH
 * bands (where the return landed, far half), `returnContact`/`rallyPosition`
 * read CONTACT bands (where it was struck, near half). Serve has no bands at
 * all, so the slab shows nothing there rather than a control that would do
 * nothing.
 *
 * ## Depth vs. contact
 *
 * Depth has four named presets. Contact does not — the plan's ruling: its
 * two dividers are a pair of positions relative to the baseline, and there
 * is no preset vocabulary for them worth inventing, so the only thing the
 * menu offers besides the editor is hiding the shading. That toggle is
 * SESSION-ONLY (`viz-bands-context.tsx`): it never writes, so unlike the
 * depth presets it stays live for a player who cannot edit the team's bands
 * — refusing to let someone turn off a wash would be a permission check on
 * their own eyes.
 *
 * ## Picking a preset
 *
 * `applyBands` is optimistic: the overlay and the `% · n` printed on it both
 * come from the same optimistic `BandSettings`, so they move together on the
 * frame of the click. The save follows; a refusal reverts it and says so in
 * the viewer's receipt slot. The other half of the record always rides along
 * unchanged — picking a depth preset must not silently rewrite where a
 * coach put their contact dividers.
 *
 * "Edit bands…" is Task 4's drag editor. Until it lands, `onEdit` may be
 * absent and the row simply does nothing; it is rendered disabled whenever
 * the viewer cannot edit this workspace's bands at all.
 */

const DEPTH_PRESETS: {
  scheme: Exclude<DepthScheme, "custom">;
  label: string;
  description: string;
}[] = [
  {
    scheme: "thirds",
    label: "Thirds",
    description: "Equal thirds of the court, baseline to net",
  },
  {
    scheme: "deepMidShort",
    label: "Deep · mid · short",
    description: "Coach default — 10 ft, 14 ft, then the rest",
  },
  {
    scheme: "inside",
    label: "Inside the baseline",
    description: "Two bands, split where the court ends",
  },
];

const OWN_BANDS_NOTE =
  "Bands are yours — they change every return chart in this workspace, not this match.";
const READ_ONLY_NOTE = "Only coaches and staff can change this team's bands.";

/** Which half a cut's bands describe — `null` for Serve, which has none. */
export function bandKindFor(cut: Cut): "depth" | "contact" | null {
  if (cut === "returnPlacement") return "depth";
  if (cut === "returnContact" || cut === "rallyPosition") return "contact";
  return null;
}

export function VizBandsMenu({
  cut,
  onEdit,
}: {
  cut: Cut;
  /** Task 4's editor. Absent until it exists. */
  onEdit?: () => void;
}) {
  const {
    bands,
    canEdit,
    unit,
    contactHidden,
    toggleContactHidden,
    applyBands,
  } = useVizBands();
  const [open, setOpen] = useState(false);

  const kind = bandKindFor(cut);
  if (kind === null) return null;

  const isDepth = kind === "depth";
  const label = isDepth ? "Depth bands" : "Contact bands";

  // The mono slot on the trigger: the depth SCHEME's own short name, or —
  // contact having no schemes — the two dividers it is actually cut at,
  // which is the nearest equivalent fact. "OFF" when the shading is hidden,
  // for both.
  const [c0, c1] = bands.contactDividersFt;
  const monoLabel = isDepth
    ? schemeLabel(bands.depthScheme)
    : contactHidden
      ? "OFF"
      : `${formatDistanceValue(unit, c0)} · ${formatDistanceValue(unit, c1)} ${unit}`.toUpperCase();

  function pickScheme(scheme: DepthScheme) {
    setOpen(false);
    applyBands({ ...bands, depthScheme: scheme });
  }

  function edit() {
    setOpen(false);
    onEdit?.();
  }

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={280}
      side="top"
      sideOffset={6}
      align="start"
      tone="dark"
      label={label}
      trigger={
        // The dark slab trigger recipe `VizMenuTrigger` carries, plus the
        // mono scheme slot between the label and the chevron — the one thing
        // that component's `label: string` cannot express.
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[12px] font-medium text-white transition-colors duration-200",
            open ? "bg-white/[0.18]" : "bg-white/10 hover:bg-white/[0.18]",
          )}
          style={{ borderRadius: "var(--radius-element)" }}
        >
          <MoveVertical
            className="size-[13px] shrink-0 text-white/70"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
          <span className="mono tabular shrink-0 text-[10px] text-white/50">
            {monoLabel}
          </span>
          <Chevron
            className="size-3 shrink-0 text-white/70"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      }
    >
      <FloatMenuLabel>{label}</FloatMenuLabel>

      {isDepth ? (
        <>
          <FloatMenuItem
            label="No bands"
            description="Just the landing points, no shading"
            chosen={bands.depthScheme === "none"}
            disabled={!canEdit}
            onSelect={() => pickScheme("none")}
          />
          <FloatMenuDivider />
          {DEPTH_PRESETS.map((preset) => (
            <FloatMenuItem
              key={preset.scheme}
              label={preset.label}
              description={preset.description}
              chosen={bands.depthScheme === preset.scheme}
              disabled={!canEdit}
              onSelect={() => pickScheme(preset.scheme)}
            />
          ))}
        </>
      ) : (
        // Session-only, so it is live even for a player: see the file's own
        // doc comment.
        <FloatMenuItem
          label="No bands"
          description="Just the contact points, no shading"
          chosen={contactHidden}
          onSelect={() => {
            setOpen(false);
            toggleContactHidden();
          }}
        />
      )}

      <FloatMenuDivider />
      <FloatMenuItem
        label="Edit bands…"
        disabled={!canEdit}
        icon={
          <MoveVertical
            className="size-[13px] shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        }
        onSelect={edit}
      />

      <FloatMenuNote>{canEdit ? OWN_BANDS_NOTE : READ_ONLY_NOTE}</FloatMenuNote>
    </FloatMenu>
  );
}
