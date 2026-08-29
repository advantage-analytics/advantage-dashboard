import Link from "next/link";
import { advButton, type AdvButtonVariant } from "@/lib/ui/adv-button";

/**
 * Day zero — the recommended next step is always exactly one card. Sending a
 * match (video) is first because it's how most personal matches arrive;
 * SwingVision import and the profile card are secondary, equal-weight paths.
 *
 * Layout follows artboard 20a ("Home — day zero, full viewport") from the
 * Personal Home & Matches canvas: a `repeat(3, 1fr)` grid at 20px gap, cards
 * at 28px padding with a 12px internal stack, body copy capped at 34ch, action
 * pinned to the bottom of the card.
 *
 * Surface follows artboard 20a exactly: the primary card gets `--border-medium`
 * + `--shadow-card` (elevated), the two secondary cards get `--border-hairline`
 * and no shadow (recessed). Both signals — the elevated frame and the blue
 * button — point at the same action, derived from `variant === "primary"`.
 */
const CARDS: ReadonlyArray<{
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  label: string;
  variant: AdvButtonVariant;
}> = [
  {
    eyebrow: "First report",
    title: "Send your first match",
    body: "Singles, 1080p or better.",
    href: "/dashboard/matches/new",
    label: "Send a match",
    variant: "primary",
  },
  {
    eyebrow: "SwingVision",
    title: "Import a session",
    body: "Stats and video land already synced — no re-typing the score.",
    href: "/dashboard/matches/new",
    label: "Import",
    variant: "outline",
  },
  {
    eyebrow: "Your profile",
    title: "Set hand and backhand",
    body: "Analysis orients every stat around how you play.",
    href: "/dashboard/settings/profile",
    label: "Open profile",
    variant: "outline",
  },
];

const BASE_CLASS = "flex flex-col gap-3 p-7 rounded-[var(--radius-card)] border";

export default function EmptyDashboard() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-3">
      {CARDS.map((card) => (
        <div
          key={card.title}
          className={BASE_CLASS}
          style={
            card.variant === "primary"
              ? {
                  borderColor: "var(--border-medium)",
                  boxShadow: "var(--shadow-card)",
                }
              : {
                  borderColor: "var(--border-hairline)",
                }
          }
        >
          <span className="eyebrow">{card.eyebrow}</span>
          <span className="text-title">{card.title}</span>
          <span className="text-body-sm flex-1" style={{ maxWidth: "34ch" }}>
            {card.body}
          </span>
          <Link
            href={card.href}
            className={advButton(card.variant, "md")}
          >
            {card.label}
          </Link>
        </div>
      ))}
    </div>
  );
}
