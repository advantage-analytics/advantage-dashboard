import { Check, TriangleAlert } from "lucide-react";
import {
  noteIconCls,
  noteStripCls,
  noticeEnterCls,
  warningStripCls,
} from "./styles";
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

  // Each state is its own element (`key`), never the same box restyled — see
  // `ScoreCheckNotice`: a yellow box turning grey in place reads as a glitch.
  if (confirmed) {
    return (
      <div
        key="confirmed"
        role="status"
        aria-live="polite"
        className={`${noteStripCls} ${noticeEnterCls}`}
      >
        <Check
          className={`${noteIconCls} text-[var(--ink-700)]`}
          strokeWidth={2}
          aria-hidden="true"
        />
        <p className="flex-1">
          {personal
            ? "You’re player 1 in this export."
            : `${athleteName} is player 1 in this export.`}
        </p>
        <button
          type="button"
          onClick={onChangeAnswer}
          className="cursor-pointer text-[11px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
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
      key="asking"
      role="status"
      aria-live="polite"
      className={`${warningStripCls} pb-1.5`}
    >
      <WarningGlyph />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p>
          <b className="font-medium">
            {personal ? "Are you player 1?" : `Is ${athleteName} player 1?`}
          </b>{" "}
          {importedMissing
            ? "This export doesn’t name one."
            : `This export lists ${importedName}.`}
        </p>
        <div className="-ml-2.5 flex flex-col">
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

/** Shared with `ScoreCheckNotice`, the other warning question in this wizard. */
export function WarningGlyph() {
  return (
    <TriangleAlert
      className={noteIconCls}
      strokeWidth={1.5}
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
      className={`${warningStripCls} flex-wrap gap-x-3 gap-y-1.5 ${
        settle ? noticeEnterCls : ""
      }`}
    >
      <WarningGlyph />
      <p className="min-w-[14rem] flex-1">
        <b className="font-medium">{lead}</b> {body}
      </p>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

/** A stacked answer: a full-width text row that washes on hover and press. */
export function Answer({
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
      className="group flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-button)] px-2.5 py-1.5 text-left text-[11px] text-[var(--warning-text)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--warning-border)]/60 active:scale-[0.99] active:bg-[var(--warning-border)] motion-reduce:active:scale-100"
    >
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full border-[1.5px] border-[var(--warning-text)]/35 transition-colors duration-150 group-hover:border-[var(--warning-text)]"
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
      className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--warning-text)] underline decoration-[var(--warning-border)] underline-offset-[3px] transition-colors duration-150 hover:decoration-[var(--warning-text)]"
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
      className="cursor-pointer text-[11px] whitespace-nowrap text-[var(--warning-text)] opacity-70 transition-opacity duration-150 hover:opacity-100"
    >
      {children}
    </button>
  );
}
