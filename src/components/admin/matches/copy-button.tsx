"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ICON_BUTTON } from "@/components/dashboard/matches/match-drawer";
import { cn } from "@/lib/utils";

/**
 * An icon-only copy control: `aria-label` and a dark tooltip, as every
 * icon-only button needs. The tooltip and the glyph say "Copied" for a moment
 * after a click; a clipboard the browser refuses says nothing rather than
 * claiming success.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  /** The control's name, e.g. "Copy match id". */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <ChromeTooltip label={copied ? "Copied" : label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 1600);
            })
            .catch(() => {});
        }}
        className={cn(ICON_BUTTON, className)}
      >
        {copied ? (
          <Check className="size-3.5" strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.5} aria-hidden />
        )}
      </button>
    </ChromeTooltip>
  );
}
