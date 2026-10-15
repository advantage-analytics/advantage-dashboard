import type { CSSProperties } from "react";
import type { AskServeVisual } from "@/lib/services/ask/events";
import { ServeCourt, SERVE_ZONE_COLORS } from "./serve-court";
import { SERVE_ZONES, serveCourtSides, shareWeights } from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const ZONE_LABEL = { t: "T", body: "Body", wide: "Wide" } as const;

/**
 * Serve placement. With exactly two courts labelled Deuce and Ad it is the
 * court itself (`ServeCourt`): each zone's share of that court's serves
 * standing in its own third of the service box. With any other labelling —
 * "All serves", "First serves" and "Second serves" — it is one bar per
 * court, the Home card's recipe: 14px tall, 2px gaps, T, Body and Wide in
 * the three blue steps.
 *
 * Under each court either way, the three counts as the query returned them;
 * no total and no share, since neither is a cell of the result.
 */
export function ServeVisual({ visual }: { visual: AskServeVisual }) {
  const sides = serveCourtSides(visual.courts);
  return (
    <VisualFrame kind="serve" caption={visual.caption}>
      <VisualKey
        items={SERVE_ZONES.map((zone) => ({
          label: ZONE_LABEL[zone],
          color: SERVE_ZONE_COLORS[zone],
        }))}
      />
      {sides && <ServeCourt courts={visual.courts} sides={sides} />}
      <ul className="m-0 flex max-w-[520px] list-none flex-col gap-3.5 p-0">
        {visual.courts.map((court, index) => {
          const weights = shareWeights(
            SERVE_ZONES.map((zone) => court[zone].value),
          );
          return (
            <li key={index} className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--ink-700)]">
                {court.label}
              </span>
              {!sides && (
                <span aria-hidden="true" className="flex h-3.5 gap-0.5">
                  {weights ? (
                    SERVE_ZONES.map(
                      (zone, zoneIndex) =>
                        weights[zoneIndex] > 0 && (
                          <span
                            key={zone}
                            data-ask-grow=""
                            className="h-full min-w-0 rounded-[var(--radius-cell)]"
                            style={
                              {
                                flexGrow: weights[zoneIndex],
                                flexBasis: 0,
                                background: SERVE_ZONE_COLORS[zone],
                                "--ask-row": index + zoneIndex,
                              } as CSSProperties
                            }
                          />
                        ),
                    )
                  ) : (
                    // No serves in any zone: the track, holding none.
                    <span className="h-full flex-1 rounded-[var(--radius-cell)] bg-[var(--ink-100)]" />
                  )}
                </span>
              )}
              <span
                data-ask-after=""
                style={{ "--ask-row": index + 2 } as CSSProperties}
                className="flex gap-4 text-[11px] text-[var(--ink-500)] tabular-nums"
              >
                {SERVE_ZONES.map((zone) => (
                  <span key={zone}>
                    {ZONE_LABEL[zone]}{" "}
                    <span className="text-[var(--ink-900)]">
                      {court[zone].text}
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
