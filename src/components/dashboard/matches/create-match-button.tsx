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
        className="flex items-center gap-2 h-9 pl-3.5 pr-4 bg-[#3986F3] hover:bg-[#2E76E8] active:bg-[#2569D6] text-white text-[13px] font-semibold rounded-full shadow-[0_1px_3px_rgba(57,134,243,0.3)] transition-all duration-150 shrink-0"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Create Match
      </button>
      <UploadMatchModal open={open} onOpenChange={setOpen} />
    </>
  );
}
