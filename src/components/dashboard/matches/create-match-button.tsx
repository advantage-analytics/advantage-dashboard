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
        className="flex items-center gap-1.5 h-8 px-4 bg-[#3986F3] hover:bg-[#2E76E8] active:bg-[#2569D6] text-white text-xs font-semibold rounded-full transition-colors duration-150 shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        Create Match
      </button>
      <UploadMatchModal open={open} onOpenChange={setOpen} />
    </>
  );
}
