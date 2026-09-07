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
  /** 38 in a list row, 52 at the head of the identity card. */
  size?: 38 | 52;
  className?: string;
}) {
  const box = size === 52 ? "size-[52px]" : "size-[38px]";

  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512 KB crest at 52px from a public bucket; next/image has no host allow-listed
      <img
        src={crestUrl}
        alt=""
        aria-hidden="true"
        className={cn(
          box,
          "shrink-0 rounded-[8px] bg-[var(--surface-subtle)] object-cover",
          className
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-subtle)] text-[10px] font-medium tracking-[1px] text-[var(--ink-600)]",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
