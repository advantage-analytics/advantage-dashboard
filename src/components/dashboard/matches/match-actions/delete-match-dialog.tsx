"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DeleteMatchDialogProps {
  matchId: string;
  matchLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteMatchDialog({
  matchId,
  matchLabel,
  open,
  onOpenChange,
  onDeleted,
}: DeleteMatchDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete match");
      }
      onOpenChange(false);
      if (onDeleted) {
        onDeleted();
      } else if (pathname?.startsWith(`/dashboard/matches/${matchId}`)) {
        router.replace("/dashboard/matches");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <AlertDialogContent
        className="max-w-md rounded-2xl border-[#F0F0F0] p-6 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertDialogHeader className="gap-2 text-left">
          <AlertDialogTitle className="text-[18px] font-medium text-[#1D1D1F] tracking-[-0.4px]">
            Delete this match?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[20px] text-[#525252]">
            This permanently removes{" "}
            <span className="font-medium text-[#0D0D0D]">{matchLabel}</span>,
            its statistics, every recorded point and shot, and the uploaded file.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="text-[12px] text-[#E51837] bg-[rgba(229,24,55,0.06)] px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <AlertDialogFooter className="mt-2 sm:gap-2">
          <AlertDialogCancel
            disabled={loading}
            className={cn(
              "rounded-[6px] border-[#EAECF0] bg-white text-[#525252] hover:bg-[#F5F5F5] h-9 px-4 text-[13px] font-medium shadow-none"
            )}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={loading}
            className={cn(
              buttonVariants({ variant: "destructive" }),
              "rounded-[6px] bg-[#E51837] hover:bg-[#C81530] h-9 px-4 text-[13px] font-medium shadow-[0_1px_3px_rgba(229,24,55,0.25)]"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete match"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
