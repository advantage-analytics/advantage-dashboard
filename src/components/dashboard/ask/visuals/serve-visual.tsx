import type { AskServeVisual } from "@/lib/services/ask/events";
import { shareWeights } from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const ZONES = [
  { key: "t", label: "T", color: "var(--viz-you)" },
  { key: "body", label: "Body", color: "var(--viz-you-mid)" },
  { key: "wide", label: "Wide", color: "var(--viz-you-light)" },
] as const;

/**
 * Serve placement: one bar per court, the Home card's recipe — 14px tall, 2px
 * gaps, T, Body and Wide in the three blue steps. Under each bar, the three
 * counts as the query returned them; no total and no share, since neither is
 * a cell of the result.
 */
export function ServeVisual({ visual }: { visual: AskServeVisual }) {
  return (
    <VisualFrame kind="serve" caption={visual.caption}>
      <VisualKey
        items={ZONES.map((zone) => ({ label: zone.label, color: zone.color }))}
      />
      <ul className="m-0 flex max-w-[520px] list-none flex-col gap-3.5 p-0">
        {visual.courts.map((court, index) => {
          const weights = shareWeights(
            ZONES.map((zone) => court[zone.key].value),
          );
          return (
            <li key={index} className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--ink-700)]">
                {court.label}
              </span>
              <span aria-hidden="true" className="flex h-3.5 gap-0.5">
                {weights ? (
                  ZONES.map(
                    (zone, zoneIndex) =>
                      weights[zoneIndex] > 0 && (
                        <span
                          key={zone.key}
                          className="h-full min-w-0 rounded-[var(--radius-cell)]"
                          style={{
                            flexGrow: weights[zoneIndex],
                            flexBasis: 0,
                            background: zone.color,
                          }}
                        />
                      ),
                  )
                ) : (
                  // No serves in any zone: the track, holding none.
                  <span className="h-full flex-1 rounded-[var(--radius-cell)] bg-[var(--ink-100)]" />
                )}
              </span>
              <span className="flex gap-4 text-[11px] text-[var(--ink-500)] tabular-nums">
                {ZONES.map((zone) => (
                  <span key={zone.key}>
                    {zone.label}{" "}
                    <span className="text-[var(--ink-900)]">
                      {court[zone.key].text}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </VisualFrame>
  );
}
