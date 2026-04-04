"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { UploadMatchModal } from "@/components/dashboard/home/upload-match-modal";

export function CreateMatchButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-9 pl-3 pr-4 bg-[#0D0D0D] hover:bg-[#1D1D1F] active:bg-[#2A2A2C] text-white text-[13px] font-medium rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-all duration-200 shrink-0 active:scale-[0.98]"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Create Match
      </button>
      <UploadMatchModal open={open} onOpenChange={setOpen} />
    </>
  );
}
