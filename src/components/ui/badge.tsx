import { cn } from "@/lib/utils";

export type BadgeVariant = "blue" | "neutral";

const TONE: Record<BadgeVariant, string> = {
  blue: "var(--blue)",
  neutral: "var(--ink-500)",
};

/**
 * Bare tracked uppercase text — a label, no container.
 *
 * ── `win` and `loss` are retired ───────────────────────────────────────────
 * This used to be the WORD register of the outcome vocabulary ("Won" / "Lost"
 * under a labelled Result column), paired with `ResultMark`'s glyph register
 * for headerless rows. **The product now runs one outcome register, and it is
 * the glyph.** Two registers meant the same fact wore two faces depending on
 * the page, and the split was invisible in review because each table looked
 * right on its own — Matches drifted to the glyph, Schedule kept the word, and
 * the two lists a coach moves between stopped matching.
 *
 * The variants are gone from the type rather than merely unused, so a future
 * `<Badge variant="win">` does not typecheck. Match outcomes go through
 * `ResultMark` — a labelled Result column is no longer the trigger for a word.
 *
 * What is left is the non-outcome label the design system still draws:
 * `<Badge variant="blue">Pro</Badge>`. Green and red do not belong here at all
 * — they are reserved for winning and losing, which this no longer says.
 *
 * Colour goes in `style`, not a Tailwind utility. Callers pair this with DS
 * type classes, which are loaded unlayered and beat `text-[var(--…)]` outright.
 */
export function Badge({
  variant = "neutral",
  children,
  className,
  style,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] leading-none font-medium tracking-[2.5px] whitespace-nowrap uppercase",
        className,
      )}
      style={{ color: TONE[variant], ...style }}
    >
      {children}
    </span>
  );
}
