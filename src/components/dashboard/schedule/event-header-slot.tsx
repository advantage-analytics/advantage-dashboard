"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePublishHeaderSlot } from "@/components/dashboard/header-slot";
import type { EventDetail } from "@/lib/schedule/types";

const SCHEDULE_HREF = "/dashboard/team/schedule";

/**
 * The header trail for everything under one event:
 *
 *   /schedule/<id>          Schedule › vs Stanford
 *   /schedule/<id>/edit     Schedule › vs Stanford › Edit
 *   /schedule/<id>/score    Schedule › vs Stanford › Add score
 *   /upload?entry=<line>    Schedule › vs Stanford › Upload video
 *
 * The header cannot name the event itself — it is a client component and the
 * name comes from the page's server read — so the page publishes the trail
 * through `header-slot.tsx`, the player profile's mechanism. The header holds
 * the slot empty on these routes until this lands (`EVENT_PAGE` in
 * `header.tsx`), so the bare "Schedule" crumb never flashes first.
 *
 * Every crumb but the last links, and the last is ink-900 — the header's own
 * trail grammar, restated here because a published slot draws its own markup.
 * The event's crumb links back to the event page from its flows.
 */
export type EventCrumb = { label: string; href?: string };

/**
 * The crumbs `EventHeaderSlot` draws, as data, so the trail is pinned by a spec
 * without rendering a client component. A dual's crumb is "vs <opponent>", a
 * tournament's its bare name; the event crumb links only when a leaf follows,
 * because on the event page itself it is the page you are on.
 */
export function eventTrail({
  eventId,
  name,
  kind,
  leaf,
}: {
  eventId: string;
  name: string;
  kind: EventDetail["event"]["kind"];
  leaf?: string;
}): EventCrumb[] {
  const eventCrumb: EventCrumb = {
    label: kind === "dual" ? `vs ${name}` : name,
  };
  if (leaf) eventCrumb.href = `${SCHEDULE_HREF}/${eventId}`;
  return [
    { label: "Schedule", href: SCHEDULE_HREF },
    eventCrumb,
    ...(leaf ? [{ label: leaf }] : []),
  ];
}

export function EventHeaderSlot({
  eventId,
  name,
  kind,
  leaf,
}: {
  eventId: string;
  name: string;
  kind: EventDetail["event"]["kind"];
  /** The flow screen's word ("Edit", "Add score", "Upload video"); omitted on the event page. */
  leaf?: string;
}) {
  const node = useMemo(() => {
    const crumbs = eventTrail({ eventId, name, kind, leaf });

    return (
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-0.5 text-[11px] font-normal"
      >
        {crumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[#CCCCCC]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="shrink-0 text-[#888888] transition-colors duration-200 hover:text-[#525252]"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-[#0D0D0D]">
                {crumb.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>
    );
  }, [eventId, name, kind, leaf]);

  usePublishHeaderSlot(node);
  return null;
}
