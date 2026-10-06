"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { FloatMenuTone } from "@/components/ui/float-menu";
import { MenuSelect } from "@/components/ui/menu-select";
import { cn } from "@/lib/utils";

/**
 * The console's editable cells — board 08's `.ms` field.
 *
 * A cell is TEXT until someone reaches for it. The editor (the design
 * system's menu select or a text input, in the board's field chrome) mounts
 * only while the cell is
 *   · hovered by a pointer — the light table only (`hoverReveals`, on by
 *     default): the black rail's rows are a third the width, and a field
 *     box appearing under a crossing pointer read as a field that was
 *     already selected, so there a hover draws nothing and the cell's text
 *     may wear at most a quiet affordance (`textClassName`: a cursor, the
 *     word to white), never a border or a ground,
 *   · in the selected row (a selected shot shows every field, as `.sel .ms`),
 *   · or being edited — opened from the keyboard (Tab to the cell,
 *     Enter/Space), or holding focus from a click; with hover off, a click
 *     on the text opens the editor outright, so one click still selects the
 *     row AND opens that cell.
 * A table of a hundred points therefore carries no form controls until one is
 * wanted, and a row reads as data, not as a form.
 *
 * Escape cancels: a text draft goes back to the stored value, an open menu
 * closes, and a cell opened from the keyboard closes and hands focus back to
 * its text.
 *
 * A dropdown's menu is drawn in a portal, outside the cell's DOM (which is
 * what keeps the table's scroll container from clipping it) but inside its
 * React tree — so focus moving into the menu is not the cell being left.
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
  hoverReveals = true,
  className,
  textClassName,
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
  /**
   * Whether a hovering pointer mounts the editor. False on the black rail:
   * only the selected row, a click or the keyboard draws a field there.
   */
  hoverReveals?: boolean;
  className?: string;
  /** Classes on the text while it is text — the hover affordance's home. */
  textClassName?: string;
  /** The select or input, mounted only when the cell is reached for. */
  editor: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const mounted =
    editable && (rowSelected || (hoverReveals && hovered) || editing);

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
        ?.querySelector<HTMLElement>("input, textarea, button")
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
   * With hover off, the click that selects the row is also the click that
   * opens this cell: the editor mounts and takes focus. (With hover on, the
   * editor is already there under the pointer, and the click lands in it.)
   */
  function openFromClick() {
    if (hoverReveals || !editable) return;
    if (!mounted) focusNext.current = "editor";
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
        const next = event.relatedTarget as Element | null;
        // Into the dropdown's own menu: still this cell.
        if (next?.closest?.("[role='menu']")) return;
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
          onClick={openFromClick}
          className={cn(
            "tabular min-w-0 truncate rounded-[var(--radius-button)]",
            editable && textClassName,
          )}
        >
          {display}
        </span>
      )}
    </span>
  );
}

/** The board's `.ms` chrome: the text editor's field. */
const FIELD =
  "-ml-[11px] flex h-[30px] w-[calc(100%+11px)] min-w-0 items-center rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] transition-colors duration-200 focus-within:border-[var(--blue)]";

/**
 * The same box on `MenuSelect`'s pill trigger, which already is one (30px,
 * `--border-field`, `--blue` while open): pulled back over the cell's text
 * and filling its track, at the row's 13px.
 */
const SELECT_TRIGGER =
  "-ml-[11px] w-[calc(100%+11px)] min-w-0 shrink px-[10px] text-[13px]";

/**
 * The black full-screen view's fields (`label-black-shot-row.tsx`): the same
 * two boxes on the room's black — a white wash inside a white hairline, 26px
 * for a 34px row, at the row's own 10/11px. Its tracks are a third the light
 * table's, so the chrome is 3–4px of padding (pulled back by that plus the
 * 1px border), runs into the gap after it, and the select drops its chevron:
 * the box already says it is a control, and the word needs the room.
 *
 * The text field is the tighter of the two — 3px of padding, 5px into the
 * 8px gap, its mono digits tracked in by 0.05em — because a position is the
 * longest thing typed here: "-10.10, 24.82" is thirteen characters, and in
 * its 88px track (less the ring or dot before it) the looser box cut the
 * last one off.
 *
 * Text that does not parse turns this field's border `--danger` and keeps it
 * there while focused (`data-invalid`): the blue focus border must not
 * outrank it, since the field is always focused while the mistake is typed.
 */
export type EditorTone = FloatMenuTone;

const FIELD_DARK =
  "-ml-[4px] flex h-[26px] w-[calc(100%+9px)] min-w-0 items-center rounded-[var(--radius-button)] border border-white/20 bg-white/[0.08] transition-colors duration-200 focus-within:border-[var(--blue)] data-[invalid]:focus-within:border-[var(--danger)]";

const SELECT_TRIGGER_DARK =
  "-ml-[5px] h-[26px] w-[calc(100%+7px)] min-w-0 shrink border-white/20 bg-white/[0.08] px-1 text-[11px] text-white hover:bg-white/[0.14] aria-expanded:border-[var(--blue)] [&>svg]:hidden";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A menu's keys, from its trigger or its rows (the menu portals out of the
 * DOM but its events still bubble here through React): ↓ on the closed
 * trigger opens it; ↑ ↓ Home End walk the rows. Enter picks and Escape closes
 * on their own — the row is a button, and the menu's surface owns Escape.
 */
function menuKeys(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  const menu = target.closest("[role='menu']");
  if (!menu) {
    if (
      event.key === "ArrowDown" &&
      target.getAttribute("aria-expanded") === "false"
    ) {
      event.preventDefault();
      target.click();
    }
    return;
  }
  const rows = [...menu.querySelectorAll<HTMLElement>("[role^='menuitem']")];
  const at = rows.indexOf(target);
  const next =
    event.key === "ArrowDown"
      ? (at + 1) % rows.length
      : event.key === "ArrowUp"
        ? (at - 1 + rows.length) % rows.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : -1;
  if (next === -1 || rows.length === 0) return;
  event.preventDefault();
  rows[next].focus();
}

/**
 * A click in the menu is a pick, not a click on the row the cell sits in: it
 * reaches that row only through React's tree, where the row cannot tell it
 * from a click on itself (a point row would fold). The trigger's own click
 * passes — it is in the row, and selects it.
 */
function keepMenuClicks(event: MouseEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) {
    event.stopPropagation();
  }
}

/**
 * The design system's select (`MenuSelect`, a `FloatMenu`) in the field
 * chrome. It writes the moment a row is picked — there is no confirm step
 * and no Save button — and never for the row already chosen. A value not set
 * yet shows an em dash, and no row as chosen.
 */
export function SelectEditor({
  label,
  value,
  options,
  onChange,
  tone = "light",
  menu = tone,
}: {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  /** The trigger's chrome, and the tone of the menu it opens. */
  tone?: EditorTone;
  /**
   * The menu's tone when it is not the trigger's: the rail on a light ground
   * keeps its compact chrome but opens a light menu (`label-rail-tone.ts`).
   */
  menu?: FloatMenuTone;
}) {
  return (
    <span
      data-select-editor=""
      className="contents"
      onClick={keepMenuClicks}
      onKeyDown={menuKeys}
    >
      <MenuSelect
        label={label}
        value={value ?? undefined}
        options={options}
        onChange={onChange}
        placeholder="—"
        align="start"
        width="trigger"
        tone={menu}
        className={tone === "dark" ? SELECT_TRIGGER_DARK : SELECT_TRIGGER}
      />
    </span>
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
  tone = "light",
}: {
  label: string;
  /** The stored value, formatted. */
  text: string;
  /** The typed text → a value; `undefined` when it does not parse. */
  parse: (text: string) => unknown;
  onCommit: (value: unknown) => void;
  tone?: EditorTone;
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
      className={cn(
        tone === "dark" ? FIELD_DARK : FIELD,
        invalid && "border-[var(--danger)]",
      )}
      data-invalid={invalid ? "" : undefined}
    >
      <input
        type="text"
        aria-label={label}
        aria-invalid={invalid || undefined}
        // The chrome's border change is the focus indicator.
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
        className={
          tone === "dark"
            ? "mono tabular h-full w-full min-w-0 bg-transparent px-[3px] text-[10px] tracking-[-0.05em] text-white outline-none"
            : "tabular h-full w-full min-w-0 bg-transparent px-[10px] text-[13px] text-[var(--ink-900)] outline-none"
        }
      />
    </span>
  );
}
