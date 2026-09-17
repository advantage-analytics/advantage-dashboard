"use client";

import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { ArrowUpRight, Check, Copy, Mail, Share2 } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";

type PopoverContentProps = ComponentProps<typeof PopoverContent>;

interface ShareMatchButtonProps {
  /**
   * The trigger, rendered through `PopoverTrigger asChild`: one element that
   * spreads the props it is handed — `ref` included, which the popover
   * positions from — onto its `<button>`. `ShareRailTrigger` is the rail's.
   */
  children: ReactElement;
  side?: PopoverContentProps["side"];
  align?: PopoverContentProps["align"];
}

/**
 * The share popover for the match on the page, around whatever trigger the
 * surface draws:
 *
 *   <ShareMatchButton side="top" align="start">
 *     <ShareRailTrigger />
 *   </ShareMatchButton>
 *
 * It owns the popover, its panel and the ⌘⇧L / Ctrl+Shift+L shortcut; the
 * trigger owns only how it looks. The match comes from `MatchDataProvider`, so
 * this must render under the match detail layout.
 */
export function ShareMatchButton({
  children,
  side = "bottom",
  align = "end",
}: ShareMatchButtonProps): React.JSX.Element {
  const { match } = useMatchData();
  const [open, setOpen] = useState(false);

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
      <PopoverTrigger asChild>{children}</PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
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

/**
 * Whether to name the shortcut with ⌘ rather than Ctrl. `useState`'s lazy
 * initialiser, so it runs once per mount, during render, with no effect and
 * no second render.
 *
 * The `typeof navigator` guard is the only one, on purpose. Node 21+ has a
 * `navigator` global whose `platform` names the SERVER's OS ("MacIntel",
 * "Linux x86_64"), so this runs on both sides of hydration and they agree
 * whenever server and browser share an OS family — as they do when `next dev`
 * and the browser run on one machine, the only place a mismatch logs.
 * Guarding on `typeof window` as well would make the server always say "no"
 * and every Mac hydration disagree. Where they genuinely differ — a Linux server rendering
 * for a Mac browser — React 19 keeps the server's attribute (it never patches
 * attribute mismatches, and production does not compare them), so the button
 * announces Control+Shift+L; the listener above accepts Ctrl as well as ⌘ on
 * every platform, so that is still a shortcut that works, never a false one.
 * An environment with no `navigator` at all lands on the same Ctrl spelling.
 */
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform: string } })
      .userAgentData?.platform ?? navigator.platform;
  return /mac/i.test(platform);
}

/**
 * The rail footer's Share button (design 04 F1): full width, the DS primary at
 * 36px, `Share2` and "Share". Pass it as `ShareMatchButton`'s child — Radix
 * hands it `onClick`, the popover ARIA and a `ref`, and it spreads all of them
 * onto the `<button>` (React 19 passes `ref` as a plain prop; no
 * `forwardRef`). Focus is `advButton()`'s own ring, so none is written here.
 */
export function ShareRailTrigger({
  className,
  ...props
}: Omit<ComponentProps<"button">, "children">): React.JSX.Element {
  const [isMac] = useState(detectIsMac);

  return (
    <button
      type="button"
      aria-keyshortcuts={isMac ? "Meta+Shift+L" : "Control+Shift+L"}
      {...props}
      className={cn(advButton("primary", "md"), "w-full gap-[7px]", className)}
    >
      <Share2 className="size-[15px]" strokeWidth={1.7} aria-hidden="true" />
      Share
    </button>
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
            "hover:bg-[#F5F5F5] hover:text-[var(--ink-900)] active:bg-[var(--ink-200)]",
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
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--ink-900)]",
            "hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[var(--ink-200)]",
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
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--ink-900)]",
              "hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[var(--ink-200)]",
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
