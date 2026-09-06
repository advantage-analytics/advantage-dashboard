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
   *
   * It sits in the header's right slot, in the same `text-micro` every other
   * card on Home uses for its meta, rather than as a capsule beside the
   * eyebrow.
   */
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col gap-2.5" style={{ padding: "18px 20px" }}>
      {/* Header grammar, matched to its siblings on Home: the eyebrow on the
          left, one quiet run of meta on the right, then the card's own mark.
          Every other card in the column does this — "All matches" on the
          matches card, "0 sessions · last 12 months" on Activity, "last 4
          matches" on serve placement — and this card used to break it with a
          grey capsule wedged in beside the eyebrow, which read as a second
          label on the only card carrying two. */}
      {/* `items-center`, not baseline: the engine mark is a 20px box, and a
          baseline would hang it below the eyebrow it sits beside. */}
      <div className="flex items-center gap-2">
        <span className="eyebrow">Focus</span>
        <div className="flex-1" />
        {tag && <span className="text-micro shrink-0">{tag}</span>}
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
