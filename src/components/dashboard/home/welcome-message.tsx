"use client";

import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

interface WelcomeMessageProps {
  name?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

export default function WelcomeMessage({ name = "Player" }: WelcomeMessageProps) {
  return (
    <div className="flex items-end justify-between">
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
          {getFormattedDate()}
        </p>
        <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[30px]">
          {getGreeting()}, {name}
        </h1>
      </div>
      <CreateMatchButton variant="blue" />
    </div>
  );
}
