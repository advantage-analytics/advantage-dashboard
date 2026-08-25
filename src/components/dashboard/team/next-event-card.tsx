import Link from "next/link";
import { Calendar } from "lucide-react";
import { formatEventDay } from "@/lib/schedule/format";
import type { TeamNextEvent } from "@/lib/data/team-home-server";

/**
 * 44a — the top of the right column: what is next.
 *
 * The smallest card on the page, and deliberately: a coach glancing right wants
 * the fixture and the day, and everything else about it is a click away on the
 * event page. No lineup, no countdown, no site — the schedule owns those, and
 * a second summary of an event is a second thing to keep true.
 *
 * **It renders or it does not.** `nextEvent` is null for a program with nothing
 * on the schedule from today onwards — which is every program on its first
 * morning and any program in the off-season — and this mounts nothing at all
 * for it: no empty card, no "nothing scheduled", no dashed placeholder. The
 * checklist in the main column is what asks a program with no schedule to make
 * one; saying it twice would make the page nag.
 *
 * The `<Fact>` shape, the icon size and the eyebrow are the dual sheet's, which
 * is the other card on this page that names an event.
 */
export function NextEventCard({ event }: { event: TeamNextEvent | null }) {
  if (!event) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)] px-5 pt-4 pb-[18px]">
      <h2 className="eyebrow">Next</h2>

      {/* A dual's `program_events.name` is the opponent school, so it reads as
          a fixture rather than as a name standing on its own — the same "vs"
          the dual sheet's heading puts in front of the same column. A
          tournament's name is the event's own title and takes no preposition. */}
      <p className="mt-2">
        <Link
          href={`/dashboard/team/schedule/${event.id}`}
          className="text-title rounded-[var(--radius-cell)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]"
        >
          {event.kind === "dual" ? `vs ${event.name}` : event.name}
        </Link>
      </p>

      <span className="mt-1.5 flex items-center gap-2 text-[12px] text-[var(--ink-700)]">
        <Calendar
          className="size-3.5 shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden
        />
        {formatEventDay(event.startsOn)}
      </span>
    </section>
  );
}
