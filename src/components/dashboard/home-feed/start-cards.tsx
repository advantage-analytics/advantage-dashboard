import Link from "next/link";
import { RowChevron } from "./home-title";

export type StartArt = "court" | "roster" | "ask";

export interface StartCard {
  href: string;
  title: string;
  body: string;
  art: StartArt;
}

/** The drawings, exported for the match rows' still fallback. */
export const START_ART: Record<StartArt, React.JSX.Element> = {
  court: (
    <svg
      viewBox="8 24 304 133"
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path
        d="M114.1 40H205.9L270 138H50Z"
        fill="var(--ink-200)"
        fillOpacity="0.75"
      />
      <path
        d="M125.6 40 77.5 138M194.4 40 242.5 138M120 51.4H200M97.6 97H222.4M160 51.4V97M160 40v2.4M160 138v-3.5"
        stroke="var(--surface-card)"
        strokeWidth="1.5"
      />
      <polygon
        points="84.5,69.2 235.5,69.2 235.5,56.2 160,58 84.5,56.2"
        fill="var(--ink-300)"
        fillOpacity="0.45"
      />
      <path
        d="M84.5 56.2 160 58 235.5 56.2M84.5 55.7V70M235.5 55.7V70"
        stroke="var(--ink-400)"
        strokeWidth="1.25"
      />
    </svg>
  ),
  roster: (
    <svg viewBox="0 0 220 96" fill="none" strokeLinecap="round">
      <circle cx="62" cy="24" r="8" fill="var(--ink-200)" />
      <rect
        x="80"
        y="21.5"
        width="78"
        height="5"
        rx="2.5"
        fill="var(--ink-300)"
      />
      <circle cx="62" cy="48" r="8" fill="var(--ink-200)" />
      <rect
        x="80"
        y="45.5"
        width="60"
        height="5"
        rx="2.5"
        fill="var(--ink-300)"
      />
      <circle
        cx="62"
        cy="72"
        r="7.4"
        stroke="var(--blue)"
        strokeWidth="1.2"
        strokeDasharray="3 2.4"
      />
      <path
        d="M62 68.4v7.2M58.4 72h7.2"
        stroke="var(--blue)"
        strokeWidth="1.5"
      />
      <rect
        x="80"
        y="69.5"
        width="68"
        height="5"
        rx="2.5"
        fill="var(--blue)"
        fillOpacity="0.7"
      />
    </svg>
  ),
  ask: (
    <svg viewBox="0 0 220 96" fill="none" strokeLinecap="round">
      <path
        d="M111 10H185a7 7 0 0 1 7 7V28a2 2 0 0 1-2 2H111a7 7 0 0 1-7-7V17a7 7 0 0 1 7-7z"
        fill="var(--surface-subtle)"
        stroke="var(--ink-200)"
        strokeWidth="0.75"
      />
      <rect
        x="114"
        y="17.5"
        width="68"
        height="5"
        rx="2.5"
        fill="var(--ink-500)"
      />
      <rect x="28" y="40" width="9" height="9" rx="2" fill="var(--ink-900)" />
      <rect
        x="44"
        y="42"
        width="96"
        height="5"
        rx="2.5"
        fill="var(--ink-300)"
      />
      <rect
        x="44"
        y="52"
        width="70"
        height="5"
        rx="2.5"
        fill="var(--ink-200)"
      />
      <rect
        x="28"
        y="70"
        width="164"
        height="18"
        rx="3.5"
        fill="#FFFFFF"
        stroke="var(--ink-200)"
      />
      <rect
        x="36"
        y="76.5"
        width="54"
        height="5"
        rx="2.5"
        fill="var(--ink-200)"
      />
      <rect x="176" y="73" width="12" height="12" rx="2.5" fill="var(--blue)" />
      <path
        d="M182 81.1v-4.2M180.3 78.6 182 76.9l1.7 1.7"
        stroke="#FFFFFF"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const CARD =
  "surface-card group transition-shadow duration-[var(--duration-hover)] hover:shadow-[var(--shadow-card-emphasis)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/**
 * The two or three things worth doing, each a whole-card link with a drawing
 * over the words. They hold the lead slot beside the pilot card at every
 * stage of a workspace's life.
 */
export function StartCards({ cards }: { cards: StartCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section
      aria-label="Quick actions"
      className="grid h-full gap-5"
      style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}
    >
      {cards.map((card) => (
        <Link
          key={card.title}
          href={card.href}
          className={`${CARD} flex flex-col px-2 pt-2 pb-0`}
        >
          <div
            aria-hidden
            className="grid min-h-[120px] flex-1 place-items-center overflow-hidden rounded-[var(--radius-element)] bg-[var(--surface-page)] transition-colors duration-[var(--duration-hover)] group-hover:bg-[var(--surface-subtle)] group-focus-visible:bg-[var(--surface-subtle)] [&>svg]:h-auto [&>svg]:w-[72%]"
          >
            {START_ART[card.art]}
          </div>
          {/* The sentence wraps to two lines at most and always holds room
              for two, so the three cards stay level; the chevron rides the
              title line. */}
          <div className="flex flex-col gap-0.5 px-3 pt-3 pb-3.5">
            <span className="flex items-center justify-between gap-3">
              <b className="text-[13px] font-medium text-[var(--ink-900)]">
                {card.title}
              </b>
              <RowChevron />
            </span>
            <span className="line-clamp-2 min-h-8 text-[12px] leading-4 text-[var(--ink-600)]">
              {card.body}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
