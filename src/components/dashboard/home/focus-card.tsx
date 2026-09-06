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
export function FocusCard({
  tag,
  children,
}: {
  /**
   * A qualifier on the card's own name, in the header rather than under the
   * sentence it qualifies. A disclaimer that arrives after the claim has
   * already been read as a finding came too late, and it is the first thing
   * lost when someone crops or skims the card from the top.
   */
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col gap-2.5" style={{ padding: "18px 20px" }}>
      <div className="flex items-center gap-2">
        <span className="eyebrow">Focus</span>
        {tag && (
          // The product's own grey capsule, not a second eyebrow: one card
          // carries one eyebrow, and grey because a label is never an action.
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] leading-[1.4]"
            style={{ background: "var(--surface-subtle)", color: "var(--ink-600)" }}
          >
            {tag}
          </span>
        )}
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
