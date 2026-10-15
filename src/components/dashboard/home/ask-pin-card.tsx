"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AskScope } from "@/lib/services/ask/scope";
import { unpinAskAnswer } from "@/app/dashboard/ask/actions";
import { AskVisualBlock } from "@/components/dashboard/ask/visuals/ask-visual";
import type { AskPin } from "@/lib/data/ask-server";
import { cn } from "@/lib/utils";

const PIN_CARD_COPY = {
  title: "Pinned from Ask",
  openAsk: "Open Ask",
  openAnswer: "Open the answer",
  unpin: "Unpin",
  unpinning: "Unpinning…",
  failed: "Could not unpin that. Try again.",
} as const;

/**
 * "Pinned from Ask": the visual blocks a player kept from their answers
 * (`ask_pins`), on Home. Each is drawn by the answer's own block
 * (`AskVisualBlock`) — the same shapes, the same numbers, never reformatted
 * — with the block's own caption under it, and one quiet row: the answer
 * it came from, and Unpin.
 *
 * ── States ──────────────────────────────────────────────────────────────────
 * The card exists only while something is pinned. With no pin there is no
 * card, deliberately: a pin is something the player chose to keep, so an
 * empty "Pinned from Ask" would be a shape for a thing they have not done —
 * an advert, not an honest zero — and it would sit on every Home page from
 * day one. The way to make the card appear is on the answer itself ("Pin to
 * Home"). Loading: the region is the last card in its column, so it has no
 * skeleton either — a bar there would promise a card that most Home pages
 * never get, and its arrival moves nothing above it. A failed read is the
 * region's retry (`WidgetBoundary`), not an absent card.
 *
 * Unpin removes the block here at once and asks the server; a refusal puts
 * it back with one line saying so. The last pin unpinned leaves the card on
 * screen until the next render reads none — a card vanishing under the
 * pointer would read as a mistake.
 */
export function AskPinCard({
  pins,
  askHref = "/dashboard/ask",
  scopeKind = "personal",
}: {
  pins: AskPin[];
  /** The Ask page these pins came from: the team page's on the team Home. */
  askHref?: string;
  scopeKind?: AskScope["kind"];
}) {
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startUnpin] = useTransition();
  const shown = pins.filter((pin) => !gone.has(pin.id));

  function unpin(pin: AskPin) {
    setFailed(null);
    setGone((current) => new Set(current).add(pin.id));
    startUnpin(async () => {
      const result = await unpinAskAnswer(pin.id, scopeKind);
      if (result.ok) return;
      setGone((current) => {
        const next = new Set(current);
        next.delete(pin.id);
        return next;
      });
      setFailed(pin.id);
    });
  }

  return (
    <section
      aria-label={PIN_CARD_COPY.title}
      data-ask-pins=""
      className="surface-card flex min-w-0 flex-col gap-4 p-[var(--pad-card)]"
    >
      <div className="flex items-center gap-2.5">
        <h2 className="eyebrow">{PIN_CARD_COPY.title}</h2>
        <div className="flex-1" />
        <Link
          href={askHref}
          className="text-[11px] whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          {PIN_CARD_COPY.openAsk}
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="text-body-sm">Nothing pinned.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map((pin, index) => (
            <li
              key={pin.id}
              data-ask-pin={pin.id}
              className={cn(
                "flex min-w-0 flex-col gap-3",
                index > 0 &&
                  "mt-4 border-t border-[var(--border-hairline)] pt-4",
              )}
            >
              <AskVisualBlock visual={pin.visual} />
              {pin.caption.trim() !== pin.visual.caption.trim() && (
                <p className="text-micro max-w-[66ch]">{pin.caption}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {pin.conversationId && (
                  <Link
                    href={`${askHref}?c=${encodeURIComponent(pin.conversationId)}`}
                    className="text-[12px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                  >
                    {PIN_CARD_COPY.openAnswer}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => unpin(pin)}
                  disabled={pending}
                  className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)] disabled:cursor-default disabled:text-[var(--text-disabled)]"
                >
                  {pending ? PIN_CARD_COPY.unpinning : PIN_CARD_COPY.unpin}
                </button>
                {failed === pin.id && (
                  <p
                    role="alert"
                    className="text-[11px] text-[var(--danger-text)]"
                  >
                    {PIN_CARD_COPY.failed}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
