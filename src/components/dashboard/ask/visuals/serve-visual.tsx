import type { CSSProperties } from "react";
import type { AskServeVisual, AskSourceMatch } from "@/lib/services/ask/events";
import { serveZoneVideoHref } from "@/lib/services/ask/figure-video";
import { ServeCourt, SERVE_ZONE_COLORS } from "./serve-court";
import {
  SERVE_ZONES,
  type ServeCourtSide,
  type ServeZoneKey,
  serveCourtSides,
  shareWeights,
} from "./visual-geometry";
import { VisualFrame, VisualKey } from "./visual-frame";

const ZONE_LABEL = { t: "T", body: "Body", wide: "Wide" } as const;

/** The block's zone keys as the Video filter spells them. */
const FILTER_ZONE: Record<ServeZoneKey, "T" | "Body" | "Wide"> = {
  t: "T",
  body: "Body",
  wide: "Wide",
};

/**
 * Serve placement. With exactly two courts labelled Deuce and Ad it is the
 * court itself (`ServeCourt`): each zone's share of that court's serves
 * standing in its own third of the service box. With any other labelling —
 * "All serves", "First serves" and "Second serves" — it is one bar per
 * court, the Home card's recipe: 14px tall, 2px gaps, T, Body and Wide in
 * the three blue steps.
 *
 * Beside each court's label either way, right-aligned as the Home strip
 * sets them, the three counts as the query returned them; no total and no
 * share, since neither is a cell of the result.
 *
 * Over one source match, when the block says whose serves these are
 * (`server`), each drawn zone opens that match's film on that side's
 * serves into the zone from that court (`figure-video.ts`).
 */
export function ServeVisual({
  visual,
  sources,
}: {
  visual: AskServeVisual;
  sources?: readonly AskSourceMatch[] | null;
}) {
  const sides = serveCourtSides(visual.courts);
  const server = visual.server;
  const matchId = sources?.length === 1 ? sources[0].matchId : null;
  const href =
    server && matchId
      ? (side: ServeCourtSide, zone: ServeZoneKey) =>
          serveZoneVideoHref(matchId, server, side, FILTER_ZONE[zone])
      : undefined;
  return (
    <VisualFrame kind="serve" caption={visual.caption}>
      <VisualKey
        items={SERVE_ZONES.map((zone) => ({
          label: ZONE_LABEL[zone],
          color: SERVE_ZONE_COLORS[zone],
        }))}
      />
      {sides && <ServeCourt courts={visual.courts} sides={sides} href={href} />}
      <ul className="m-0 flex max-w-[520px] list-none flex-col gap-3.5 p-0">
        {visual.courts.map((court, index) => {
          const weights = shareWeights(
            SERVE_ZONES.map((zone) => court[zone].value),
          );
          return (
            <li key={index} className="flex flex-col gap-1.5">
              <span className="flex items-baseline">
                <span className="text-[12px] text-[var(--ink-600)]">
                  {court.label}
                </span>
                <span
                  data-ask-after=""
                  style={{ "--ask-row": index + 2 } as CSSProperties}
                  className="ml-auto flex gap-3.5 pl-4 text-[11px] text-[var(--ink-500)] tabular-nums"
                >
                  {SERVE_ZONES.map((zone) => (
                    <span key={zone}>
                      {ZONE_LABEL[zone]}{" "}
                      <span className="text-[12px] text-[var(--ink-900)]">
                        {court[zone].text}
                      </span>
                    </span>
                  ))}
                </span>
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
            </li>
          );
        })}
      </ul>
    </VisualFrame>
  );
}
