"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AdvSelect } from "@/components/ui/adv-select";
import { cn } from "@/lib/utils";

/**
 * The console's editable cells — board 08's `.ms` field.
 *
 * A cell is TEXT until someone reaches for it. The editor (a native select or
 * a text input, in the board's field chrome) mounts only while the cell is
 *   · hovered by a pointer,
 *   · in the selected row (a selected shot shows every field, as `.sel .ms`),
 *   · or being edited — opened from the keyboard (Tab to the cell,
 *     Enter/Space), or holding focus from a click.
 * A table of a hundred points therefore carries no form controls until one is
 * wanted, and a row reads as data, not as a form.
 *
 * Escape cancels: a text draft goes back to the stored value, and a cell
 * opened from the keyboard closes and hands focus back to its text.
 *
 * The editor's text sits exactly where the cell's text sat — the chrome's
 * 10px padding plus 1px border is pulled back out with `-ml-[11px]` — so a
 * cell never shifts under the cursor when its editor mounts.
 */

export function EditableCell({
  label,
  valueText,
  display,
  editable,
  rowSelected = false,
  className,
  editor,
}: {
  /** What the cell is, for assistive technology: "Shot 2 player". */
  label: string;
  /** The value in words ("Vargas", "Not set"), read with the label. */
  valueText: string;
  /** The cell's text. */
  display: ReactNode;
  /** False for a frozen session: the cell stays text. */
  editable: boolean;
  rowSelected?: boolean;
  className?: string;
  /** The select or input, mounted only when the cell is reached for. */
  editor: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const mounted = editable && (rowSelected || hovered || editing);

  const wrapper = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  /** Where focus goes once the swap between text and editor commits. */
  const focusNext = useRef<"editor" | "text" | null>(null);
  /**
   * The text held focus when the editor replaced it (a keyboard user tabbed
   * into a row that then became selected). A removed element fires no blur,
   * so this stays set and the editor takes the focus over.
   */
  const textFocused = useRef(false);

  useLayoutEffect(() => {
    if (mounted && (focusNext.current === "editor" || textFocused.current)) {
      textFocused.current = false;
      focusNext.current = null;
      wrapper.current
        ?.querySelector<HTMLElement>("select, input, textarea")
        ?.focus();
    } else if (!mounted && focusNext.current === "text") {
      focusNext.current = null;
      text.current?.focus();
    }
  }, [mounted]);

  function open(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    focusNext.current = "editor";
    setEditing(true);
  }

  /**
   * Escape, from anywhere in the editor (a text draft has already reverted
   * itself by the time the key bubbles here). In a selected row the editor
   * stays; otherwise it closes and focus returns to the cell's text.
   */
  function cancel(event: KeyboardEvent) {
    if (event.key !== "Escape" || rowSelected || !mounted) return;
    focusNext.current = "text";
    setHovered(false);
    setEditing(false);
  }

  return (
    <span
      ref={wrapper}
      data-cell={label}
      className={cn("flex min-w-0 items-center", className)}
      onKeyDown={cancel}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => {
        if (event.target !== text.current) setEditing(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !wrapper.current?.contains(next)) setEditing(false);
      }}
    >
      {mounted ? (
        editor
      ) : (
        <span
          ref={text}
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          aria-label={editable ? `${label}: ${valueText}` : undefined}
          onFocus={() => {
            textFocused.current = true;
          }}
          onBlur={() => {
            textFocused.current = false;
          }}
          onKeyDown={editable ? open : undefined}
          className="tabular min-w-0 truncate rounded-[var(--radius-button)]"
        >
          {display}
        </span>
      )}
    </span>
  );
}

/** The board's `.ms` chrome, shared by both editors. */
const FIELD =
  "-ml-[11px] flex h-[30px] w-[calc(100%+11px)] min-w-0 items-center rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] transition-colors duration-200 focus-within:border-[var(--blue)]";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A native select in the field chrome. It writes the moment the value
 * changes — there is no confirm step and no Save button. The focus shows as
 * the chrome's border turning `--blue` (the board's `.ms.open`), which is why
 * `AdvSelect`'s `bare` kind opts out of the ring.
 */
export function SelectEditor({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <AdvSelect
      kind="bare"
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value === "" ? null : event.target.value;
        if (next !== value) onChange(next);
      }}
      wrapperClassName={FIELD}
      className="h-full min-w-0 truncate pl-[10px] text-[13px] text-[var(--ink-900)]"
      chevronClassName="right-2.5 size-3 text-[var(--ink-400)]"
    >
      {value === null ? <option value="">—</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </AdvSelect>
  );
}

/**
 * A text input in the field chrome for a value typed as text — a time or a
 * position. It writes on Enter or when focus leaves, and only when the text
 * parses and says something new; text that does not parse is flagged and
 * never written (Enter keeps it open to fix, leaving throws it away).
 */
export function TextEditor({
  label,
  text,
  parse,
  onCommit,
}: {
  label: string;
  /** The stored value, formatted. */
  text: string;
  /** The typed text → a value; `undefined` when it does not parse. */
  parse: (text: string) => unknown;
  onCommit: (value: unknown) => void;
}) {
  // Null until something is typed, and again once it is written or thrown
  // away, so the stored value shows through — including one that changes
  // underneath (a court click placing this stroke, the optimistic update
  // after Enter) — instead of a stale draft.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? text;
  const invalid = draft !== null && parse(draft) === undefined;

  function commit(): boolean {
    if (draft === null || draft.trim() === text.trim()) return true;
    const value = parse(draft);
    if (value === undefined) return false;
    onCommit(value);
    return true;
  }

  return (
    <span
      className={cn(FIELD, invalid && "border-[var(--danger)]")}
      data-invalid={invalid ? "" : undefined}
    >
      <input
        type="text"
        aria-label={label}
        aria-invalid={invalid || undefined}
        // The chrome's border change is the focus indicator, as on the select.
        data-focus-ring="none"
        value={shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          commit();
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (commit()) setDraft(null);
          } else if (event.key === "Escape") {
            // Revert; the cell closes the editor as the key bubbles on.
            setDraft(null);
          }
        }}
        className="tabular h-full w-full min-w-0 bg-transparent px-[10px] text-[13px] text-[var(--ink-900)] outline-none"
      />
    </span>
  );
}
