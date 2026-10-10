import { isServeStroke, type LabelStroke } from "@/lib/services/labels/session";
import type { ShotPlacement } from "@/lib/services/labels/shot-derived";
import {
  COURT_LENGTH,
  NET_Y,
  SINGLES_HALF_WIDTH,
  halfOf,
} from "./court-geometry";

/**
 * The words a shot row's position and placement cells answer hover with. Pure,
 * in the labels' court frame (court-geometry.ts): `x` metres about the centre
 * line, `y` metres from the near baseline. Left and right are the camera's,
 * the same way the court panel draws them. The cell already prints the raw
 * numbers, so the tooltip says them in court terms instead of repeating them.
 */

/** The court's service line, metres from the net. */
const SERVICE_LINE_FROM_NET = 6.4;
/** Serve placement's bucket edges, metres from the centre line (court.ts). */
const T_EDGE = 1.37;
const BODY_EDGE = 2.74;
/** A rally landing this close to the centre line is Middle (court.ts). */
const MIDDLE_EDGE = 1.0;

const m = (n: number) => `${Math.abs(n).toFixed(2)} m`;

/** "1.42 m right of centre", or "on the centre line". */
export function acrossWords(x: number): string {
  if (Math.abs(x) < 0.005) return "on the centre line";
  return `${m(x)} ${x > 0 ? "right" : "left"} of centre`;
}

/** "0.65 m behind the near baseline", "in the far service box, 3.10 m from the net". */
export function depthWords(y: number): string {
  const half = halfOf(y);
  const fromBaseline = half === "near" ? y : COURT_LENGTH - y;
  const fromNet = Math.abs(y - NET_Y);
  if (fromBaseline < 0) return `${m(fromBaseline)} behind the ${half} baseline`;
  if (fromNet <= SERVICE_LINE_FROM_NET) {
    return `in the ${half} service box, ${m(fromNet)} from the net`;
  }
  return `${m(fromBaseline)} inside the ${half} baseline`;
}

export interface PositionWords {
  label: string;
  detail: string[];
}

/**
 * A position cell's tooltip. The label is the spot in court terms ("Hit 0.65 m
 * behind the near baseline"); the detail is how far off centre, then what a
 * click does.
 */
export function positionWords(
  end: "hit" | "landed",
  x: number | null,
  y: number | null,
  editable: boolean,
): PositionWords {
  const verb = end === "hit" ? "Hit" : "Landed";
  if (x === null || y === null) {
    return {
      label: end === "hit" ? "No contact point yet" : "No landing yet",
      detail: editable
        ? [
            end === "hit"
              ? "Click, then click the court where it was hit"
              : "Click, then click the court where it bounced",
          ]
        : [],
    };
  }
  const across = acrossWords(x);
  return {
    label: `${verb} ${depthWords(y)}`,
    detail: [
      Math.abs(x) > SINGLES_HALF_WIDTH
        ? `${capitalise(across)}, outside the singles line`
        : capitalise(across),
      ...(editable ? ["Click to move it on the court"] : []),
    ],
  };
}

/** The placement cell's tooltip: the bucket, then the rule that chose it. */
export function placementWords(
  placement: ShotPlacement,
  shot: {
    stroke: LabelStroke | null;
    contactX: number | null;
    landingX: number | null;
  },
): PositionWords {
  const { contactX, landingX } = shot;
  if (landingX === null) return { label: placement, detail: [] };
  if (isServeStroke(shot.stroke)) {
    const from = m(landingX);
    const rule =
      placement === "T"
        ? `T is within ${T_EDGE} m`
        : placement === "Body"
          ? `Body is ${T_EDGE}–${BODY_EDGE} m`
          : `Wide is past ${BODY_EDGE} m`;
    return {
      label: `${placement} serve`,
      detail: [`Bounced ${from} from the centre line. ${rule}`],
    };
  }
  if (placement === "Middle") {
    return {
      label: "Middle",
      detail: [
        `Bounced ${m(landingX)} from the centre line. Anything within ${MIDDLE_EDGE.toFixed(0)} m is middle`,
      ],
    };
  }
  const hitSide = contactX === null ? null : contactX > 0 ? "right" : "left";
  const landSide = landingX > 0 ? "right" : "left";
  return {
    label: placement,
    detail: [
      hitSide === null
        ? `Landed ${landSide} of centre`
        : `Hit ${hitSide} of centre, landed ${landSide}`,
      placement === "Crosscourt"
        ? "The ball crossed the centre line"
        : "The ball stayed on the hitter's side",
    ],
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
