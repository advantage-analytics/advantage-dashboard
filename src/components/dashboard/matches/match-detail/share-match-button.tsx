"use client";

import {
  useEffect,
  useOptimistic,
  useState,
  useSyncExternalStore,
  useTransition,
  type ComponentProps,
  type ComponentType,
} from "react";
import { ArrowUpRight, Check, Copy, Mail, Share2 } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdvSwitch } from "@/components/ui/adv-switch";
import {
  disableMatchShare,
  enableMatchShare,
} from "@/app/dashboard/matches/(detail)/[matchId]/share-actions";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";
import type { MatchShareLink } from "@/lib/data/match-share-server";
import { realTournamentName } from "@/lib/data/match-share-format";

type PopoverContentProps = ComponentProps<typeof PopoverContent>;

/** What a trigger must accept: the props Radix hands it, and no children. */
export type ShareTriggerProps = Omit<ComponentProps<"button">, "children">;

interface ShareMatchButtonProps {
  /**
   * The trigger COMPONENT — not an element. It is rendered through
   * `PopoverTrigger asChild`, so it must spread the props it is handed —
   * `ref` included, which the popover positions from — onto one `<button>`.
   * `ShareRailTrigger` is the rail's.
   *
   * A component rather than `children` on purpose, and it is load-bearing.
   * Every caller of this is a Server Component, so `children` would arrive
   * over the RSC boundary as a client reference that React resolves lazily.
   * Radix's `Slot` (`@radix-ui/react-slot`, `SlotClone`) asks
   * `React.isValidElement(children)` and returns `null` when the answer is
   * no — and an unresolved client reference answers no. The trigger then
   * vanishes from the server HTML with no error, no Suspense marker and a
   * 200, and the browser mounts the whole `<button>` fresh at hydration:
   * "server rendered HTML didn't match", every line a `+`.
   *
   * Taking the component instead means the ELEMENT is created here, inside
   * the client module, where it is always a real element. A reference React
   * still has to resolve is then the element's TYPE, which React suspends on
   * and renders — never something `Slot` can silently drop.
   */
  trigger: ComponentType<ShareTriggerProps>;
  side?: PopoverContentProps["side"];
  align?: PopoverContentProps["align"];
  /**
   * The match's public link, if one is on and this viewer may see it —
   * `getMatchShareLink()` in `page.tsx`, RLS-scoped. Null draws the switch
   * off. A viewer who cannot share the match (a plain teammate) never sees a
   * link and never manages to turn one on: the action's insert is refused
   * and the switch settles back to off.
   */
  shareLink: MatchShareLink | null;
  /**
   * May this viewer turn the link on or off — `getMatchShareState`, which
   * asks the database's `can_share_match`. False for a teammate who can open
   * the match but not publish it: they see the switch disabled and why.
   */
  canShare: boolean;
}

/**
 * The share popover for the match on the page, around whatever trigger the
 * surface draws:
 *
 *   <ShareMatchButton trigger={ShareRailTrigger} side="top" align="start" />
 *
 * It owns the popover, its panel and the ⌘⇧L / Ctrl+Shift+L shortcut; the
 * trigger owns only how it looks. The match comes from `MatchDataProvider`, so
 * this must render under the match detail layout.
 */
export function ShareMatchButton({
  trigger: Trigger,
  side = "bottom",
  align = "end",
  shareLink,
  canShare,
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
      <PopoverTrigger asChild>
        <Trigger />
      </PopoverTrigger>

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
        <SharePopoverPanel
          match={match}
          shareLink={shareLink}
          canShare={canShare}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Whether THIS BROWSER is a Mac. Only ever called on the client. */
function isMacBrowser(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform: string } })
      .userAgentData?.platform ?? navigator.platform;
  return /mac/i.test(platform);
}

/** The platform never changes under us, so there is nothing to subscribe to. */
const NEVER_CHANGES = () => () => {};

/**
 * Whether to name the shortcut with ⌘ rather than Ctrl — `null` until the
 * browser has answered.
 *
 * `useSyncExternalStore` is the API for exactly this: a value the server
 * cannot know. Its server snapshot is `null`, and React uses that snapshot
 * for the server render AND for the hydrating render, then re-renders with
 * the browser's own answer. Server HTML and first client render therefore
 * agree by construction — neither writes `aria-keyshortcuts` at all.
 *
 * Reading `navigator` during render is what this replaces. Node 21+ has a
 * `navigator` global whose `platform` names the SERVER's OS, so the two sides
 * agreed only when server and browser happened to share an OS family — true
 * when `next dev` and the browser run on one machine, false on Vercel, where
 * a Linux server renders `Control+Shift+L` into HTML that a Mac browser then
 * hydrates as `Meta+Shift+L`. React 19 does not patch attribute mismatches,
 * so that shipped every Mac visitor an announcement naming the wrong
 * modifier, on top of the hydration error it logs.
 *
 * `aria-keyshortcuts` is read from the live DOM by assistive tech, not from
 * the server's HTML, so arriving one render late costs the announcement
 * nothing. The listener in `ShareMatchButton` accepts Ctrl as well as ⌘ on
 * every platform either way.
 */
function useIsMac(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    NEVER_CHANGES,
    isMacBrowser,
    () => null,
  );
}

/**
 * The rail footer's Share button (design 04 F1): full width, the DS primary at
 * 36px, `Share2` and "Share". Pass it as `ShareMatchButton`'s `trigger` — the
 * component itself, never `<ShareRailTrigger />`; see that prop's note for
 * what rendering it across the RSC boundary costs. Radix hands it `onClick`,
 * the popover ARIA and a `ref`, and it spreads all of them onto the `<button>`
 * (React 19 passes `ref` as a plain prop; no `forwardRef`). Focus is
 * `advButton()`'s own ring, so none is written here.
 */
export function ShareRailTrigger({
  className,
  ...props
}: ShareTriggerProps): React.JSX.Element {
  const isMac = useIsMac();

  return (
    <button
      type="button"
      // Omitted until the platform is known — see `useIsMac`.
      aria-keyshortcuts={
        isMac === null ? undefined : isMac ? "Meta+Shift+L" : "Control+Shift+L"
      }
      {...props}
      className={cn(advButton("primary", "md"), "w-full gap-[7px]", className)}
    >
      <Share2 className="size-[15px]" strokeWidth={1.7} aria-hidden="true" />
      Share
    </button>
  );
}

/**
 * The popover's body. Sharing is a switch: off, the match is visible only to
 * people who can already open it in Advantage, and the panel says so rather
 * than offering a dashboard URL that bounces everyone else to sign-in; on,
 * the public `/m/<token>` link is what gets copied, mailed and handed to the
 * native share sheet.
 *
 * The switch flips optimistically and settles on the server's answer: a
 * refused insert (someone who may view but not publish) lands back on off
 * with a line saying so.
 */
export function SharePopoverPanel({
  match,
  shareLink,
  canShare,
  onClose,
}: {
  match: Match;
  shareLink: MatchShareLink | null;
  canShare: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [link, setLink] = useState<MatchShareLink | null>(shareLink);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticOn, setOptimisticOn] = useOptimistic(link !== null);

  // A fresh server render (the toggle's `revalidatePath`, a `router.refresh`)
  // hands down the current row; follow it.
  const [seeded, setSeeded] = useState(shareLink);
  if (seeded !== shareLink) {
    setSeeded(shareLink);
    setLink(shareLink);
  }

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const url = link?.url ?? "";
  const displayUrl = formatDisplayUrl(url);
  const shareTitle =
    realTournamentName(match.tournamentName) ??
    `${match.player1.name} vs ${match.player2.name}`;
  const mailtoHref = buildMailtoHref(match, url);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimisticOn(next);
      const result = next
        ? await enableMatchShare(match.id)
        : await disableMatchShare(match.id);
      if (!result.ok) {
        setError("Couldn't update sharing. Try again.");
        return;
      }
      setLink(result.url ? { url: result.url } : null);
    });
  }

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

  const on = optimisticOn && link !== null;

  return (
    <div className="flex flex-col">
      {/* The switch row: what the link does, and whether it exists. */}
      <div className="flex flex-col gap-1.5 px-2.5 pt-2.5 pb-2">
        <label className="flex cursor-pointer items-center gap-2.5">
          <AdvSwitch
            checked={optimisticOn}
            onCheckedChange={toggle}
            disabled={pending || !canShare}
            label="Anyone with the link can view"
          />
          <span className="text-[13px] text-[var(--ink-900)]">
            Anyone with the link can view
          </span>
        </label>
        <p
          className={cn(
            "text-micro",
            error ? "text-[var(--danger)]" : "text-[var(--ink-500)]",
          )}
          aria-live="polite"
        >
          {error ??
            (on
              ? "Statistics only. No video."
              : canShare
                ? "Only people who can open this match in Advantage can see it. Turn this on to get a link anyone can view."
                : "Only the player, whoever uploaded it, or a coach can share this match.")}
        </p>
      </div>

      {on && (
        <>
          {/* Divider — inset, doesn't span edges */}
          <div className="mx-2 my-1 h-px bg-[var(--border-hairline)]" />

          {/* URL pill + Copy button */}
          <div className="flex items-center gap-2 px-2 pt-1 pb-2">
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
                  <Check
                    className="size-3.5"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  Copied
                </>
              ) : (
                <>
                  <Copy
                    className="size-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
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
        </>
      )}
    </div>
  );
}

function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function buildMailtoHref(match: Match, url: string): string {
  const players = `${match.player1.name} vs ${match.player2.name}`;
  // Never "Unknown Event: …" in a subject line a stranger reads.
  const tournament = realTournamentName(match.tournamentName);
  const subject = tournament
    ? `${tournament}: ${players}`
    : `Match: ${players}`;
  const dateLine = match.date ? `\n${match.date}` : "";
  const body = `Match recap:\n\n${players}${dateLine}\n\nFull breakdown: ${url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
