import { replayMask, replayUnmask } from "@/lib/ui/replay-unmask";
import { cn } from "@/lib/utils";

/**
 * The required mark: the form's own red, never loss red.
 *
 * `--error`, not the `--danger` the Roster and Edit match dialogs print — the
 * design system keeps form red and Loss Red off the same surface, and a
 * required mark is a form fact, not a lost point.
 */
export function Required({ className }: { className?: string }) {
  return (
    <span
      aria-label="Required"
      className={cn("text-[12px] leading-none text-[var(--error)]", className)}
    >
      *
    </span>
  );
}

/**
 * A field's label, in the dialogs' voice: 11px sentence case in `--ink-600`,
 * the asterisk right against the word, 8px above the control.
 *
 * The same caption `SettingsField` draws in the Roster and Edit match dialogs,
 * so a question reads the same in the wizard as it does when the match is
 * edited later. Section headings keep their eyebrows — this is for fields.
 *
 * `tag` is provenance ("from the file"), pushed to the right of the row.
 * Colour is set by a Tailwind class and nothing here uses a DS type class,
 * so the unlayered `.eyebrow`/`.text-micro` colours cannot override it.
 *
 * The label reads through in session replays (`replayUnmask()`), so `label`
 * must be written in the source — never a name or any other value. A caption
 * about a person takes the name as `subject`, which stays masked and leads the
 * label: `subject="Sam" label="at the start"` reads "Sam at the start". `tag`
 * stays masked too, since some callers build it from an event's line slot.
 */
export function FieldCaption({
  label,
  subject,
  required = false,
  tag,
  className,
}: {
  label: string;
  subject?: string;
  required?: boolean;
  tag?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-baseline gap-2", className)}>
      <span
        {...replayUnmask()}
        className="text-[11px] leading-[1.4] text-[var(--ink-600)]"
      >
        {subject && <span {...replayMask()}>{subject} </span>}
        {label}
        {required && <Required className="ml-0.5" />}
      </span>
      {tag && (
        <span className="ml-auto shrink-0 text-[11px] leading-[1.4] whitespace-nowrap text-[var(--ink-500)]">
          {tag}
        </span>
      )}
    </span>
  );
}
