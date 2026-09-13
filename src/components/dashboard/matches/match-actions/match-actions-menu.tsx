"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EditMatchDialog } from "./edit-match-dialog";
import { DeleteMatchDialog } from "./delete-match-dialog";

interface MatchActionsMenuProps {
  matchId: string;
  matchLabel: string;
  onDeleted?: () => void;
  className?: string;
}

export function MatchActionsMenu({
  matchId,
  matchLabel,
  onDeleted,
  className,
}: MatchActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // The menu trigger is a sibling (not a child) of the card <Link>, so clicks
  // don't bubble into navigation. We still stop propagation inside menu items
  // for defense in depth against parents that might attach handlers.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const triggerClasses =
    "inline-flex items-center justify-center h-7 w-7 rounded-lg text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 data-[state=open]:bg-[#F5F5F5] data-[state=open]:text-[#0D0D0D]";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Match actions"
          title="Match actions"
          onPointerDown={stop}
          onClick={stop}
          className={cn(triggerClasses, className)}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="p-1 min-w-[180px] rounded-xl border-[#E5E5EA] shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
          onClick={stop}
          onPointerDown={stop}
        >
          <MenuButton
            onSelect={() => {
              setOpen(false);
              setEditOpen(true);
            }}
            icon={<Pencil className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
            label="Edit match"
          />
          <MenuDivider />
          <MenuButton
            onSelect={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
            icon={<Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
            label="Delete match"
            destructive
          />
        </PopoverContent>
      </Popover>

      {editOpen && (
        <EditMatchDialog
          matchId={matchId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {deleteOpen && (
        <DeleteMatchDialog
          matchId={matchId}
          matchLabel={matchLabel}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

function MenuDivider() {
  return <div className="h-px bg-[#E5E5EA] mx-2 my-1" aria-hidden="true" />;
}

function MenuButton({
  onSelect,
  icon,
  label,
  destructive,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-normal text-left transition-colors duration-100",
        "focus-visible:outline-none",
        destructive
          ? "text-[#E51837] hover:bg-[rgba(229,24,55,0.08)] focus-visible:bg-[rgba(229,24,55,0.08)] active:bg-[rgba(229,24,55,0.12)]"
          : "text-[#1D1D1F] hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] active:bg-[#EBEBEB]"
      )}
    >
      <span className={destructive ? "text-[#E51837]" : "text-[#8A8A8E]"}>{icon}</span>
      {label}
    </button>
  );
}
