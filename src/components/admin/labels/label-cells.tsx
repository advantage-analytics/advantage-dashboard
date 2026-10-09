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
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { cn } from "@/lib/utils";

/**
 * The console's editable cells. A cell is text until someone reaches for it:
 * the editor (a menu select or a text input) mounts only while the cell is in
 * the selected row or being edited, opened from the keyboard (Enter/Space) or
 * by a click on the text. A hover mounts nothing, so a long rail carries no
 * form controls until one is wanted.
 *
 * - Escape cancels: a text draft reverts, an open menu closes, and a cell
 *   opened from the keyboard hands focus back to its text.
 * - A dropdown's menu is portalled outside the cell's DOM but inside its React
 *   tree, so focus moving into the menu is not the cell being left.
 * - The editor's text sits exactly where the cell's text sat (the chrome's
 *   padding and border are pulled back with a negative margin), so a cell never
 *   shifts when its editor mounts.
 */

export function EditableCell({
  label,
  valueText,
  display,
  editable,
  rowSelected = false,
  className,
  textClassName,
  editor,
}: {
  /** What the cell is, for assistive technology: "Shot 2 player". */
  label: string;
  /** The value in words ("Vargas", "Not set"), read with the label. */
  valueText: string;
  display: ReactNode;
  /** False for a frozen session: the cell stays text. */
  editable: boolean;
  rowSelected?: boolean;
  className?: string;
  /** Classes on the text while it is text — the hover affordance's home. */
  textClassName?: string;
  /** The select or input, mounted only when the cell is reached for. */
  editor: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const mounted = editable && (rowSelected || editing);

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

  /** The click that selects the row also opens this cell. */
  function openFromClick() {
    if (!editable) return;
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
    setEditing(false);
  }

  return (
    <span
      ref={wrapper}
      data-cell={label}
      className={cn("flex min-w-0 items-center", className)}
      onKeyDown={cancel}
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

/**
 * The rail's fields: the text editor's box and the same box on `MenuSelect`'s
 * trigger, in the rail's ink (label-rail-tone.ts). The text field is the
 * tighter of the two: a position is thirteen characters in an 88px track.
 *
 * Text that does not parse turns the border `--danger` (`data-invalid`), which
 * must outrank the blue focus border: the field is always focused while the
 * mistake is typed.
 */
const FIELD_DARK =
  "-ml-[4px] flex h-[26px] w-[calc(100%+9px)] min-w-0 items-center rounded-[var(--radius-button)] border border-white/20 bg-white/[0.08] transition-colors duration-200 focus-within:border-[var(--blue)] data-[invalid]:focus-within:border-[var(--danger)]";

const SELECT_TRIGGER_DARK =
  "-ml-[5px] h-[26px] w-[calc(100%+7px)] min-w-0 shrink border-white/20 bg-white/[0.08] px-1 text-[11px] text-white hover:bg-white/[0.14] aria-expanded:border-[var(--blue)] [&>svg]:hidden";

export type SelectOption = MenuOption<string>;

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

/** `MenuSelect` in the field chrome. It writes the moment a row is picked. */
export function SelectEditor({
  label,
  value,
  options,
  onChange,
  menu = "dark",
  open,
  onOpenChange,
  className,
  placeholder = "—",
}: {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  /** The menu's tone: portalled, so the rail's palette does not reach it. */
  menu?: FloatMenuTone;
  /** Controlled open state; absent, the menu keeps its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Extra trigger classes: a let's amber ink. */
  className?: string;
  /** The trigger's words when `value` is none of the options. */
  placeholder?: string;
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
        placeholder={placeholder}
        align="start"
        width="trigger"
        tone={menu}
        open={open}
        onOpenChange={onOpenChange}
        className={cn(SELECT_TRIGGER_DARK, className)}
      />
    </span>
  );
}

/**
 * Writes on Enter or when focus leaves, and only when the text parses and says
 * something new. Text that does not parse is marked invalid and never written:
 * Enter keeps it open, leaving throws it away.
 */
export function TextEditor({
  label,
  text,
  parse,
  onCommit,
}: {
  label: string;
  text: string;
  /** The typed text → a value; `undefined` when it does not parse. */
  parse: (text: string) => unknown;
  onCommit: (value: unknown) => void;
}) {
  // Null until something is typed, and again once it is written or thrown away,
  // so the stored value shows through, including one that changes underneath.
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
      className={cn(FIELD_DARK, invalid && "border-[var(--danger)]")}
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
        className="mono tabular h-full w-full min-w-0 bg-transparent px-[3px] text-[10px] tracking-[-0.05em] text-white outline-none"
      />
    </span>
  );
}
