"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** The upload wizard's own route. Kept here so the shortcut and the link agree. */
const NEW_MATCH_HREF = "/dashboard/matches/new";

interface CreateMatchButtonProps {
  variant?: "dark" | "blue";
}

const variantStyles = {
  dark: "h-9 pl-3.5 pr-4 gap-1.5 bg-[#0D0D0D] hover:bg-[#1D1D1F] active:bg-[#2A2A2C] text-[13px] font-medium tracking-[0.5px] shadow-[0_1px_3px_rgba(0,0,0,0.2)] active:scale-[0.97]",
  blue: "h-9 pl-3.5 pr-4 gap-1.5 bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#2563EB] text-[13px] font-medium tracking-[0.5px] shadow-[0_1px_3px_rgba(57,134,243,0.25)] active:scale-[0.97]",
} as const;

const iconStyles = {
  dark: "w-4 h-4",
  blue: "w-4 h-4",
} as const;

export function CreateMatchButton({ variant = "dark" }: CreateMatchButtonProps): React.JSX.Element {
  const router = useRouter();
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform: string } })
        .userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform));
  }, []);

  // Listen for global keyboard shortcut (Cmd+U / Ctrl+U)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault();
        router.push(NEW_MATCH_HREF);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <Link
      href={NEW_MATCH_HREF}
      className={cn(
        "flex items-center rounded-[6px] text-white cursor-pointer transition-[color,background-color,transform] duration-200 ease-out shrink-0 focus-visible:outline-none",
        variantStyles[variant]
      )}
    >
      <Plus className={iconStyles[variant]} strokeWidth={2} aria-hidden="true" />
      Create Match
      <kbd className="ml-1 text-[10px] font-medium leading-none px-1 py-0.5 rounded bg-white/20">
        {isMac ? "\u2318U" : "\u2303U"}
      </kbd>
    </Link>
  );
}
