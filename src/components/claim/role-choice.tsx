"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLAIM_BUTTON } from "./claim-shell";
import { cn } from "@/lib/utils";

type Choice = "coach" | "player" | "individual";

const OPTIONS: { id: Choice; label: string; sub: string }[] = [
  {
    id: "coach",
    label: "I coach or work with a college program",
    sub: "You'll set up the program and invite the rest.",
  },
  {
    id: "player",
    label: "I play for a college program",
    sub: "Your coach invites you — or you can ask.",
  },
  {
    id: "individual",
    label: "I'm an individual player",
    sub: "Club, junior, or unattached.",
  },
];

/**
 * Where each answer goes.
 *
 * An individual player leaves for the existing consumer signup rather than
 * being walked through a collegiate flow that does not apply to them — the spec
 * calls that out specifically. A player on a program lands on the same program
 * search, because asking their coach for an invite starts by naming the school.
 */
const DESTINATION: Record<Choice, string> = {
  coach: "/claim/program",
  player: "/claim/program",
  individual: "/sign-up",
};

export function RoleChoice() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <div>
      <div role="radiogroup" aria-label="How do you use Advantage?" className="flex flex-col gap-2.5">
        {OPTIONS.map((option) => {
          const selected = choice === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(option.id)}
              className={cn(
                "rounded-[10px] border px-4 py-3.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                selected
                  ? "border-[var(--ink-900)] bg-[var(--surface-card)]"
                  : "border-[var(--border-medium)] bg-[var(--surface-card)] hover:border-[var(--ink-300)]"
              )}
            >
              <span className="block text-[13px] font-medium text-[var(--ink-900)]">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--ink-500)]">
                {option.sub}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!choice}
        onClick={() => choice && router.push(DESTINATION[choice])}
        className={cn(CLAIM_BUTTON, "mt-6")}
      >
        Continue
      </button>
    </div>
  );
}
