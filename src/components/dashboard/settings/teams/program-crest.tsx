import { getInitials } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * A program's mark: its crest if it has uploaded one, its initials if not.
 *
 * A rounded square, never a circle — the DS keeps the circle for people
 * (`InitialsAvatar`) and puts every other mark on a 6–8px radius square, so a
 * program and a person on the same page never read as the same kind of thing.
 *
 * `<img>` rather than `next/image`: the crest is ≤512 KB by bucket rule and
 * drawn at 38–52px, and `next.config.ts` whitelists no remote image host. The
 * lint rule is `warn`, and the repo disables it inline where a plain image is
 * the right call.
 */
export function ProgramCrest({
  name,
  crestUrl,
  size = 38,
  className,
}: {
  name: string;
  crestUrl: string | null;
  /**
   * 26 in the admin teams table, 38 in a list row, 52 at the head of the
   * identity card, 64 at the head of the admin team page.
   */
  size?: 26 | 38 | 52 | 64;
  className?: string;
}) {
  const box =
    size === 64
      ? "size-[64px]"
      : size === 52
        ? "size-[52px]"
        : size === 38
          ? "size-[38px]"
          : "size-[26px]";
  // 64 is the only size the DS draws on the float radius (12px) rather than the
  // element radius (8px): `.bigcrest` in the admin team page canvas, where the
  // mark is a page-level identity rather than a row's marker.
  const shape =
    size === 64 ? "rounded-[var(--radius-dropdown)]" : "rounded-[8px]";
  const initials =
    size === 64
      ? // The canvas draws 18px here, which is not a step on the DS type scale
        // (`check-design-drift` check 2 fails on it). 16px is the nearest step
        // above and reads the same at 64px.
        "text-[16px] font-semibold text-[var(--ink-700)]"
      : "text-[10px] font-medium tracking-[1px] text-[var(--ink-600)]";

  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512 KB crest at 52px from a public bucket; next/image has no host allow-listed
      <img
        src={crestUrl}
        alt=""
        aria-hidden="true"
        className={cn(
          box,
          shape,
          "shrink-0 bg-[var(--surface-subtle)] object-cover",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        shape,
        initials,
        "flex shrink-0 items-center justify-center bg-[var(--surface-subtle)]",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
