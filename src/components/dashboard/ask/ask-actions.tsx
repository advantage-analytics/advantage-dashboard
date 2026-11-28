"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Download,
  Grid2x2,
  MoreHorizontal,
  Pin,
  PinOff,
  Play,
  Share2,
  User,
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
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
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
   * answer has no saved id yet (nothing to pin to), in which case the row
   * says so and waits.
   */
  onPin?: () => Promise<AskPinOutcome>;
  onUnpin?: (pinId: string) => Promise<boolean>;
  /** Save a view, as the page wires `createSavedView`. */
  onSaveView?: (draft: AskSavedViewDraft) => Promise<AskSaveViewOutcome>;
}

export const ASK_ACTIONS_COPY = {
  label: "More for this answer",
  tooltip: "More",
  pin: "Pin to Home",
  pinning: "Pinning…",
  pinned: {
    personal: "Pinned to your Home page",
    team: "Pinned to the team Home",
  },
  openHome: "Open Home",
  unpin: "Unpin from Home",
  unpinning: "Unpinning…",
  unpinned: "Unpinned",
  pinWaits: "Available once the answer is saved",
  pinFailed: {
    forbidden: "This answer can't be pinned.",
    no_visual: "This answer has no chart to pin.",
    failed: "Could not pin that. Try again.",
    invalid: "Could not pin that. Try again.",
  },
  unpinFailed: "Could not unpin that. Try again.",
  save: "Save as a view",
  saveConfirm: "Save view",
  saved: "Saved",
  openView: "Open the saved view",
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
 * One glyph per action, before its words, in the menu's quiet ink: the play
 * mark for the film, the court grid for the Visualizations tab, the pin for
 * Home, the bookmark for a saved view, the download for the file, and the
 * arrow for a page the action leaves for.
 */
const ACTION_ICON: Record<AskAction["kind"], LucideIcon> = {
  watch: Play,
  pin: Pin,
  visualize: Grid2x2,
  save_view: Bookmark,
  export: Download,
  share: Share2,
  open_player: User,
};

const MENU_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/** A menu row that is a link: `FloatMenuItem`'s light row, as an anchor. */
const MENU_LINK =
  "flex cursor-pointer items-start gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none";

function MenuLinkBody({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <>
      <span className="mt-[3px] w-3 shrink-0">
        <Icon className={MENU_ICON} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-900)]">
        {children}
      </span>
    </>
  );
}

function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className={MENU_ICON} strokeWidth={1.5} aria-hidden="true" />;
}

/** The CSV download; the data URL is built once per file, not on every render. */
function ExportRow({
  action,
  onDone,
}: {
  action: Extract<AskAction, { kind: "export" }>;
  onDone: () => void;
}) {
  const href = useMemo(() => askCsvDataUrl(action.file), [action.file]);
  return (
    <a
      role="menuitem"
      href={href}
      download={action.file.filename}
      onClick={onDone}
      data-ask-action="export"
      className={MENU_LINK}
    >
      <MenuLinkBody icon={ACTION_ICON.export}>{action.label}</MenuLinkBody>
    </a>
  );
}

/**
 * Everything the answer offers beyond watching its points, behind one ⋯ on
 * the signature's row (`AskAnswer`'s `actions` slot, after the thumbs):
 * see it on the court, pin it to Home, save the court as a view, download
 * the chart's rows, share the match, open the player. The answer is the
 * content, and "Watch the points" above is the one next step left in view;
 * a row of five equal text actions competed with both.
 *
 * Nothing executes on render — a link action is a link, a pin or a save
 * runs only on a pick and only through the page's server action with the
 * app's own confirmation, and an export is a `data:` link the browser
 * downloads. What a pick changes is said in a status region beside the ⋯;
 * a refusal is an alert there.
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"pin" | "unpin" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState<SavedView | null>(null);
  if (actions.length === 0) return null;

  const close = () => setOpen(false);
  const saveAction = actions.find(
    (action): action is Extract<AskAction, { kind: "save_view" }> =>
      action.kind === "save_view",
  );

  async function pin() {
    if (!onPin || pending) return;
    close();
    setPending("pin");
    setProblem(null);
    try {
      const outcome = await onPin();
      if (outcome.ok) setAnnouncement(ASK_ACTIONS_COPY.pinned[scope.kind]);
      else setProblem(ASK_ACTIONS_COPY.pinFailed[outcome.error]);
    } catch {
      setProblem(ASK_ACTIONS_COPY.pinFailed.failed);
    }
    setPending(null);
  }

  async function unpin() {
    if (!onUnpin || !pinId || pending) return;
    close();
    setPending("unpin");
    setProblem(null);
    let done = false;
    try {
      done = await onUnpin(pinId);
    } catch {
      done = false;
    }
    if (done) setAnnouncement(ASK_ACTIONS_COPY.unpinned);
    else setProblem(ASK_ACTIONS_COPY.unpinFailed);
    setPending(null);
  }

  // The export and the links leave the answer; the stateful rows come first
  // in reading order, then a rule, then the ways out.
  const exits = actions.filter(
    (action) =>
      action.kind === "export" ||
      action.kind === "share" ||
      action.kind === "open_player" ||
      action.kind === "watch",
  );
  const inPlace = actions.filter((action) => !exits.includes(action));

  function row(action: AskAction) {
    switch (action.kind) {
      case "pin":
        if (pinId) {
          return (
            <span key="pin" className="flex flex-col">
              <Link
                role="menuitem"
                href={HOME_HREF[scope.kind]}
                onClick={close}
                data-ask-action="open_home"
                className={MENU_LINK}
              >
                <MenuLinkBody icon={ArrowUpRight}>
                  {ASK_ACTIONS_COPY.openHome}
                </MenuLinkBody>
              </Link>
              <FloatMenuItem
                label={
                  pending === "unpin"
                    ? ASK_ACTIONS_COPY.unpinning
                    : ASK_ACTIONS_COPY.unpin
                }
                icon={<Glyph icon={PinOff} />}
                disabled={!onUnpin || pending !== null}
                onSelect={() => void unpin()}
              />
            </span>
          );
        }
        return (
          <FloatMenuItem
            key="pin"
            label={
              pending === "pin"
                ? ASK_ACTIONS_COPY.pinning
                : ASK_ACTIONS_COPY.pin
            }
            description={onPin ? undefined : ASK_ACTIONS_COPY.pinWaits}
            icon={<Glyph icon={Pin} />}
            disabled={!onPin || pending !== null}
            onSelect={() => void pin()}
          />
        );
      case "save_view":
        if (saved) {
          return (
            <Link
              key="save_view"
              role="menuitem"
              href={`${action.href}&view=${encodeURIComponent(saved.id)}`}
              onClick={close}
              data-ask-action="open_view"
              className={MENU_LINK}
            >
              <MenuLinkBody icon={ArrowUpRight}>
                {ASK_ACTIONS_COPY.openView}
              </MenuLinkBody>
            </Link>
          );
        }
        return (
          <FloatMenuItem
            key="save_view"
            label={ASK_ACTIONS_COPY.save}
            icon={<Glyph icon={ACTION_ICON.save_view} />}
            disabled={!onSaveView}
            onSelect={() => {
              close();
              setProblem(null);
              setSaveOpen(true);
            }}
          />
        );
      case "export":
        return <ExportRow key="export" action={action} onDone={close} />;
      default:
        return (
          <Link
            key={action.kind}
            role="menuitem"
            href={action.href}
            onClick={close}
            data-ask-action={action.kind}
            className={MENU_LINK}
          >
            <MenuLinkBody icon={ACTION_ICON[action.kind]}>
              {action.label}
            </MenuLinkBody>
          </Link>
        );
    }
  }

  return (
    <span data-ask-actions="" className="inline-flex items-center gap-2">
      <ChromeTooltip label={ASK_ACTIONS_COPY.tooltip} side="top" hidden={open}>
        <span className="inline-flex">
          <FloatMenu
            open={open}
            onOpenChange={setOpen}
            width={212}
            align="start"
            side="top"
            label={ASK_ACTIONS_COPY.label}
            trigger={
              <button
                type="button"
                aria-label={ASK_ACTIONS_COPY.label}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-500)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
              >
                <MoreHorizontal
                  className="size-[13px]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            }
          >
            {inPlace.map(row)}
            {inPlace.length > 0 && exits.length > 0 && <FloatMenuDivider />}
            {exits.map(row)}
          </FloatMenu>
        </span>
      </ChromeTooltip>
      <span role="status" className="sr-only">
        {saved ? `${ASK_ACTIONS_COPY.saved} · ${saved.name}` : announcement}
      </span>
      {problem && (
        <span role="alert" className="text-[11px] text-[var(--danger-text)]">
          {problem}
        </span>
      )}
      {saveAction && (
        <SaveViewDialog
          action={saveAction}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSaveView={onSaveView}
          onSaved={setSaved}
        />
      )}
    </span>
  );
}

/**
 * The one confirm shell with a name field; the save runs on its action,
 * never on the menu's row. Once saved, the row becomes "Open the saved view".
 */
function SaveViewDialog({
  action,
  open,
  onOpenChange,
  onSaveView,
  onSaved,
}: {
  action: Extract<AskAction, { kind: "save_view" }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveView?: AskActionCardsProps["onSaveView"];
  onSaved: (view: SavedView) => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(action.view.name);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    if (!onSaveView || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const outcome = await onSaveView({ ...action.view, name });
      if (outcome.ok) {
        onSaved(outcome.view);
        onOpenChange(false);
      } else {
        setProblem(ASK_ACTIONS_COPY.saveFailed[outcome.error]);
      }
    } catch {
      // A request that never answered is not a refusal: say try again.
      setProblem(ASK_ACTIONS_COPY.saveError);
    }
    setPending(false);
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setProblem(null);
      }}
      title={ASK_ACTIONS_COPY.saveTitle}
      description={ASK_ACTIONS_COPY.saveDescription}
      confirmLabel={ASK_ACTIONS_COPY.saveConfirm}
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
  );
}
