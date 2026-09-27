import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { ReactNode, MouseEvent } from "react";
import { ASYMMETRIC_SERVES, servePoint } from "./viz-serve-points";
import { RALLY_POINTS } from "./viz-rally-points";

export const points = [
  servePoint({ id: "p1" }),
  servePoint({ id: "p2", player1: false }),
];

export function useMatchData() {
  return {
    points: window.location.search.includes("fixture=long")
      ? [...ASYMMETRIC_SERVES, ...RALLY_POINTS]
      : window.location.search.includes("fixture=watch")
        ? [
            { ...servePoint({ id: "timed-point" }), videoTime: 42 },
            servePoint({ id: "untimed-point", lateral: 1.9 }),
          ]
        : points,
  };
}

export function useMatchSides() {
  return {
    you: { isPlayer1: true, name: "Avery" },
    opp: { isPlayer1: false, name: "Blake" },
  };
}

export function Link({
  href,
  onClick,
  children,
  ...props
}: {
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          window.history.pushState(null, "", href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }}
      {...props}
    >
      {children}
    </a>
  );
}
export default Link;

export function savedViewNamePool() {
  return [];
}
export function ManageableSavedViewTile() {
  return null;
}
export function SaveViewDialog() {
  return null;
}
export async function deleteSavedView() {
  return { ok: false };
}
export async function duplicateSavedView() {
  return { ok: false };
}
export async function renameSavedView() {
  return { ok: false };
}
export async function reorderSavedViews() {
  return { ok: false };
}
export async function restoreSavedView() {
  return { ok: false };
}
export async function setSavedViewShared() {
  return { ok: false };
}

export function useVizBands() {
  return { bands: DEFAULT_BANDS, unit: "ft" as const };
}
