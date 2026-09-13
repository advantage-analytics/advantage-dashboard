import type { ComponentPropsWithRef } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = ComponentPropsWithRef<"button"> & { engaged?: boolean };

/** Shared by interactive toolbars and their inert loading counterparts. */
function Trigger({ engaged = false, className, style, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-150",
        !engaged && "hover:bg-[var(--surface-subtle)]",
        className,
      )}
      style={{
        background: engaged ? "var(--surface-subtle)" : undefined,
        color: engaged ? "var(--ink-900)" : "var(--ink-600)",
        fontWeight: engaged ? 500 : 400,
        ...style,
      }}
    />
  );
}

export function FilterTrigger({ engaged = false, ...props }: Props) {
  return (
    <Trigger {...props} engaged={engaged}>
      <SlidersHorizontal
        className="size-3.5"
        strokeWidth={1.5}
        style={{ color: engaged ? "var(--ink-700)" : "var(--ink-500)" }}
        aria-hidden="true"
      />
      Filters
    </Trigger>
  );
}

export function SortTrigger({ engaged = false, children, ...props }: Props) {
  return (
    <Trigger {...props} engaged={engaged}>
      {children}
      <ChevronDown
        className="size-3"
        strokeWidth={1.5}
        style={{ color: engaged ? "var(--ink-500)" : "var(--ink-400)" }}
        aria-hidden="true"
      />
    </Trigger>
  );
}
