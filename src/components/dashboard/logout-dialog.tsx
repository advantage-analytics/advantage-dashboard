"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";

/**
 * The single logout confirmation for the dashboard.
 *
 * Sign out is reachable from two places in the v2 chrome — the sidebar footer
 * and the header profile menu — and both must land on the same confirmation.
 * Two dialogs would mean two places to keep the unsaved-changes warning
 * correct, and one of them would eventually drift.
 */
const LogoutContext = createContext<(() => void) | null>(null);

export function useRequestLogout(): () => void {
  const request = useContext(LogoutContext);
  if (!request) {
    throw new Error("useRequestLogout must be used within a LogoutProvider.");
  }
  return request;
}

export function LogoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { hasUnsavedChanges } = useUnsavedChanges();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  const requestLogout = useCallback(() => setIsOpen(true), []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setHasError(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setIsLoggingOut(false);
      setHasError(true);
    }
  };

  return (
    <LogoutContext.Provider value={requestLogout}>
      {children}

      <AlertDialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setHasError(false);
            setIsLoggingOut(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[320px] sm:rounded-2xl p-5 gap-0 border border-[#E5E5EA] shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          <AlertDialogHeader className="space-y-0 text-left mb-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-7 w-7 rounded-full bg-[rgba(229,24,55,0.15)] flex items-center justify-center shrink-0">
                <LogOut
                  className="h-3 w-3 text-[#E51837]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
              <AlertDialogTitle className="text-[16px] font-medium text-[#1D1D1F] tracking-[-0.4px]">
                Log out
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[13px] text-[#888888] leading-[1.5]">
              {hasUnsavedChanges
                ? "You have unsaved changes that will be lost. "
                : ""}
              You&#39;ll need to sign in again to access your matches and
              statistics.
            </AlertDialogDescription>
            {hasError && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-[6px] bg-[rgba(229,24,55,0.15)]">
                <div className="h-1 w-1 rounded-full bg-[#E51837] shrink-0" />
                <p className="text-[12px] font-normal text-[#E51837]">
                  Could not log out. Please try again.
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <div className="flex items-center justify-end gap-2.5">
            <AlertDialogCancel
              disabled={isLoggingOut}
              className="h-8 rounded-[6px] px-4 border border-[#EAECF0] bg-transparent text-[10px] font-medium uppercase tracking-[1.5px] text-[#525252] hover:bg-[#F5F5F5] active:scale-[0.97] transition-colors duration-200 cursor-pointer m-0 focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="h-8 rounded-[6px] px-4 border-none bg-[#E51837] hover:bg-[#CC1530] text-[10px] font-medium uppercase tracking-[1.5px] text-white active:scale-[0.97] transition-colors duration-200 cursor-pointer shadow-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
            >
              {isLoggingOut ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Logging out
                </span>
              ) : hasError ? (
                "Try again"
              ) : (
                "Log out"
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </LogoutContext.Provider>
  );
}
