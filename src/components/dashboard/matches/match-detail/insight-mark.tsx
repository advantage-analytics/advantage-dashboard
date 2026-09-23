import Image from "next/image";

/**
 * The engine mark at the size F2 and F3 draw it beside small text: a 16px
 * ink-900 square with the 9×6 swoosh inverted to white (the frame's
 * `logo-mark.svg` is `/logos/logo3.svg` here, as on Home's Focus card). With a
 * `label` the mark is an image that names the engine; without one it is
 * decoration beside the visible credit.
 *
 * Its own file so the report's insight card, its empty state and the pane
 * skeleton (`loading/match-report-pending.tsx`) draw one mark.
 */
export function InsightMark({ label }: { label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--ink-900)]"
    >
      <Image
        src="/logos/logo3.svg"
        alt=""
        width={9}
        height={6}
        className="brightness-0 invert"
        aria-hidden="true"
      />
    </span>
  );
}
