"use client";

import { useState } from "react";
import { Flame, Grid3x3, ScatterChart, type LucideIcon } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuNote,
  type FloatMenuTone,
} from "@/components/ui/float-menu";
import { chartAllowedOn, type Chart } from "./viz-model";
import { useVizState } from "./use-viz-state";
import { CHART_LABEL, VizMenuTrigger } from "./viz-labels";

/**
 * The lightbox's chart menu: Scatter, Heat and Zones, nothing else. Chart
 * type applies to every cut; Zones uses the existing bands. The bands
 * themselves have their own menu beside the legend (`VizBandsMenu`,
 * `viz-bands-menu.tsx`; plan 2026-11-25 §4).
 */
export function ChartMenu({
  tone = "light",
  side = "bottom",
}: {
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
} = {}) {
  const { state, setState } = useVizState();
  const [open, setOpen] = useState(false);

  function selectChart(chart: Chart) {
    setState((prev) => ({ ...prev, chart, viewId: null }));
    setOpen(false);
  }

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
      <FloatMenuItem
        label="Scatter"
        description="Every landing point, coloured by outcome"
        chosen={state.chart === "scatter"}
        icon={<ChartRowIcon icon={ScatterChart} />}
        onSelect={() => selectChart("scatter")}
      />
      <FloatMenuItem
        label="Heat"
        description="Where they cluster — the ramp replaces the legend"
        chosen={state.chart === "heat"}
        icon={<ChartRowIcon icon={Flame} />}
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
          icon={<ChartRowIcon icon={Grid3x3} />}
          onSelect={() => selectChart("zones")}
        />
      )}

      {zonesAllowed && (
        <FloatMenuNote>
          Zones follows the service boxes or the current depth and contact
          bands.
        </FloatMenuNote>
      )}
    </FloatMenu>
  );
}

/**
 * A chart row's leading glyph — the same one the trigger wears for that
 * chart, 13px in `--ink-400`. Every chart row carries one, so Scatter, Heat
 * and Zones start their labels on one line.
 */
function ChartRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      className="size-[13px] shrink-0 text-[var(--ink-400)]"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}
