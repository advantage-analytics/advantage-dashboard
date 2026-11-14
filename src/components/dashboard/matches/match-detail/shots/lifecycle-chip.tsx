import type { ReactNode } from "react";

/** The tab's lifecycle-chip switch — the wall's `Default | Saved` and
 *  `You | Opponent`, the lightbox's `You | Opponent` and `Points |
 *  Statistics` (DS Data Table rule 7):
 *  26px, hairline at rest, `--border-medium` + subtle wash when pressed. */
export function LifecycleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-[26px] cursor-pointer items-center rounded-[var(--radius-pill)] px-[11px] text-[12px] whitespace-nowrap transition-colors duration-200 motion-reduce:transition-none ${
        pressed ? "" : "hover:bg-[var(--surface-subtle)]"
      }`}
      style={{
        border: `1px solid var(${pressed ? "--border-medium" : "--border-hairline"})`,
        background: pressed ? "var(--surface-subtle)" : undefined,
        color: pressed ? "var(--ink-900)" : "var(--ink-600)",
        fontWeight: pressed ? 500 : 400,
      }}
    >
      {children}
    </button>
  );
}
