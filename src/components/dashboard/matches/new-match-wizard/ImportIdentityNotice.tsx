import { advButton } from "@/lib/ui/adv-button";
import type { IdentityMatchStatus } from "./types";
import { WizardNotice } from "./WizardNotice";

export interface ImportIdentityNoticeProps {
  /**
   * The hook's comparison — `evaluateImportedIdentityMatch()`, already run.
   * This component never re-derives the predicate; it only words the answer.
   */
  comparison: IdentityMatchStatus;
  workspaceKind: "personal" | "team";
  rejected: boolean;
  onConfirm: () => void;
  onReject: () => void;
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
 * our athlete. So the wizard asks, in as many words, with both names on
 * screen, and blocks the step until it is answered.
 *
 * Two rules this component keeps:
 *
 * 1. It consumes `comparison`; it never decides whether the names match.
 * 2. Neither answer touches an id. "Yes" records a confirmation keyed to this
 *    file and this athlete; "No" explains that the fix is a differently
 *    oriented export, because relabelling names here would leave the numbers
 *    attributed to the other player. `matches.player1_id` is decided by
 *    `wizardUploadEligibility()` from the CHOSEN athlete, and no button here
 *    reaches it.
 */
export function ImportIdentityNotice({
  comparison,
  workspaceKind,
  rejected,
  onConfirm,
  onReject,
  onChangeFile,
  onChangePlayer,
}: ImportIdentityNoticeProps) {
  const importedName = comparison.importedName.trim();
  const athleteName = comparison.athleteName.trim();
  // Two different gaps, two different fixes: an export that names nobody is a
  // file problem; an athlete that names nobody is an unanswered question on
  // this wizard, and offering "Yes, this is player 1" there would be a dead
  // button — the hook refuses a confirmation with no subject chosen.
  const athleteMissing = !athleteName;
  const importedMissing = !importedName;

  const changeFile = (
    <button
      type="button"
      onClick={onChangeFile}
      className={advButton("ghost", "sm")}
    >
      Choose another file
    </button>
  );
  const changePlayer = onChangePlayer ? (
    <button
      type="button"
      onClick={onChangePlayer}
      className={advButton("ghost", "sm")}
    >
      Change player
    </button>
  ) : null;

  if (rejected) {
    const subject = athleteMissing ? "the selected athlete" : athleteName;
    return (
      <Notice>
        <p>
          <b className="font-medium">
            This export can’t be used for {subject}.
          </b>{" "}
          Every point in it is written from its player 1’s side, so choose an
          export where {subject} is player 1. Renaming the players here would
          leave the statistics on the other player.
        </p>
        <Actions>
          {changeFile}
          {changePlayer}
        </Actions>
      </Notice>
    );
  }

  if (athleteMissing) {
    return (
      <Notice>
        <p>
          <b className="font-medium">No player is selected yet.</b>{" "}
          {importedMissing
            ? "This export doesn’t name a player 1 either."
            : `This export names ${importedName} as player 1.`}{" "}
          Choose the player this match belongs to, then confirm they are player
          1 in the export.
        </p>
        <Actions>
          {changePlayer}
          {changeFile}
        </Actions>
      </Notice>
    );
  }

  const question = importedMissing
    ? `This export doesn’t name a player 1, so it can’t be checked against ${athleteName}. Confirm only if you know ${athleteName} is player 1 in this export.`
    : workspaceKind === "team"
      ? `This export names ${importedName} as player 1. Is that ${athleteName}?`
      : `This export names ${importedName} as player 1, but your profile names ${athleteName}. Are you player 1 in this export?`;

  return (
    <Notice>
      <p>
        <b className="font-medium">
          {importedMissing
            ? "This export is missing a player name."
            : "Check who is player 1."}
        </b>{" "}
        {question}
      </p>
      <Actions>
        <button
          type="button"
          onClick={onConfirm}
          className={advButton("primary", "sm")}
        >
          Yes, this is player 1
        </button>
        <button
          type="button"
          onClick={onReject}
          className={advButton("outline", "sm")}
        >
          No, they are not player 1
        </button>
        {changeFile}
        {changePlayer}
      </Actions>
    </Notice>
  );
}

/**
 * The warning register, announced. `role="status"` with a polite live region
 * because the notice appears only once the export finishes parsing — after the
 * person's attention has already moved on from the drop zone.
 */
function Notice({ children }: { children: React.ReactNode }) {
  return <WizardNotice>{children}</WizardNotice>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
