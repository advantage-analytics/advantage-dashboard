import Image from "next/image";
import Link from "next/link";
import { CardFooter } from "@/components/dashboard/shared/card-footer";

/**
 * The one AI-authored card on Home, as Platform Audit Pa2 draws it (the
 * canvas's "1d Quiet body" setting): the engine named in the header — a 16px
 * ink-900 mark beside "Advantage Intelligence" in plain 12px text — with the
 * card's one link opposite, then whatever the body holds, then a hairline
 * footer the body also supplies.
 *
 * The engine's name is visible chrome here on purpose. Every other card on
 * the page is named by an eyebrow; this one is named by who wrote it, which
 * is the fact a reader most needs before trusting a sentence about their own
 * game. The name is the eyebrow.
 *
 * Home-specific rather than a reskin of `AiInsightCard` — that shell also
 * backs match detail's own insight card, with its own storage key and
 * dismiss/restore behaviour this design doesn't carry. Two callers wanting
 * different chrome is two components, not one component with a flag.
 */
export function FocusCard({
  children,
  footer,
}: {
  children: React.ReactNode;
  /**
   * Left and right of the hairline footer — the caption naming what the
   * body measured, and its sample size. The right side may be omitted; the
   * hairline is drawn whenever a footer is given at all, so the empty card
   * keeps the populated card's shape.
   *
   * The footer is a prop here and inline in its sibling cards because this
   * is the one card whose *body* is swapped (a finding, or the empty
   * anatomy) — hoisting it to the shell is what lets it survive both.
   */
  footer?: { left: React.ReactNode; right?: React.ReactNode };
}) {
  return (
    <div className="surface-card flex flex-col gap-3" style={{ padding: "var(--pad-card)" }}>
      <div className="flex items-center gap-2">
        {/* 16px square, 3px radius, white 9×6 swoosh — the frame's own
            geometry for the mark when it sits inline with 12px text; the
            20px `EngineChip` is the size it takes when it stands alone. */}
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded-[3px]"
          style={{ background: "var(--ink-900)" }}
          aria-hidden="true"
        >
          <Image
            src="/logos/logo3.svg"
            alt=""
            width={9}
            height={6}
            className="brightness-0 invert"
            aria-hidden="true"
          />
        </span>
        <span className="text-[12px] text-[var(--ink-700)]">Advantage Intelligence</span>
        <div className="flex-1" />
        <Link
          href="/dashboard/statistics"
          className="whitespace-nowrap text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Open Statistics
        </Link>
      </div>
      {children}
      {footer && <CardFooter left={footer.left} right={footer.right} />}
    </div>
  );
}
