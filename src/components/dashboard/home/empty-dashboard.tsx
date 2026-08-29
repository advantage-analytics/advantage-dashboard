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
 * and no shadow (recessed). Emphasis travels two ways: the elevated frame on
 * card 1 and the blue primary button, both pointing at the same action.
 */
const CARDS: ReadonlyArray<{
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  label: string;
  variant: AdvButtonVariant;
  emphasized: boolean;
}> = [
  {
    eyebrow: "First report",
    title: "Send your first match",
    body: "Singles, 1080p or better.",
    href: "/dashboard/matches/new",
    label: "Send a match",
    variant: "primary",
    emphasized: true,
  },
  {
    eyebrow: "SwingVision",
    title: "Import a session",
    body: "Stats and video land already synced — no re-typing the score.",
    href: "/dashboard/matches/new",
    label: "Import",
    variant: "outline",
    emphasized: false,
  },
  {
    eyebrow: "Your profile",
    title: "Set hand and backhand",
    body: "Analysis orients every stat around how you play.",
    href: "/dashboard/settings/profile",
    label: "Open profile",
    variant: "outline",
    emphasized: false,
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
            card.emphasized
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
            style={{ marginTop: "auto" }}
          >
            {card.label}
          </Link>
        </div>
      ))}
    </div>
  );
}
