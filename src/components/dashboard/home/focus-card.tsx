import Image from "next/image";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";

/**
 * The one AI-authored card on Home — v3's `InsightCard` register: eyebrow
 * "Focus" + an engine mark, never the engine's name as visible chrome text.
 *
 * Home-specific rather than a reskin of `AiInsightCard` — that shell also
 * backs match detail's own insight card, with its own storage key and
 * dismiss/restore behaviour this design doesn't carry. Two callers wanting
 * different chrome is two components, not one component with a flag.
 */
export function FocusCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-card flex flex-col gap-2.5" style={{ padding: "18px 20px" }}>
      <div className="flex items-center gap-2">
        <span className="eyebrow">Focus</span>
        <div className="flex-1" />
        <ChromeTooltip
          label="Advantage Intelligence"
          detail="Computed from your analyzed matches"
          side="left"
        >
          <span
            className="flex size-5 items-center justify-center rounded-[var(--radius-button)]"
            style={{ background: "var(--ink-900)" }}
            aria-label="Advantage Intelligence"
          >
            <Image
              src="/logos/logo3.svg"
              alt=""
              width={12}
              height={8}
              className="brightness-0 invert"
              aria-hidden="true"
            />
          </span>
        </ChromeTooltip>
      </div>
      {children}
    </div>
  );
}
