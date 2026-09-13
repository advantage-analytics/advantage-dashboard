import { Check, TriangleAlert } from "lucide-react";
import type { IdentityMatchStatus } from "./types";

export interface ImportIdentityNoticeProps {
  /**
   * The hook's comparison — `evaluateImportedIdentityMatch()`, already run.
   * This component never re-derives the predicate; it only words the answer.
   */
  comparison: IdentityMatchStatus;
  workspaceKind: "personal" | "team";
  confirmed: boolean;
  rejected: boolean;
  onConfirm: () => void;
  onReject: () => void;
  /** Withdraws either answer and asks again. */
  onChangeAnswer: () => void;
  onChangeFile: () => void;
  /** Only where a different athlete can be picked — a team upload with no preset. */
  onChangePlayer?: () => void;
}

/**
 * The explicit checkpoint between reading an export and using its player-one
 * perspective.
 *
 * Why it exists: a SwingVision export writes every point, shot and statistic
 * from ITS player 1's side. Nothing on screen looks broken when that is the
 * other person — the match simply files the opponent's serve percentage under
 * our athlete. So the wizard asks, with the export's name on screen, and blocks
 * the step until it is answered.
 *
 * Rules this component keeps:
 *
 * 1. It consumes `comparison`; it never decides whether the names match.
 * 2. Neither answer touches an id. "Yes" records a confirmation keyed to this
 *    file and this athlete; "No" explains that the fix is a differently
 *    oriented export, because relabelling names here would leave the numbers
 *    attributed to the other player. `matches.player1_id` is decided by
 *    `wizardUploadEligibility()` from the CHOSEN athlete, and no button here
 *    reaches it.
 * 3. The DS warning question: the answers are stacked text rows, never
 *    buttons, and each names its subject so "No" can't be read as denying the
 *    export's player. An answer collapses the question to one line that keeps
 *    a way back — Yes settles to a grey line, No stays amber because the file
 *    still can't be used.
 */
export function ImportIdentityNotice({
  comparison,
  workspaceKind,
  confirmed,
  rejected,
  onConfirm,
  onReject,
  onChangeAnswer,
  onChangeFile,
  onChangePlayer,
}: ImportIdentityNoticeProps) {
  const importedName = comparison.importedName.trim();
  const athleteName = comparison.athleteName.trim();
  // Two different gaps, two different fixes: an export that names nobody is a
  // file problem; an athlete that names nobody is an unanswered question on
  // this wizard, and offering a confirmation there would be a dead button —
  // the hook refuses a confirmation with no subject chosen.
  const athleteMissing = !athleteName;
  const importedMissing = !importedName;
  const personal = workspaceKind === "personal";

  if (athleteMissing) {
    return (
      <Warning
        lead="No player is selected yet."
        body={
          importedMissing
            ? "This export doesn’t name a player 1 either."
            : `This export lists ${importedName} as player 1.`
        }
      >
        {onChangePlayer ? (
          <>
            <Quiet onClick={onChangeFile}>Choose another file</Quiet>
            <Strong onClick={onChangePlayer}>Change player</Strong>
          </>
        ) : (
          <Strong onClick={onChangeFile}>Choose another file</Strong>
        )}
      </Warning>
    );
  }

  if (confirmed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex animate-in items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5 duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
      >
        <Check
          className="size-3.5 shrink-0 text-[var(--ink-700)]"
          strokeWidth={2}
          aria-hidden="true"
        />
        <p className="flex-1 text-[12px] leading-[1.5] text-[var(--ink-700)]">
          {personal
            ? "You’re player 1 in this export."
            : `${athleteName} is player 1 in this export.`}
        </p>
        <button
          type="button"
          onClick={onChangeAnswer}
          className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
        >
          Change
        </button>
      </div>
    );
  }

  if (rejected) {
    return (
      <Warning
        lead={`This export can’t be used for ${personal ? "you" : athleteName}.`}
        body={`Its stats follow player 1 — choose one where ${
          personal ? "you’re" : `${athleteName} is`
        } player 1.`}
        settle
      >
        <Quiet onClick={onChangeAnswer}>Change answer</Quiet>
        {onChangePlayer && (
          <Quiet onClick={onChangePlayer}>Change player</Quiet>
        )}
        <Strong onClick={onChangeFile}>Choose another file</Strong>
      </Warning>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-[var(--radius-element)] border border-[var(--warning-border)] bg-[var(--warning-bg)] pt-3 pr-3.5 pb-2 pl-3.5 text-[12px] leading-[1.5] text-[var(--warning-text)]"
    >
      <WarningGlyph />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p>
          <b className="font-medium">
            {personal ? "Are you player 1?" : `Is ${athleteName} player 1?`}
          </b>{" "}
          {importedMissing
            ? "This export doesn’t name one."
            : `This export lists ${importedName}.`}
        </p>
        <div className="-ml-3 flex flex-col gap-0.5">
          <Answer onClick={onConfirm}>
            {personal ? "Yes, I’m player 1" : `Yes, ${athleteName} is player 1`}
          </Answer>
          <Answer onClick={onReject}>
            {personal ? "No, I’m not player 1" : "No, it’s someone else"}
          </Answer>
        </div>
      </div>
    </div>
  );
}

function WarningGlyph() {
  return (
    <TriangleAlert
      className="mt-0.5 size-[15px] shrink-0"
      strokeWidth={1.75}
      aria-hidden="true"
    />
  );
}

/**
 * One line in the warning register, announced: `role="status"` with a polite
 * live region, because it appears after the person's attention has moved on —
 * an export finishing its parse, or their own answer landing.
 */
function Warning({
  lead,
  body,
  settle = false,
  children,
}: {
  lead: string;
  body: string;
  settle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[var(--radius-element)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3.5 py-2.5 text-[12px] leading-[1.5] text-[var(--warning-text)] ${
        settle
          ? "animate-in duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
          : ""
      }`}
    >
      <WarningGlyph />
      <p className="min-w-[14rem] flex-1">
        <b className="font-medium">{lead}</b> {body}
      </p>
      <div className="flex items-center gap-3.5">{children}</div>
    </div>
  );
}

/** A stacked answer: a full-width text row that washes on hover and press. */
function Answer({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-button)] px-3 py-2 text-left text-[12px] text-[var(--warning-text)] transition-colors duration-150 hover:bg-[var(--warning-border)]/60 active:bg-[var(--warning-border)]"
    >
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 rounded-full border-[1.5px] border-[var(--warning-text)]/35 transition-colors duration-150 group-hover:border-[var(--warning-text)]"
      />
      {children}
    </button>
  );
}

function Strong({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[12px] font-medium whitespace-nowrap text-[var(--warning-text)] underline decoration-[var(--warning-border)] underline-offset-[3px] transition-colors duration-150 hover:decoration-[var(--warning-text)]"
    >
      {children}
    </button>
  );
}

function Quiet({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[12px] whitespace-nowrap text-[var(--warning-text)] opacity-70 transition-opacity duration-150 hover:opacity-100"
    >
      {children}
    </button>
  );
}
