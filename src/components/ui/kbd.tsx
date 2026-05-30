import { cn } from "@/lib/utils";

type KbdSize = "sm" | "md";

const SIZE_CLASSES: Record<KbdSize, string> = {
  sm: "min-w-[16px] h-[16px] px-1 text-[10px] rounded-[3px]",
  md: "min-w-[24px] h-[24px] px-1.5 text-[11px] rounded-[5px]",
};

export function Kbd({
  children,
  size = "md",
}: {
  children: React.ReactNode;
  size?: KbdSize;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center",
        "bg-[var(--color-surface-raised)]",
        "border border-[var(--color-ink-200)]",
        "font-medium text-[var(--color-ink-700)]",
        "leading-none font-sans",
        "shadow-[0_1px_0_var(--color-shadow-keycap)]",
        SIZE_CLASSES[size],
      )}
    >
      {children}
    </kbd>
  );
}
