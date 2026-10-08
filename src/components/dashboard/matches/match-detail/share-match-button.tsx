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
import { ArrowUpRight, Lock, Mail, Share2 } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { FloatMenuDivider } from "@/components/ui/float-menu";
import {
  AccessOption,
  SECONDARY_BUTTON,
  UrlRow,
  moveFocusBetweenRungs,
} from "@/components/ui/share-panel";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  disableMatchShare,
  enableMatchShare,
} from "@/app/dashboard/matches/(detail)/[matchId]/share-actions";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";
import type {
  MatchShareLink,
  MatchShareState,
  SharePerson,
} from "@/lib/data/match-share-server";
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
   * `getMatchShareState()` in `page.tsx`: the public link if one is on and
   * this viewer may see it, whether they may change it (`can_share_match`),
   * whether a link exists at all, and who can open the match without one.
   */
  share: MatchShareState;
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
  share,
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
          // The menu surface (Dropdown / Menu): 12px floating radius, 4px
          // inset, hairline edge, float shadow.
          "w-[320px] rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1",
          "shadow-[var(--shadow-dropdown)]",
        )}
      >
        <SharePopoverPanel
          match={match}
          share={share}
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
 * The popover's body: who can open the match, then what to do with that.
 *
 * The first block is a two-rung ladder drawn as check-dot radios — the
 * product's single-choice mark — in the menu's own row geometry:
 *
 *   - "Only you" (personal) or the program's name (team): who can open it in
 *     Advantage today. The team rung carries the first three faces and the
 *     headcount.
 *   - "Anyone with the link": the public `/m/<token>` link.
 *
 * Below a hairline sits whatever the chosen rung can hand out — nothing for
 * "Only you", the `/dashboard` URL for a team (members sign in to open it),
 * the public link plus Email and More options for "Anyone" — and under a
 * second hairline one closing sentence: who made the link and when, or that
 * links carry statistics only.
 *
 * Choosing the public rung turns the link on at once (optimistic, settling on
 * the server's answer). Stepping back down asks first, in place of the link
 * row: a link that has been handed out dies for everyone, and turning it on
 * again mints a new one (`share-actions.ts`).
 *
 * A viewer who may open the match but not publish it (a teammate) sees the
 * same ladder unavailable — `aria-disabled`, never `disabled`, so it stays in
 * the tab order and announces why — with the team link to copy and a note
 * naming who can make a public one.
 */
export function SharePopoverPanel({
  match,
  share,
  onClose,
}: {
  match: Match;
  share: MatchShareState;
  onClose: () => void;
}) {
  const { link: shareLink, canShare, publicLinkOn, audience } = share;
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [link, setLink] = useState<MatchShareLink | null>(shareLink);
  const [error, setError] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
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
  const shareTitle =
    realTournamentName(match.tournamentName) ??
    `${match.player1.name} vs ${match.player2.name}`;
  const team = audience.kind === "team" ? audience : null;
  const locked = !canShare;

  // What the ladder shows as chosen. A teammate cannot read the link row, so
  // their answer comes from `publicLinkOn`; everyone else follows the
  // optimistic toggle, and "Only you" is drawn chosen while its confirm is up.
  const isPublic = locked ? publicLinkOn : confirmingOff ? false : optimisticOn;
  // A locked viewer's `link` is always null (RLS on `match_share_links`), so
  // `link !== null` already implies `!locked` — see `MatchShareState.canShare`.
  const on = optimisticOn && link !== null;

  function choose(next: "private" | "public") {
    if (locked || pending) return;
    setError(null);
    if (next === "public") {
      setConfirmingOff(false);
      if (!optimisticOn) toggle(true);
      return;
    }
    if (optimisticOn) setConfirmingOff(true);
  }

  function toggle(next: boolean) {
    startTransition(async () => {
      setOptimisticOn(next);
      const result = next
        ? await enableMatchShare(match.id)
        : await disableMatchShare(match.id);
      setConfirmingOff(false);
      if (!result.ok) {
        setError("Couldn't update sharing. Try again.");
        return;
      }
      setLink(result.url ? { url: result.url } : null);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, url });
      onClose();
    } catch {
      // user cancelled — keep popover open
    }
  }

  const privateRung = team
    ? {
        label: team.programName ?? "The team",
        description: "Everyone on the team can open it",
        trailing: <TeamFaces faces={team.faces} count={team.memberCount} />,
      }
    : { label: "Only you", description: "Private to your account" };

  // The row between the two hairlines, when there is one.
  let body: React.ReactNode = null;
  if (confirmingOff) {
    body = (
      <div className="flex flex-col gap-2.5 px-2.5 pt-2 pb-2.5">
        <p className="text-[12px] leading-[17px] text-[var(--ink-700)]">
          Turn off the link? It stops working for everyone who has it. Turning
          it back on makes a new one.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setConfirmingOff(false)}
            className={advButton("ghost", "sm")}
          >
            Keep link
          </button>
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={pending}
            className={advButton("danger-solid", "sm")}
          >
            Turn off
          </button>
        </div>
      </div>
    );
  } else if (on) {
    body = (
      <ActionBlock>
        <UrlRow url={url} />
        {/* The other ways out, one row of equal halves under the link — the
            same 32px and edges as Copy, so the link row stays the lead. */}
        <div className="flex gap-2">
          <a
            href={buildMailtoHref(match, url)}
            className={cn(SECONDARY_BUTTON, "flex-1")}
          >
            <Mail
              className="size-3.5 text-[var(--nav-fg)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            Email
          </a>
          {canNativeShare && (
            <button
              type="button"
              onClick={nativeShare}
              className={cn(SECONDARY_BUTTON, "flex-1")}
            >
              <ArrowUpRight
                className="size-3.5 text-[var(--nav-fg)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              More options
            </button>
          )}
        </div>
      </ActionBlock>
    );
  } else if (team?.teamUrl && (locked || !isPublic)) {
    body = (
      <ActionBlock>
        <UrlRow url={team.teamUrl} />
      </ActionBlock>
    );
  }

  // The closing sentence.
  const playerName = getMatchSides(match).you.name;
  let note: React.ReactNode;
  if (error) {
    note = <span className="text-[var(--danger)]">{error}</span>;
  } else if (locked) {
    note = (
      <>
        <Lock
          className="size-[11px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {publicLinkOn
          ? `A public link is on. ${playerName} or team staff can copy it.`
          : `${playerName} or team staff can make a public link.`}
      </>
    );
  } else if (on && link?.madeBy) {
    note = (
      <>
        <PersonAvatar
          initials={link.madeBy.initials}
          photoUrl={link.madeBy.photoUrl}
          className="size-[18px] bg-[var(--ink-200)] text-[9px]"
        />
        {`Made ${link.madeOn ? `${link.madeOn} ` : ""}by ${
          link.madeBy.isViewer ? "you" : link.madeBy.name
        } · Statistics only`}
      </>
    );
  } else if (team?.teamUrl && !isPublic) {
    note = "Teammates sign in to open this link.";
  } else {
    note = "Links show statistics only — never the video.";
  }

  return (
    <div className="flex flex-col">
      <div
        role="radiogroup"
        aria-label="Who can open this match"
        aria-disabled={locked || undefined}
        onKeyDown={moveFocusBetweenRungs}
        className="flex flex-col"
      >
        <AccessOption
          chosen={!isPublic}
          locked={locked}
          onChoose={() => choose("private")}
          {...privateRung}
        />
        <AccessOption
          chosen={isPublic}
          locked={locked}
          onChoose={() => choose("public")}
          label="Anyone with the link"
          description="No sign-in needed"
        />
      </div>

      {body && (
        <>
          <FloatMenuDivider className="mx-2.5 bg-[var(--border-medium)]" />
          {body}
        </>
      )}

      <FloatMenuDivider className="mx-2.5 bg-[var(--border-medium)]" />
      <p
        aria-live="polite"
        className="text-micro flex items-center gap-2 px-2.5 pt-1.5 pb-2 leading-[15px] text-[var(--ink-500)]"
      >
        {note}
      </p>
    </div>
  );
}

/**
 * The block between the hairlines. Its 10px side inset puts every edge in it
 * — the pill, Copy, the send buttons — on the same verticals as the radio
 * dots and the note above and below.
 */
function ActionBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-2.5 pt-2 pb-2.5">{children}</div>
  );
}

/**
 * Who the team rung means, at a glance: the first three members overlapped on
 * a 2px white ring, then "+N" for the rest. The count is read out once, as
 * words; the faces are glyphs for it.
 */
function TeamFaces({
  faces,
  count,
}: {
  faces: SharePerson[];
  count: number | null;
}) {
  if (faces.length === 0) return null;
  const rest = count !== null ? count - faces.length : 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5 self-center">
      <span className="flex">
        {faces.map((face, i) => (
          <PersonAvatar
            key={`${face.initials}-${i}`}
            initials={face.initials}
            photoUrl={face.photoUrl}
            className={cn(
              "size-[22px] bg-[var(--ink-200)] text-[9px] ring-2 ring-[var(--surface-card)]",
              i > 0 && "-ml-1.5",
            )}
          />
        ))}
      </span>
      {rest > 0 && (
        <span
          aria-hidden="true"
          className="text-micro text-[var(--ink-500)] tabular-nums"
        >
          +{rest}
        </span>
      )}
      {count !== null && <span className="sr-only">{count} people</span>}
    </span>
  );
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
