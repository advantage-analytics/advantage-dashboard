"use client";

import { useState } from "react";
import { Flame, Grid3x3, ScatterChart } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
  type FloatMenuTone,
} from "@/components/ui/float-menu";
import { chartAllowedOn, type Chart, type Cut } from "./viz-model";
import { useVizState } from "./use-viz-state";
import { CHART_LABEL, VizMenuTrigger } from "./viz-labels";
import { carryFilters } from "./viz-url";
import { VizBandsMenuRows } from "./viz-bands-menu";
import { bandKindFor } from "./cut-kinds";

/** The two halves of a return: where it landed, where it was struck. */
const RETURN_CUTS: { cut: Cut; label: string; description: string }[] = [
  {
    cut: "returnPlacement",
    label: "Placement",
    description: "Where each return landed",
  },
  {
    cut: "returnContact",
    label: "Contact",
    description: "Where each return was struck",
  },
];

/**
 * The lightbox's chart menu. Chart type applies to every cut; Zones uses its
 * existing bands. On a return, Placement and Contact lead the menu (the wall
 * has one Returns card; contact is a chart of it). On a cut with bands, the
 * band rows (`VizBandsMenuRows`) close it, with "Edit bands…" opening the
 * editor through `onEditBands`.
 */
export function ChartMenu({
  tone = "light",
  side = "bottom",
  onEditBands,
  showBands = false,
}: {
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
  /** Opens the band editor; without it "Edit bands…" is disabled. */
  onEditBands?: () => void;
  /** Draw the bands section (the lightbox; never on the wall). */
  showBands?: boolean;
} = {}) {
  const { state, setState } = useVizState();
  const [open, setOpen] = useState(false);

  function selectChart(chart: Chart) {
    setState((prev) => ({ ...prev, chart, viewId: null }));
    setOpen(false);
  }

  function selectCut(cut: Cut) {
    setState((prev) => ({
      ...prev,
      cut,
      // A chart the new cut cannot draw falls back to Scatter
      // (`chartAllowedOn`, the rule `parseVizState` also applies).
      chart: chartAllowedOn(cut, prev.chart) ? prev.chart : "scatter",
      filters: carryFilters(prev.filters, cut),
      viewId: null,
    }));
    setOpen(false);
  }

  const isReturn =
    state.cut === "returnPlacement" || state.cut === "returnContact";

  // One rule for the Zones item and its note, so they never disagree.
  const zonesAllowed = state.cut === null || chartAllowedOn(state.cut, "zones");

  const triggerIcon =
    state.chart === "zones"
      ? Grid3x3
      : state.chart === "heat"
        ? Flame
        : ScatterChart;

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      // Final review #9: the frame draws this menu at 280 in the viewer
      // (f4b-report P2d) and the shipped light toolbar at 272. Keyed on the
      // tone rather than a new prop — the two surfaces are the only two
      // widths there are.
      width={tone === "dark" ? 280 : 272}
      side={side}
      tone={tone}
      sideOffset={6}
      align="start"
      label="Chart"
      trigger={
        <VizMenuTrigger
          icon={triggerIcon}
          label={CHART_LABEL[state.chart]}
          open={open}
          tone={tone}
        />
      }
    >
      {isReturn && (
        <>
          <FloatMenuLabel>Return</FloatMenuLabel>
          {RETURN_CUTS.map((item) => (
            <FloatMenuItem
              key={item.cut}
              label={item.label}
              description={item.description}
              chosen={state.cut === item.cut}
              onSelect={() => selectCut(item.cut)}
            />
          ))}
          <FloatMenuDivider />
          <FloatMenuLabel>Chart</FloatMenuLabel>
        </>
      )}
      <FloatMenuItem
        label="Scatter"
        description="Every landing point, coloured by outcome"
        chosen={state.chart === "scatter"}
        onSelect={() => selectChart("scatter")}
      />
      <FloatMenuItem
        label="Heat"
        description="Where they cluster — the ramp replaces the legend"
        chosen={state.chart === "heat"}
        icon={
          <Flame
            className="size-[13px] shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        }
        onSelect={() => selectChart("heat")}
      />
      {zonesAllowed && (
        <FloatMenuItem
          label="Zones"
          description={
            state.cut === "serve"
              ? "Count and points won per service box"
              : "Count and points won per depth or contact band"
          }
          chosen={state.chart === "zones"}
          onSelect={() => selectChart("zones")}
        />
      )}

      {zonesAllowed && (
        <FloatMenuNote>
          Zones follows the service boxes or the current depth and contact
          bands.
        </FloatMenuNote>
      )}

      {showBands && state.cut !== null && (
        <BandsSection
          cut={state.cut}
          onEdit={onEditBands}
          close={() => setOpen(false)}
        />
      )}
    </FloatMenu>
  );
}

/** The band rows under a hairline — only on a cut that has bands. */
function BandsSection({
  cut,
  onEdit,
  close,
}: {
  cut: Cut;
  onEdit?: () => void;
  close: () => void;
}) {
  if (bandKindFor(cut) === null) return null;
  return (
    <>
      <FloatMenuDivider />
      <VizBandsMenuRows cut={cut} onEdit={onEdit} close={close} />
    </>
  );
}
