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
import { ArrowUpRight, Filter, Lock, Mail, Share2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { FloatMenuDivider } from "@/components/ui/float-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AccessOption,
  UrlRow,
  moveFocusBetweenRungs,
} from "@/components/ui/share-panel";
import { getMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  disableMatchShare,
  enableMatchShare,
  setMatchShareVideo,
  setMatchShareVisualizations,
  type ShareActionResult,
} from "@/app/dashboard/matches/(detail)/[matchId]/share-actions";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";
import type {
  MatchShareLink,
  MatchShareState,
  SharePerson,
} from "@/lib/data/match-share-server";
import {
  filmSharePresetOf,
  realTournamentName,
  withFilmSharePreset,
  type FilmSharePreset,
} from "@/lib/data/match-share-format";
import { VIEW_ICONS } from "@/components/dashboard/matches/match-detail/report-view-switcher";
import type { ReportView } from "@/components/dashboard/matches/match-detail/report-view";

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
  /**
   * The match has a video this viewer can play (`getMatchVideo` in
   * `page.tsx`). Without one the link's "Include video" option is not drawn.
   */
  hasVideo?: boolean;
}

/**
 * The share popover for the match on the page, around whatever trigger the
 * surface draws:
 *
 *   <ShareMatchButton trigger={ShareRailTrigger} side="top" align="start" />
 *
 * It owns the popover, its panel and the ⌘⇧L / Ctrl+Shift+L shortcut; the
 * trigger owns only how it looks. The match comes from `MatchDataProvider`
 * and the report's meta from `MatchReportProvider`, so this must render under
 * both — the match detail layout and the report page's provider.
 *
 * On a read-only report (`meta.readOnly` — the public link, the sample match)
 * it draws nothing and binds no shortcut: there is nothing of the reader's to
 * hand out. The check lives here rather than in the Server Component that
 * mounts it, so a page may mount it unconditionally.
 */
export function ShareMatchButton(
  props: ShareMatchButtonProps,
): React.JSX.Element | null {
  // Guard first, then the popover in its own component, so none of its hooks
  // is ever called conditionally.
  const { meta } = useMatchReport();
  if (meta.readOnly) return null;
  return <SharePopover {...props} />;
}

function SharePopover({
  trigger: Trigger,
  side = "bottom",
  align = "end",
  share,
  hasVideo = false,
}: ShareMatchButtonProps): React.JSX.Element {
  const { match } = useMatchData();
  // An Ask action links here with `?share=1` (`ask/actions.ts`): the
  // popover opens on arrival — read on the first render, so it does not
  // open a frame late — and sharing still takes the same click.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("share") === "1");

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
          hasVideo={hasVideo}
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
 * Each section opens on a quiet sentence-case label ("Who can open it", "On
 * the link", "Team link") — the popover has three short jobs and the label is
 * what keeps the option rows from reading as loose controls.
 *
 * Below a hairline sits whatever the chosen rung can hand out. "Only you":
 * nothing. A team: the `/dashboard` URL (members sign in to open it). "Anyone
 * with the link":
 *
 *   - what the link shows, one menu row per view with the rail switcher's own
 *     glyph: Statistics ("Always"), then Visualizations and Video with a box
 *     at the right edge. Both are edited in place — the URL already handed
 *     out keeps working. Visualizations starts ticked. Video starts clear and
 *     is drawn only for a match that has one; on a team match it is the
 *     staff's to tick unless the program lets its players
 *     (`share.canShareVideo`), and a viewer who may not sees the row
 *     unavailable with "Team staff only" where the box would be. Anyone who
 *     may share the match can take the video back off.
 *   - the link and Copy — the popover's ONE button.
 *   - the other ways out as menu rows, not buttons: "Email the link" and,
 *     where the browser can, "More ways to share…".
 *
 * Under a second hairline, one closing sentence: who made the link and when,
 * or what a link would carry.
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
  hasVideo = false,
  onClose,
  filmPreset,
}: {
  match: Match;
  share: MatchShareState;
  hasVideo?: boolean;
  onClose: () => void;
  /**
   * The Video tab's applied cut, when the popover was opened from it
   * (`filmSharePresetOf`). Read off the address bar when omitted; a spec
   * passes one in. Offered as "Open on these points" under "On the link"
   * while the link carries the video.
   */
  filmPreset?: FilmSharePreset | null;
}) {
  const {
    link: shareLink,
    canShare,
    canShareVideo,
    publicLinkOn,
    audience,
  } = share;
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [link, setLink] = useState<MatchShareLink | null>(shareLink);
  const [error, setError] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimisticOn, setOptimisticOn] = useOptimistic(link !== null);
  // The cut the Video tab had applied when this opened (`?tab=film` with
  // `?f=` and/or `?pn=`), offered as a row under "On the link". Ticked, the
  // URL copied, mailed or shared opens the film on exactly those points —
  // an answer's "Watch" link, forwarded (roadmap 6.3). Read once, when the
  // popover opens, and written nowhere: the link row itself is untouched,
  // so nothing is published beyond what the ladder above turned on.
  // Only the point set travels. A filter (`f`) names players as "you" and
  // "opponent" from the viewer's seat, but the public page reads "you" from
  // the link maker's: forwarded by someone sitting the other seat, the same
  // `f` would filter to the other player's points under a "You" chip. Point
  // numbers are the same for everyone.
  const [preset] = useState<FilmSharePreset | null>(() => {
    const read =
      filmPreset !== undefined
        ? filmPreset
        : typeof window === "undefined"
          ? null
          : filmSharePresetOf(window.location.search);
    return read?.points ? { filters: null, points: read.points } : null;
  });
  const [withPoints, setWithPoints] = useState(false);

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

  const baseUrl = link?.url ?? "";
  // Only a link that carries the video has a Video tab to open on.
  const presetOffered =
    hasVideo && preset !== null && link?.includesVideo === true;
  const url =
    presetOffered && withPoints
      ? withFilmSharePreset(baseUrl, preset)
      : baseUrl;
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
      setLink(
        result.url
          ? {
              url: result.url,
              includesVisualizations: result.includesVisualizations,
              includesVideo: result.includesVideo,
            }
          : null,
      );
    });
  }

  // Optimistic like the ladder: the box moves at once and settles on the
  // server's answer, or steps back with the error.
  function updateOption(
    patch: Partial<MatchShareLink>,
    save: () => Promise<ShareActionResult>,
    failure: (result: Extract<ShareActionResult, { ok: false }>) => string,
  ) {
    if (!link || pending) return;
    const before = link;
    setError(null);
    setLink({ ...before, ...patch });
    startTransition(async () => {
      const result = await save();
      if (!result.ok) {
        setLink(before);
        setError(failure(result));
      }
    });
  }

  const setVisualizations = (next: boolean) =>
    updateOption(
      { includesVisualizations: next },
      () => setMatchShareVisualizations(match.id, next),
      () => "Couldn't update the link. Try again.",
    );

  const setVideo = (next: boolean) =>
    updateOption(
      { includesVideo: next },
      () => setMatchShareVideo(match.id, next),
      (result) =>
        result.error === "forbidden"
          ? "Only team staff can share this match's video."
          : "Couldn't update the link. Try again.",
    );

  // Adding the video is the staff's unless the program lets players; taking
  // it off is anyone's who may share the match, so a ticked box stays live.
  const videoRowLive = canShareVideo || link?.includesVideo === true;

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
      <>
        <SectionLabel>On the link</SectionLabel>
        {/* What the link shows, one menu row each: the view's own glyph (the
            rail switcher's), its name, and at the right edge the thing that
            decides it — "Always" for Statistics, a box for the two options. */}
        <div
          role="group"
          aria-label="What the link shows"
          className="flex flex-col"
        >
          <div className={SCOPE_ROW}>
            <ScopeGlyph view="statistics" />
            <span className={SCOPE_NAME}>Statistics</span>
            <span className="text-micro text-[var(--ink-600)]">Always</span>
          </div>
          <label className={cn(SCOPE_ROW, ROW_HOVER, "cursor-pointer")}>
            <ScopeGlyph view="shots" />
            <span className={SCOPE_NAME}>Visualizations</span>
            <Checkbox
              checked={link.includesVisualizations}
              onChange={setVisualizations}
            />
          </label>
          {hasVideo &&
            (videoRowLive ? (
              <label className={cn(SCOPE_ROW, ROW_HOVER, "cursor-pointer")}>
                <ScopeGlyph view="film" />
                <span className={SCOPE_NAME}>Video</span>
                <Checkbox checked={link.includesVideo} onChange={setVideo} />
              </label>
            ) : (
              // Unavailable, not removed: still a tab stop, and it says why
              // (DS › Settings: never a bare `disabled`, the reason beside it).
              <div
                role="checkbox"
                aria-checked={false}
                aria-disabled="true"
                tabIndex={0}
                className={cn(
                  SCOPE_ROW,
                  "outline-none focus-visible:shadow-[var(--focus-ring)]",
                )}
              >
                <ScopeGlyph view="film" muted />
                <span className={cn(SCOPE_NAME, "text-[var(--ink-600)]")}>
                  Video
                </span>
                <span className="text-micro inline-flex items-center gap-[5px] text-[var(--ink-600)]">
                  <Lock
                    className="size-[11px] text-[var(--ink-400)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Team staff only
                </span>
              </div>
            ))}
          {presetOffered && (
            <label
              className={cn(SCOPE_ROW, ROW_HOVER, "cursor-pointer")}
              data-share-preset-row=""
            >
              <Filter
                className="size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className={SCOPE_NAME}>Open on these points</span>
              <Checkbox checked={withPoints} onChange={setWithPoints} />
            </label>
          )}
        </div>
        <div className="px-2.5 pt-2 pb-2.5">
          <UrlRow url={url} />
        </div>
        {/* The other ways out are menu rows, not a second set of buttons:
            Copy is the popover's one button. */}
        <div className="-mt-1 flex flex-col pb-0.5">
          <a
            href={buildMailtoHref(match, url)}
            className={cn(
              SCOPE_ROW,
              ROW_HOVER,
              ROW_TEXT,
              "shrink-0 no-underline",
            )}
          >
            <Mail
              className="size-[13px] shrink-0 text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            Email the link
          </a>
          {canNativeShare && (
            <button
              type="button"
              onClick={nativeShare}
              className={cn(
                SCOPE_ROW,
                ROW_HOVER,
                ROW_TEXT,
                "w-full shrink-0 cursor-pointer text-left",
              )}
            >
              <ArrowUpRight
                className="size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              More ways to share…
            </button>
          )}
        </div>
      </>
    );
  } else if (team?.teamUrl && (locked || !isPublic)) {
    body = (
      <>
        <SectionLabel>Team link</SectionLabel>
        <div className="px-2.5 pt-1.5 pb-2.5">
          <UrlRow url={team.teamUrl} />
        </div>
      </>
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
        }`}
      </>
    );
  } else if (on) {
    // Just turned on: the maker and date arrive with the page's next render.
    note = "Anyone with the link can open this match report.";
  } else if (team?.teamUrl && !isPublic) {
    note = "Teammates sign in to open this link.";
  } else {
    // Only a match with a video has anything to say about it; the sentence
    // read as a riddle on one without ("added" to what?).
    note = hasVideo
      ? "The video is not on a link unless you add it."
      : "A link shows the match report only.";
  }

  return (
    <div className="flex flex-col">
      <SectionLabel>Who can open it</SectionLabel>
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
 * A section's name, in the menu's own quiet label: sentence case, 11px — the
 * popover has three short sections (who, what, the link) and without a word
 * over each the option rows read as loose controls under the link.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-0.5 text-[11px] leading-[14px] text-[var(--ink-600)]">
      {children}
    </div>
  );
}

/** One 32px menu row: 10px inset, on the radio dots' vertical. */
const SCOPE_ROW =
  "flex h-8 items-center gap-2.5 rounded-[var(--radius-element)] px-2.5";
const ROW_HOVER =
  "transition-colors duration-100 hover:bg-[var(--surface-subtle)]";
const ROW_TEXT = "text-[13px] leading-[18px] text-[var(--ink-900)]";
/** A row's name, taking the width between its glyph and its control. */
const SCOPE_NAME = `flex-1 ${ROW_TEXT}`;

/** The view's glyph, the one the report's rail switcher draws for it. */
function ScopeGlyph({ view, muted }: { view: ReportView; muted?: boolean }) {
  const Icon = VIEW_ICONS[view];
  return (
    <Icon
      className={cn(
        "size-[13px] shrink-0",
        muted ? "text-[var(--ink-300)]" : "text-[var(--ink-400)]",
      )}
      strokeWidth={1.5}
      aria-hidden="true"
    />
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
