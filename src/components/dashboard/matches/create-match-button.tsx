"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { UploadMatchModal } from "@/components/dashboard/home/upload-match-modal";
import { cn } from "@/lib/utils";

interface CreateMatchButtonProps {
  variant?: "dark" | "blue";
}

const variantStyles = {
  dark: "h-9 pl-3 pr-4 gap-1.5 bg-[#0D0D0D] hover:bg-[#1D1D1F] active:bg-[#2A2A2C] text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.15)] active:scale-[0.97]",
  blue: "h-8 px-3 gap-1 bg-[#3986F3] hover:bg-[#2D6FD9] active:bg-[#2563EB] text-[12px] font-medium active:scale-[0.97]",
} as const;

const iconStyles = {
  dark: "w-4 h-4",
  blue: "w-3.5 h-3.5",
} as const;

export function CreateMatchButton({ variant = "dark" }: CreateMatchButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center rounded-full text-white cursor-pointer transition-[color,background-color,transform] duration-200 ease-out shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(57,134,243,0.5)] focus-visible:ring-offset-1",
          variantStyles[variant]
        )}
      >
        <Plus className={iconStyles[variant]} strokeWidth={2} aria-hidden="true" />
        Create Match
      </button>

      <UploadMatchModal open={open} onOpenChange={setOpen} />
    </>
  );
}
