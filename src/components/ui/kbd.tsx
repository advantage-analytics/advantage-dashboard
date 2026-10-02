import { cn } from "@/lib/utils";

type KbdSize = "xs" | "sm" | "md";
type KbdVariant = "raised" | "flat";

const SIZE_CLASSES: Record<KbdSize, string> = {
  xs: "min-w-[18px] h-[18px] px-[5px] text-[10px] rounded-[5px]",
  sm: "min-w-[16px] h-[16px] px-1 text-[10px] rounded-[3px]",
  md: "min-w-[24px] h-[24px] px-1.5 text-[11px] rounded-[5px]",
};

/**
 * `raised` is the help page's keycap — bordered, on the raised surface.
 * `flat` is the search palette's: no border, the subtle fill, muted ink, so a
 * row of them reads as hints rather than as buttons. Both here so the two
 * treatments sit side by side and stay deliberate; the palette used to keep
 * its own `<kbd>` and the two drifted without anyone deciding they should.
 */
const VARIANT_CLASSES: Record<KbdVariant, string> = {
  raised:
    "bg-[var(--color-surface-raised)] border border-[var(--color-ink-200)] text-[var(--color-ink-700)]",
  flat: "bg-[var(--surface-subtle)] text-[var(--ink-500)]",
};

export function Kbd({
  children,
  size = "md",
  variant = "raised",
  mono = false,
  className,
}: {
  children: React.ReactNode;
  size?: KbdSize;
  variant?: KbdVariant;
  /** Prefix glyphs are machine values; the DS sets those in mono. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        "leading-none font-medium",
        mono ? "font-mono" : "font-sans",
        "shadow-[0_1px_0_var(--color-shadow-keycap)]",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </kbd>
  );
}
