import { TriangleAlert } from "lucide-react";

/**
 * The last step's "still to fill" — a red pill in the footer: warning glyph,
 * "5 required left". It replaced a sentence naming the first three fields,
 * which crowded the bar; the fields themselves are marked on the page, so the
 * footer only has to say how many and take you to them.
 *
 * Red is the form's required-field colour (the asterisks), in its accessible
 * `--danger` ink on an 8% wash. Clicking scrolls to and focuses the first empty
 * required field in page order; the pill goes away when the list is empty.
 */
export function MissingFieldsPill({
  labels,
  onJump,
}: {
  labels: readonly string[];
  onJump: () => void;
}) {
  const count = labels.length;
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={`${count} required ${count === 1 ? "field" : "fields"} left: ${labels.join(", ")}. Go to the next one.`}
      className="inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--danger)]/20 bg-[var(--danger)]/[0.08] pr-2.5 pl-2 text-[11px] leading-none font-medium whitespace-nowrap text-[var(--danger)] tabular-nums transition-colors duration-150 hover:bg-[var(--danger)]/[0.12]"
    >
      <TriangleAlert
        className="block size-3 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      {count} required left
    </button>
  );
}

/**
 * Where each missing-answer label lives on the details step. Keys are
 * `collectMatchCompletionRequirements()`'s labels; a label with no entry (the
 * video answers, which belong to earlier steps) is skipped.
 */
const TARGETS: Record<string, (root: HTMLElement) => HTMLElement | null> = {
  opponent: (root) => root.querySelector('[aria-label="Opponent"]'),
  score: (root) =>
    Array.from(
      root.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]'),
    ).find((cell) => cell.value === "") ?? null,
  date: (root) =>
    root.querySelector<HTMLElement>(
      '[aria-label="Date"] [role="spinbutton"]',
    ) ?? root.querySelector('[aria-label="Date"]'),
  "player hand": (root) => root.querySelector('[aria-label="Player hand"]'),
  "player backhand": (root) =>
    root.querySelector('[aria-label="Player backhand"]'),
  "opponent hand": (root) => root.querySelector('[aria-label="Opponent hand"]'),
  "opponent backhand": (root) =>
    root.querySelector('[aria-label="Opponent backhand"]'),
  scoring: (root) => root.querySelector('[data-field="Scoring"]'),
};

/** Scroll to and focus the first missing field in page order. */
export function jumpToMissingField(
  root: HTMLElement | null,
  labels: readonly string[],
) {
  if (!root) return;
  const targets = labels
    .map((label) => TARGETS[label]?.(root) ?? null)
    .filter((el): el is HTMLElement => el !== null);
  if (targets.length === 0) return;
  targets.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const first = targets[0];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  first.scrollIntoView({
    block: "center",
    behavior: reduce ? "auto" : "smooth",
  });
  first.focus({ preventScroll: true });
}
