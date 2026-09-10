"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Link2, Mail } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";

interface ShareMatchButtonProps {
  match: Match;
}

export function ShareMatchButton({
  match,
}: ShareMatchButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform: string } })
        .userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform));
  }, []);

  // Keyboard shortcut: Cmd+Shift+L / Ctrl+Shift+L — opens popover
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "l"
      ) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Share match"
          aria-keyshortcuts={isMac ? "Meta+Shift+L" : "Control+Shift+L"}
          className={cn(
            "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] pr-4 pl-3.5 text-white",
            "bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#2563EB] data-[state=open]:bg-[#2563EB]",
            "text-[13px] font-medium tracking-[0.5px]",
            "shadow-[0_1px_3px_rgba(57,134,243,0.25)]",
            "transition-[color,background-color,transform] duration-200 ease-out active:scale-[0.97]",
            "focus-visible:outline-none",
          )}
        >
          <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Share Match
          {isMac !== null && (
            <kbd className="ml-1 inline-block rounded bg-white/20 px-1 py-0.5 text-[10px] leading-none font-medium text-white">
              {isMac ? "⌘⇧L" : "Ctrl+Shift+L"}
            </kbd>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          // Override base popover styling to match design system Dropdown / Menu spec
          "w-[320px] rounded-xl border border-[#E5E5EA] p-1",
          "shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]",
        )}
      >
        <SharePopoverPanel match={match} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function SharePopoverPanel({
  match,
  onClose,
}: {
  match: Match;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const displayUrl = formatDisplayUrl(url);
  const shareTitle = match.tournamentName?.trim()
    ? match.tournamentName
    : `${match.player1.name} vs ${match.player2.name}`;
  const mailtoHref = buildMailtoHref(match, url);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent failure
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, url });
      onClose();
    } catch {
      // user cancelled — keep popover open
    }
  }

  return (
    <div className="flex flex-col">
      {/* URL pill + Copy button — top section */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-2">
        <div
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center px-2.5",
            "rounded-[6px] border border-[#EAECF0] bg-[#F5F5F5]",
          )}
        >
          <span className="truncate text-[12px] leading-none text-[#71717A]">
            {displayUrl}
          </span>
        </div>
        <button
          type="button"
          onClick={copyToClipboard}
          autoFocus
          aria-live="polite"
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-[6px] px-3 text-[12px] font-medium",
            "border border-[#EAECF0] bg-white text-[#525252]",
            "hover:bg-[#F5F5F5] hover:text-[#1D1D1F] active:bg-[#EBEBEB]",
            "transition-[background-color,transform,color] duration-150 ease-out active:scale-[0.97]",
            "focus-visible:outline-none",
          )}
        >
          {copied ? (
            <>
              <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Divider — inset, doesn't span edges */}
      <div className="mx-2 my-1 h-px bg-[#E5E5EA]" />

      {/* Item rows */}
      <div className="flex flex-col">
        <a
          href={mailtoHref}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[#1D1D1F]",
            "hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[#EBEBEB]",
            "transition-colors duration-100",
          )}
        >
          <Mail
            className="size-3.5 text-[#8A8A8E]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="flex-1">Email this match</span>
        </a>
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#1D1D1F]",
              "hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[#EBEBEB]",
              "transition-colors duration-100",
            )}
          >
            <ArrowUpRight
              className="size-3.5 text-[#8A8A8E]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="flex-1">More options…</span>
          </button>
        )}
      </div>
    </div>
  );
}

function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function buildMailtoHref(match: Match, url: string): string {
  const players = `${match.player1.name} vs ${match.player2.name}`;
  const tournament = match.tournamentName?.trim();
  const subject = tournament
    ? `${tournament}: ${players}`
    : `Match: ${players}`;
  const dateLine = match.date ? `\n${match.date}` : "";
  const body = `Match recap:\n\n${players}${dateLine}\n\nFull breakdown: ${url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
