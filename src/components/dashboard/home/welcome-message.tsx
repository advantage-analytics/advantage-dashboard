"use client";

import { useEffect, useState } from "react";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

interface WelcomeMessageProps {
  name?: string;
  greeting: string;
}

function getFormattedDate(): string {
  const now = new Date();
  return now
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .replace(",", ",");
}

export default function WelcomeMessage({ name = "Player", greeting }: WelcomeMessageProps) {
  const [dateText, setDateText] = useState("");

  // Compute date client-side only (timezone-dependent)
  useEffect(() => {
    setDateText(getFormattedDate());
  }, []);

  return (
    <div className="flex items-end justify-between">
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] min-h-[15px]">
          {dateText}
        </p>
        <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
          {greeting}, {name}
        </h1>
      </div>
      <CreateMatchButton variant="blue" />
    </div>
  );
}
