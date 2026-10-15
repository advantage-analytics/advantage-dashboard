"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Download,
  Grid2x2,
  Pin,
  Play,
  Share2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SavedView } from "@/lib/data/saved-views-logic";
import {
  askCsvDataUrl,
  type AskAction,
  type AskSavedViewDraft,
} from "@/lib/services/ask/actions";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/** What the page answers a pin request with. */
export type AskPinOutcome =
  | { ok: true; pinId: string }
  | { ok: false; error: "forbidden" | "no_visual" | "failed" | "invalid" };

/** What the page answers a save-view request with. */
export type AskSaveViewOutcome =
  | { ok: true; view: SavedView }
  | {
      ok: false;
      error:
        "duplicate_name" | "forbidden" | "invalid" | "unsupported_cut_chart";
    };

export interface AskActionCardsProps {
  /** The catalogue's answer for this exchange (`askActionsFor`). */
  actions: readonly AskAction[];
  /**
   * Whose Home a pin lands on and which words say so: the personal page
   * when omitted (the harness), the team page's scope on the team page.
   */
  scope?: AskScope;
  /**
   * The pin this answer already has on Home, or null. Set by the page from
   * the saved conversation and updated by `onPin` / `onUnpin`.
   */
  pinId: string | null;
  /**
   * Pin and unpin, as the page wires the server actions. Omitted when the
   * answer has no saved id yet (nothing to pin to), in which case the card
   * says so and its button waits.
   */
  onPin?: () => Promise<AskPinOutcome>;
  onUnpin?: (pinId: string) => Promise<boolean>;
  /** Save a view, as the page wires `createSavedView`. */
  onSaveView?: (draft: AskSavedViewDraft) => Promise<AskSaveViewOutcome>;
}

const ASK_ACTIONS_COPY = {
  label: "Next steps",
  pin: "Pin to Home",
  pinning: "Pinning…",
  pinned: {
    personal: "On your Home page",
    team: "On the team Home",
  },
  openHome: "Open Home",
  unpin: "Unpin",
  unpinning: "Unpinning…",
  pinWaits: "Available once the answer is saved",
  pinFailed: {
    forbidden: "This answer can't be pinned.",
    no_visual: "This answer has no chart to pin.",
    failed: "Could not pin that. Try again.",
    invalid: "Could not pin that. Try again.",
  },
  unpinFailed: "Could not unpin that. Try again.",
  save: "Save view",
  saved: "Saved",
  openView: "Open the view",
  saveTitle: "Save this view?",
  saveDescription:
    "The court and its filters are kept under Visualizations on every match.",
  saveName: "View name",
  saving: "Saving…",
  saveFailed: {
    duplicate_name: "A view with that name already exists.",
    forbidden: "You can't save a view here.",
    invalid: "Give the view a name of up to 60 characters.",
    unsupported_cut_chart: "That court can't be saved as a view yet.",
  },
  saveError: "Could not save that. Try again.",
} as const;

/** The Home a pin lands on, by the scope the answer was asked in. */
const HOME_HREF: Record<AskScope["kind"], string> = {
  personal: "/dashboard",
  team: "/dashboard/team",
};

/**
 * The row's one voice: 12px ink that darkens on hover, as the title row's
 * quiet link and the point list's Clear all — never a button, never blue.
 * The answer above is the content; what it offers next is a footnote the
 * reader can act on, not a second surface competing with it.
 */
const ACTION =
  "inline-flex cursor-pointer items-center gap-1.5 text-[12px] whitespace-nowrap text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:text-[var(--text-disabled)]";
/**
 * One glyph per action, before its words, in the row's own ink: the film
 * room's play mark for the film, the pin for Home, the court grid for the
 * Visualizations tab, the bookmark for a saved view, and the arrow for a
 * page the action leaves for. 12px, stroke 1.5 — the sidebar's weight.
 */
const ACTION_ICON: Record<AskAction["kind"], LucideIcon> = {
  watch: Play,
  pin: Pin,
  visualize: Grid2x2,
  save_view: Bookmark,
  export: Download,
  share: Share2,
  open_match: ArrowUpRight,
  open_player: User,
  open_opponent: Users,
};

function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon className="size-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
  );
}

/** A line that reports a state ("On your Home page") beside the actions. */
const STATUS = "text-[12px] whitespace-nowrap text-[var(--ink-700)]";
const PROBLEM = "text-[11px] text-[var(--danger-text)]";

/** The filter strip's separator, between one action and the next. */
function Dot() {
  return (
    <span
      aria-hidden="true"
      className="size-[3px] shrink-0 rounded-full bg-[var(--ink-300)]"
    />
  );
}

/**
 * What the answer offers to do next, as one quiet line under its footer:
 * each action a text control in reading order, the filter strip's dot
 * between them. Nothing executes on render — a link action is a link, a
 * pin or a save runs only on a click and only through the page's server
 * action with the app's own confirmation, and an export is a `data:` link
 * the browser downloads. No cards: the answer is the content, and the
 * thread is one white surface (cards never nest, and the answer is not a
 * card).
 *
 * Keep this file's imports clear of `next/navigation` and server actions:
 * the page hands in callbacks, and an offline harness renders this.
 */
export function AskActionCards({
  actions,
  scope = PERSONAL_ASK_SCOPE,
  pinId,
  onPin,
  onUnpin,
  onSaveView,
}: AskActionCardsProps) {
  if (actions.length === 0) return null;
  return (
    <ul
      aria-label={ASK_ACTIONS_COPY.label}
      data-ask-actions=""
      className="-mt-4 flex list-none flex-wrap items-center gap-x-2.5 gap-y-1.5 p-0"
    >
      {actions.map((action, index) => (
        <li
          key={action.kind}
          data-ask-action={action.kind}
          className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1"
        >
          {index > 0 && <Dot />}
          {action.kind === "pin" ? (
            <PinControl
              scopeKind={scope.kind}
              pinId={pinId}
              onPin={onPin}
              onUnpin={onUnpin}
            />
          ) : action.kind === "save_view" ? (
            <SaveViewControl action={action} onSaveView={onSaveView} />
          ) : action.kind === "export" ? (
            <a
              href={askCsvDataUrl(action.file)}
              download={action.file.filename}
              className={ACTION}
            >
              <Glyph icon={ACTION_ICON.export} />
              {action.label}
            </a>
          ) : (
            <Link href={action.href} className={ACTION}>
              <Glyph icon={ACTION_ICON[action.kind]} />
              {action.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Pin, then "On your Home page · Open Home · Unpin" in its place. The
 * control is disabled while the answer has no saved id, with a line saying
 * why: a control that refuses on click is worse than one that waits.
 */
function PinControl({
  scopeKind,
  pinId,
  onPin,
  onUnpin,
}: Pick<AskActionCardsProps, "pinId" | "onPin" | "onUnpin"> & {
  scopeKind: AskScope["kind"];
}) {
  const [pending, setPending] = useState<"pin" | "unpin" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function pin() {
    if (!onPin || pending) return;
    setPending("pin");
    setProblem(null);
    try {
      const outcome = await onPin();
      if (!outcome.ok) setProblem(ASK_ACTIONS_COPY.pinFailed[outcome.error]);
    } catch {
      setProblem(ASK_ACTIONS_COPY.pinFailed.failed);
    }
    setPending(null);
  }

  async function unpin() {
    if (!onUnpin || !pinId || pending) return;
    setPending("unpin");
    setProblem(null);
    let done = false;
    try {
      done = await onUnpin(pinId);
    } catch {
      done = false;
    }
    if (!done) setProblem(ASK_ACTIONS_COPY.unpinFailed);
    setPending(null);
  }

  if (pinId) {
    return (
      <>
        <span role="status" className={STATUS}>
          {ASK_ACTIONS_COPY.pinned[scopeKind]}
        </span>
        <Link href={HOME_HREF[scopeKind]} className={ACTION}>
          <Glyph icon={ArrowUpRight} />
          {ASK_ACTIONS_COPY.openHome}
        </Link>
        <button
          type="button"
          onClick={() => void unpin()}
          disabled={pending !== null || !onUnpin}
          className={ACTION}
        >
          {pending === "unpin"
            ? ASK_ACTIONS_COPY.unpinning
            : ASK_ACTIONS_COPY.unpin}
        </button>
        {problem && (
          <span role="alert" className={PROBLEM}>
            {problem}
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void pin()}
        disabled={!onPin || pending !== null}
        className={ACTION}
      >
        <Glyph icon={ACTION_ICON.pin} />
        {pending === "pin" ? ASK_ACTIONS_COPY.pinning : ASK_ACTIONS_COPY.pin}
      </button>
      {!onPin && (
        <span className="text-[11px] text-[var(--ink-500)]">
          {ASK_ACTIONS_COPY.pinWaits}
        </span>
      )}
      {problem && (
        <span role="alert" className={PROBLEM}>
          {problem}
        </span>
      )}
    </>
  );
}

/**
 * "Save view" opens the one confirm shell with a name field; the save runs
 * on its action, never on the row's control. Once saved, the row links to
 * the view.
 */
function SaveViewControl({
  action,
  onSaveView,
}: {
  action: Extract<AskAction, { kind: "save_view" }>;
  onSaveView?: AskActionCardsProps["onSaveView"];
}) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(action.view.name);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedView | null>(null);

  async function save() {
    if (!onSaveView || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const outcome = await onSaveView({ ...action.view, name });
      if (outcome.ok) {
        setSaved(outcome.view);
        setOpen(false);
      } else {
        setProblem(ASK_ACTIONS_COPY.saveFailed[outcome.error]);
      }
    } catch {
      // A request that never answered is not a refusal: say try again.
      setProblem(ASK_ACTIONS_COPY.saveError);
    }
    setPending(false);
  }

  if (saved) {
    const href = `${action.href}&view=${encodeURIComponent(saved.id)}`;
    return (
      <>
        <span role="status" className={STATUS}>
          {ASK_ACTIONS_COPY.saved} · {saved.name}
        </span>
        <Link href={href} className={ACTION}>
          <Glyph icon={ArrowUpRight} />
          {ASK_ACTIONS_COPY.openView}
        </Link>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!onSaveView}
        onClick={() => {
          setProblem(null);
          setOpen(true);
        }}
        className={ACTION}
      >
        <Glyph icon={ACTION_ICON.save_view} />
        {ASK_ACTIONS_COPY.save}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setProblem(null);
        }}
        title={ASK_ACTIONS_COPY.saveTitle}
        description={ASK_ACTIONS_COPY.saveDescription}
        confirmLabel={ASK_ACTIONS_COPY.save}
        pendingLabel={ASK_ACTIONS_COPY.saving}
        pending={pending}
        error={problem}
        onConfirm={() => void save()}
      >
        <label htmlFor={nameId} className="flex min-w-0 flex-col gap-2">
          <span className="text-[11px] text-[var(--ink-600)]">
            {ASK_ACTIONS_COPY.saveName}
          </span>
          <input
            id={nameId}
            value={name}
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            data-focus-ring="none"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
            className={cn(advField("underline"), "w-full outline-none")}
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
