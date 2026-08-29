import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const NEW_MATCH_HREF = "/dashboard/matches/new";

interface CreateMatchButtonProps {
  variant?: "dark" | "blue";
  label?: string;
}

const variantStyles = {
  dark: "h-9 pl-3.5 pr-4 gap-1.5 bg-[#0D0D0D] hover:bg-[#1D1D1F] active:bg-[#2A2A2C] text-[13px] font-medium tracking-[0.5px] shadow-[0_1px_3px_rgba(0,0,0,0.2)] active:scale-[0.97]",
  blue: "h-9 pl-3.5 pr-4 gap-1.5 bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#2563EB] text-[13px] font-medium tracking-[0.5px] shadow-[0_1px_3px_rgba(57,134,243,0.25)] active:scale-[0.97]",
} as const;

const iconStyles = {
  dark: "w-4 h-4",
  blue: "w-4 h-4",
} as const;

export function CreateMatchButton({
  variant = "dark",
  label = "Create Match",
}: CreateMatchButtonProps): React.JSX.Element {
  return (
    <Link
      href={NEW_MATCH_HREF}
      className={cn(
        "flex items-center rounded-[6px] text-white cursor-pointer transition-[color,background-color,transform] duration-200 ease-out shrink-0 focus-visible:outline-none",
        variantStyles[variant]
      )}
    >
      <Plus className={iconStyles[variant]} strokeWidth={2} aria-hidden="true" />
      {label}
    </Link>
  );
}
