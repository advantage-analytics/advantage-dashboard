import { Calendar, MapPin } from "lucide-react";
import {
  formatEventDatesLong,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { cn } from "@/lib/utils";
import type { EventDetail } from "@/lib/schedule/types";

/**
 * An event's facts as one nowrap glyph row — date, venue, court surface — in
 * the Schedule drawer's register: `text-micro` (11px ink-500), 12px glyphs in
 * ink-400 at stroke 1.5, 5px from their text, 12px between facts, and the
 * product's own court glyph rather than a near-miss Lucide icon.
 *
 * Shared by the drawer and the dual's event page, so the two spell one event's
 * facts identically. No `"use client"`: the page is a server component.
 */
export function EventGlyphRow({
  event,
  className,
}: {
  event: EventDetail["event"];
  className?: string;
}) {
  // The pin names where the event is. A dual's host is its venue when the
  // builder recorded one; otherwise the side of the trip is all we know.
  const venue =
    event.kind === "dual"
      ? (event.host ?? siteTitle(event.site))
      : siteTitle(event.site);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-nowrap items-center gap-3 overflow-hidden",
        className,
      )}
    >
      <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
        <Calendar
          className="size-3"
          strokeWidth={1.5}
          style={{ color: "var(--ink-400)" }}
          aria-hidden="true"
        />
        <span className="tabular">
          {formatEventDatesLong(event.startsOn, event.endsOn)}
        </span>
      </span>
      <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
        <MapPin
          className="size-3"
          strokeWidth={1.5}
          style={{ color: "var(--ink-400)" }}
          aria-hidden="true"
        />
        {venue}
      </span>
      {event.surface ? (
        <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG in /public */}
          <img
            src="/icons/tennis-court-icon.svg"
            alt=""
            className="block size-3 opacity-90"
          />
          {surfaceTitle(event.surface)}
        </span>
      ) : null}
    </div>
  );
}
