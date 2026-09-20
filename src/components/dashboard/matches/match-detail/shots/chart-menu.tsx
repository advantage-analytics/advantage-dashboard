"use client";

import { useState } from "react";
import { Flame, Grid3x3, ScatterChart } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import type { Chart } from "./viz-model";
import { useVizState } from "./use-viz-state";
import { CHART_LABEL, VizMenuTrigger } from "./viz-labels";

/**
 * The "Chart" menu (P1e): Scatter, the disabled Heat placeholder, and Zones
 * — Zones only renders when the current cut is Serve, since it counts and
 * scores service boxes and has no meaning off serve (guardrails: Zones is
 * Serve-only, enforced here rather than trusted to the caller).
 */
export function ChartMenu() {
  const { state, setState } = useVizState();
  const [open, setOpen] = useState(false);

  function selectChart(chart: Chart) {
    setState({ ...state, chart, viewId: null });
    setOpen(false);
  }

  const triggerIcon = state.chart === "zones" ? Grid3x3 : ScatterChart;

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={272}
      sideOffset={6}
      align="start"
      label="Chart"
      trigger={
        <VizMenuTrigger
          icon={triggerIcon}
          label={CHART_LABEL[state.chart]}
          open={open}
        />
      }
    >
      <FloatMenuItem
        label="Scatter"
        description="Every landing point, coloured by outcome"
        chosen={state.chart === "scatter"}
        onSelect={() => selectChart("scatter")}
      />
      <FloatMenuItem
        label="Heat"
        description="Fullscreen viewer"
        disabled
        icon={
          <Flame
            className="size-[13px] shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        }
        onSelect={() => undefined}
      />
      {state.cut === "serve" && (
        <FloatMenuItem
          label="Zones"
          description="Count and points won per service box"
          chosen={state.chart === "zones"}
          onSelect={() => selectChart("zones")}
        />
      )}

      <FloatMenuNote>
        Zones is available on Serve placement only. The legend follows the
        chart.
      </FloatMenuNote>
    </FloatMenu>
  );
}
