"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Swords } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { cn } from "@/lib/utils";

type EventKind = "dual" | "tournament";

/**
 * The bracket mark for Tournament.
 *
 * Lucide has no draw/bracket glyph — `trophy` is the nearest, and a trophy is a
 * result rather than a structure, which is exactly the wrong thing to promise
 * beside "Players entered into draws". So this is the design's own 15×15 path,
 * inlined. It is a mark, not an icon set defection: stroke width and cap match
 * every Lucide glyph beside it, and it inherits `currentColor` so selection
 * turns it blue with the rest of the card.
 */
function BracketMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.875 1.875H5V5.625H1.875M5 3.75H9.375V11.25H5M9.375 7.5H13.75M1.875 9.375H5V13.125H1.875"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const OPTIONS: {
  id: EventKind;
  label: string;
  blurb: string;
  href: string;
}[] = [
  {
    id: "dual",
    label: "Dual match",
    blurb:
      "Six singles and three doubles against one opponent, shared under one event.",
    href: "/dashboard/team/schedule/new/dual",
  },
  {
    id: "tournament",
    label: "Tournament",
    blurb:
      "Players entered into draws; matches get added by round as they're played.",
    href: "/dashboard/team/schedule/new/tournament",
  },
];

/**
 * 3b — the New event chooser.
 *
 * Two cards, because the dropdown it replaces had to state the difference
 * between a dual and a tournament in a label and a keycap, and the difference
 * is what each one CREATES: nine named lines under one team score, or a field
 * of entries whose matches arrive round by round. A card has room to say that
 * before the coach commits to a form.
 *
 * A single match sits below the pair rather than as a third card on purpose —
 * it mints no event and no lineup, and it never touches a team score, which is
 * the same rule the dropdown drew a hairline for.
 */
export function NewEventChooser() {
  const router = useRouter();
  // Dual is the pre-selection, not a blank slate: it is far and away the common
  // answer, and Continue with nothing chosen is a dead button asking a question
  // the page already framed.
  const [choice, setChoice] = useState<EventKind>("dual");

  const selected =
    OPTIONS.find((option) => option.id === choice) ?? OPTIONS[0];

  return (
    <EventShell
      crumb="New event"
      footer={
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            onClick={() => router.push("/dashboard/team/schedule")}
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            {choice === "dual" ? "Dual selected" : "Tournament selected"}
          </span>
          <button
            type="button"
            className={advButton("primary", "md")}
            onClick={() => router.push(selected.href)}
          >
            Continue
          </button>
        </>
      }
    >
      <div className="flex min-h-full flex-col justify-center">
        <span className="eyebrow">New event</span>
        <h1 className="mt-[9px] text-[30px] font-light leading-[34px] tracking-[-0.6px] text-[var(--ink-900)]">
          What are you adding?
        </h1>
        <p
          className="mt-2 max-w-[560px] text-[13px]"
          style={{ color: "var(--ink-600)" }}
        >
          Both are events the team shows up to — they hold a date, a site and
          the matches played under them.
        </p>

        <div
          role="radiogroup"
          aria-label="What are you adding?"
          className="mt-7 grid max-w-[820px] grid-cols-2 gap-5"
        >
          {OPTIONS.map((option) => {
            const active = choice === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(option.id)}
                className={cn(
                  "flex cursor-pointer flex-col gap-3.5 rounded-[var(--radius-card)] border px-[26px] pb-[22px] pt-7 text-left",
                  "transition-colors duration-[var(--duration-fast)]",
                  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  active
                    ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                    : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={
                      active ? "text-[var(--blue)]" : "text-[var(--ink-700)]"
                    }
                  >
                    {option.id === "dual" ? (
                      <Swords
                        strokeWidth={1.5}
                        className="size-[22px]"
                        aria-hidden="true"
                      />
                    ) : (
                      <BracketMark />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                      active
                        ? "border-transparent bg-[var(--blue)]"
                        : "border-[var(--ink-300)]"
                    )}
                    aria-hidden="true"
                  >
                    {active ? (
                      <Check
                        strokeWidth={2.5}
                        className="size-[9px] text-white"
                      />
                    ) : null}
                  </span>
                </span>

                <span className="flex flex-col gap-1.5">
                  <span className="text-[16px] text-[var(--ink-900)]">
                    {option.label}
                  </span>
                  <span className="text-body-sm max-w-[42ch] text-pretty">
                    {option.blurb}
                  </span>
                </span>

                <span
                  className={cn(
                    "mt-auto block border-t pt-3.5",
                    active
                      ? "border-[var(--blue-tint-12)]"
                      : "border-[var(--border-hairline)]"
                  )}
                >
                  {/* `tabular` and not `mono`: the design marks the 9 as a
                      machine value, but Roboto Mono is reserved for timestamps,
                      quota readouts and job ids — never a count inside a
                      sentence. The dual form's own footer already reads this
                      way. */}
                  <span className="text-micro">
                    {option.id === "dual" ? (
                      <>
                        Creates <span className="tabular">9</span> lines · one
                        team score
                      </>
                    ) : (
                      <>Creates entries · draws by round</>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex max-w-[820px] flex-wrap items-center gap-2">
          <span className="text-micro" style={{ color: "var(--ink-600)" }}>
            One player&apos;s own match — a challenge, practice set or outside
            entry — isn&apos;t an event.
          </span>
          {/* The design says "Add it in Matches". A team workspace has no
              Matches destination in its rail — it has Schedule — so the label
              names the thing rather than a page that is not there, and points
              at the single-match flow that already exists. */}
          <Link
            href="/dashboard/team/schedule/new/single"
            className="rounded-[var(--radius-element)] text-[11px] font-medium text-[var(--blue-text)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Add a single match
          </Link>
        </div>
      </div>
    </EventShell>
  );
}
