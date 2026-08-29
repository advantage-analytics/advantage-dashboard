"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

interface WelcomeMessageProps {
  name?: string;
  greeting: string;
  /** Renders left of the date — either help copy or the "N new report" link. */
  subline?: ReactNode;
}

function getFormattedDate(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function WelcomeMessage({ name, greeting, subline }: WelcomeMessageProps) {
  const trimmedName = name?.trim();
  const [dateText, setDateText] = useState("");

  // Compute date client-side only (timezone-dependent)
  useEffect(() => {
    setDateText(getFormattedDate());
  }, []);

  return (
    <div className="flex items-end gap-4">
      <div>
        <h1 className="text-display">
          {trimmedName ? `${greeting}, ${trimmedName}.` : `${greeting}.`}
        </h1>
        <div className="mt-[9px] flex items-baseline gap-3">
          {subline}
          <span
            aria-live="polite"
            className={`text-micro tabular transition-opacity duration-300 ${dateText ? "opacity-100" : "opacity-0"}`}
          >
            {dateText || " "}
          </span>
        </div>
      </div>
      <div className="flex-1" />
      <CreateMatchButton variant="blue" label="New match" />
    </div>
  );
}
