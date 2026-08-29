import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Day zero — the recommended next step is always exactly one card. Sending a
 * match (video) is first because it's how most personal matches arrive;
 * SwingVision import and the profile card are secondary, equal-weight paths.
 */
const CARDS = [
  {
    eyebrow: "First report",
    title: "Send your first match",
    body: "Singles, 1080p or better.",
    href: "/dashboard/matches/new",
    label: "Send a match",
    emphasized: true,
  },
  {
    eyebrow: "SwingVision",
    title: "Import a session",
    body: "Stats and video land already synced — no re-typing the score.",
    href: "/dashboard/matches/new",
    label: "Import",
    emphasized: false,
  },
  {
    eyebrow: "Your profile",
    title: "Set hand and backhand",
    body: "Analysis orients every stat around how you play.",
    href: "/dashboard/settings/profile",
    label: "Open profile",
    emphasized: false,
  },
] as const;

export default function EmptyDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARDS.map((card) => (
        <div
          key={card.title}
          className="flex flex-col gap-3 rounded-[var(--radius-card)] p-6"
          style={{
            border: `1px solid var(${card.emphasized ? "--border-medium" : "--border-hairline"})`,
            boxShadow: card.emphasized ? "var(--shadow-card)" : undefined,
          }}
        >
          <span className="eyebrow">{card.eyebrow}</span>
          <span className="text-title">{card.title}</span>
          <span className="text-body-sm flex-1" style={{ maxWidth: "34ch" }}>
            {card.body}
          </span>
          <Link
            href={card.href}
            className={advButton(card.emphasized ? "primary" : "outline", "md")}
            style={{ marginTop: "auto" }}
          >
            {card.label}
          </Link>
        </div>
      ))}
    </div>
  );
}
