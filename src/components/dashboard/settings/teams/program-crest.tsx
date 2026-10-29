import { crestLetters } from "@/lib/ui/crest-letters";
import { cn } from "@/lib/utils";

/**
 * A program's mark: its crest if it has uploaded one, its initials if not.
 *
 * A rounded square, never a circle — the DS keeps the circle for people
 * (`InitialsAvatar`) and puts every other mark on a 6–8px radius square, so a
 * program and a person on the same page never read as the same kind of thing.
 *
 * Letters: `crestLetters(shortCode, name)` — the short code when it is 1-3
 * characters, else the name's initials cut to three. The size is fixed per
 * tile (9px at 26, 10px at 38 and 52, 16px at 64) and the tile never wraps,
 * scales or grows to fit them — design "Team crests" rules table (Letter
 * size, Letter count, No wrap in the tile).
 *
 * `<img>` rather than `next/image`: the crest is ≤512 KB by bucket rule and
 * drawn at 38–52px, and `next.config.ts` whitelists no remote image host. The
 * lint rule is `warn`, and the repo disables it inline where a plain image is
 * the right call.
 */
export function ProgramCrest({
  name,
  crestUrl,
  shortCode,
  size = 38,
  className,
}: {
  name: string;
  crestUrl: string | null;
  /** The program's school abbreviation, when known; see `crestLetters`. */
  shortCode?: string | null;
  /**
   * 16 beside a workspace name in an admin table, 26 in the admin teams
   * table, 38 in a list row, 52 at the head of the identity card, 64 at the
   * head of the admin team page.
   */
  size?: 16 | 26 | 32 | 38 | 52 | 64;
  className?: string;
}) {
  const box =
    size === 64
      ? "size-[64px]"
      : size === 52
        ? "size-[52px]"
        : size === 38
          ? "size-[38px]"
          : size === 32
            ? "size-[32px]"
            : size === 26
              ? "size-[26px]"
              : "size-[16px]";
  // 64 is the only size the DS draws on the float radius (12px) rather than the
  // element radius (8px): `.bigcrest` in the admin team page canvas, where the
  // mark is a page-level identity rather than a row's marker.
  // 16 is the admin console's workspace mark (pattern 3 of the redesign): a
  // rounded square at 4px, because 8px on a 16px tile is nearly a circle and
  // the circle belongs to people.
  const shape =
    size === 64
      ? "rounded-[var(--radius-dropdown)]"
      : size === 16
        ? "rounded-[4px]"
        : "rounded-[8px]";
  const initials =
    size === 64
      ? // The canvas draws 18px here, which is not a step on the DS type scale
        // (`check-design-drift` check 2 fails on it). 16px is the nearest step
        // above and reads the same at 64px.
        "text-[16px] font-semibold text-[var(--ink-700)]"
      : size === 16
        ? "text-[8px] font-semibold text-[var(--ink-600)]"
        : size === 26
          ? "text-[9px] font-medium tracking-[0.2px] text-[var(--ink-600)]"
          : "text-[10px] font-medium tracking-[1px] text-[var(--ink-600)]";

  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512 KB crest at 52px from a public bucket; next/image has no host allow-listed
      <img
        decoding="async"
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
        "flex flex-none items-center justify-center overflow-hidden bg-[var(--surface-subtle)] leading-none whitespace-nowrap",
        className,
      )}
    >
      {/* One letter at 16px: three never fit a tile that small. */}
      {size === 16
        ? crestLetters(shortCode, name).slice(0, 1)
        : crestLetters(shortCode, name)}
    </span>
  );
}
