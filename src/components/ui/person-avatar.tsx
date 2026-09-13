import { cn } from "@/lib/utils";

/**
 * A person's circle: their photo when they have one, their initials when not.
 *
 * Size and type scale come from the call site, because the same person is
 * drawn at 22, 24, 26, 36 and 40px across the app and each size already
 * carries its own tuned initials weight.
 *
 * `aria-hidden`: the mark is a glyph for the name beside it, never a second
 * reading of it.
 */
export function PersonAvatar({
  initials,
  photoUrl,
  className,
}: {
  initials: string;
  photoUrl?: string | null;
  /** Size and initials type, e.g. `size-[26px] text-[9px]`. */
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512px photo from a public bucket; next/image has no host allow-listed
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        className={cn(
          "shrink-0 rounded-full bg-[var(--surface-subtle)] object-cover",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] font-medium text-[var(--ink-700)]",
        className,
      )}
    >
      {initials}
    </span>
  );
}
