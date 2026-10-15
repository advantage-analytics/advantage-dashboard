"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { SavedView } from "@/lib/data/saved-views-logic";
import {
  askCsvDataUrl,
  type AskAction,
  type AskSavedViewDraft,
} from "@/lib/services/ask/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { advButton } from "@/lib/ui/adv-button";
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
  pinned: "On your Home page",
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
  open: "Open",
  watch: "Watch",
  download: "Download",
} as const;

/**
 * The cards under an answer: what it offers to do next, one button each.
 * Nothing executes on render — a link action is a link, a pin or a save
 * runs only on a click and only through the page's server action with the
 * app's own confirmation, and an export is a `data:` link the browser
 * downloads. Compact cards in a wrapping row, white on the white thread,
 * told from it by the hairline and the card shadow (cards never nest; the
 * answer is not a card).
 *
 * Keep this file's imports clear of `next/navigation` and server actions:
 * the page hands in callbacks, and an offline harness renders this.
 */
export function AskActionCards({
  actions,
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
      className="m-0 flex list-none flex-wrap items-start gap-2.5 p-0"
    >
      {actions.map((action) => (
        <li
          key={action.kind}
          data-ask-action={action.kind}
          className="flex w-[200px] max-w-full flex-col gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-card)] max-md:w-[calc(50%-5px)]"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-[12px] font-medium text-[var(--ink-900)]">
              {action.label}
            </p>
            <p className="line-clamp-2 text-[11px] leading-[1.45] text-[var(--ink-500)]">
              {action.detail}
            </p>
          </div>
          <div className="mt-auto flex min-w-0 flex-col gap-1.5">
            {action.kind === "pin" ? (
              <PinControl pinId={pinId} onPin={onPin} onUnpin={onUnpin} />
            ) : action.kind === "save_view" ? (
              <SaveViewControl action={action} onSaveView={onSaveView} />
            ) : action.kind === "export" ? (
              <a
                href={askCsvDataUrl(action.file)}
                download={action.file.filename}
                className={cn(advButton("outline", "sm"), "self-start")}
              >
                {ASK_ACTIONS_COPY.download}
              </a>
            ) : (
              <Link
                href={action.href}
                className={cn(advButton("outline", "sm"), "self-start")}
              >
                {action.kind === "watch"
                  ? ASK_ACTIONS_COPY.watch
                  : ASK_ACTIONS_COPY.open}
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pin, then "On your Home page · Open Home · Unpin". The button is disabled
 * while the answer has no saved id, with a line saying why: a button that
 * refuses on click is worse than one that waits.
 */
function PinControl({
  pinId,
  onPin,
  onUnpin,
}: Pick<AskActionCardsProps, "pinId" | "onPin" | "onUnpin">) {
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
        <p role="status" className="text-[11px] text-[var(--ink-700)]">
          {ASK_ACTIONS_COPY.pinned}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-[12px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            {ASK_ACTIONS_COPY.openHome}
          </Link>
          <button
            type="button"
            onClick={() => void unpin()}
            disabled={pending !== null || !onUnpin}
            className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)] disabled:cursor-default disabled:text-[var(--text-disabled)]"
          >
            {pending === "unpin"
              ? ASK_ACTIONS_COPY.unpinning
              : ASK_ACTIONS_COPY.unpin}
          </button>
        </div>
        {problem && (
          <p role="alert" className="text-[11px] text-[var(--danger-text)]">
            {problem}
          </p>
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
        className={cn(advButton("outline", "sm"), "self-start")}
      >
        {pending === "pin" ? ASK_ACTIONS_COPY.pinning : ASK_ACTIONS_COPY.pin}
      </button>
      {!onPin && (
        <p className="text-[11px] text-[var(--ink-500)]">
          {ASK_ACTIONS_COPY.pinWaits}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-[11px] text-[var(--danger-text)]">
          {problem}
        </p>
      )}
    </>
  );
}

/**
 * "Save view" opens the one confirm shell with a name field; the save runs
 * on its action, never on the card's button. Once saved, the card links to
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
      setProblem(ASK_ACTIONS_COPY.saveFailed.forbidden);
    }
    setPending(false);
  }

  if (saved) {
    const href = `${action.href}&view=${encodeURIComponent(saved.id)}`;
    return (
      <>
        <p role="status" className="text-[11px] text-[var(--ink-700)]">
          {ASK_ACTIONS_COPY.saved} · {saved.name}
        </p>
        <Link
          href={href}
          className="self-start text-[12px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
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
        className={cn(advButton("outline", "sm"), "self-start")}
      >
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
