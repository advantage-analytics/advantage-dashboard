import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-[var(--border-field)] bg-transparent px-3 py-1 text-xs shadow-xs transition-[color,box-shadow] outline-none selection:bg-[var(--blue-tint-12)] selection:text-[var(--ink-900)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ink-900)] placeholder:text-[var(--ink-500)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-[var(--danger)] aria-invalid:ring-[var(--danger-tint-15)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
