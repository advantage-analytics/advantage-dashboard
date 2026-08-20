"use client";

/**
 * The editable cell and its menu — the whole vocabulary of the Match details step.
 *
 * A cell is quiet at rest: a tracked label, the value, and a chevron. It grows a
 * frame on hover and keeps that frame while its menu is open, so the thing you
 * are editing stays visibly the thing you clicked. Nothing here is a form
 * control at rest, which is what lets thirteen fields sit on one screen without
 * reading as a form.
 *
 * Menus come in two shapes: a list (Round, Court, Format…) and a binary with an
 * icon per row (Camera, your end). The binaries carry their explanation INSIDE
 * the menu rather than under the cell — the answer is only ambiguous while you
 * are choosing it, and a permanent hint under a settled value is noise.
 */

import { useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { eyebrowLabelCls, floatMenuCls, focusRingCls } from "./styles";

/** Cell frame: transparent at rest, framed on hover, framed while open. */
const cellCls =
  "group flex w-full flex-col gap-1.5 rounded-[8px] border px-3 py-2.5 text-left transition-colors duration-150";
const cellRestCls = "border-transparent hover:border-[#F3F3F3] hover:bg-[#FAFAFA]";
const cellOpenCls = "border-[#F3F3F3] bg-[#FAFAFA]";

function CellLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className={eyebrowLabelCls}>
      {children}
      {required && <span className="text-[#E51837]"> *</span>}
    </span>
  );
}

/**
 * The trigger face — label over value with a trailing chevron.
 *
 * Rendered by every menu-backed cell. `isSet` drives ink alone: an unset cell
 * still shows its placeholder at 14px, so the grid's rhythm doesn't change as
 * answers arrive.
 */
function CellFace({
  label,
  required,
  value,
  isSet,
  open,
  tabular,
}: {
  label: string;
  required?: boolean;
  value: string;
  isSet: boolean;
  open: boolean;
  tabular?: boolean;
}) {
  return (
    <>
      <CellLabel required={required}>{label}</CellLabel>
      <span className="flex items-center gap-2">
        <span
          className={`text-[14px] ${tabular ? "tabular-nums" : ""} ${
            isSet ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
          }`}
        >
          {value}
        </span>
        <span className="flex-1" />
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.75}
          className={`size-3 shrink-0 transition-[color,transform] duration-150 ${
            open ? "rotate-180 text-[#3B82F6]" : "text-[#AAAAAA]"
          }`}
        />
      </span>
    </>
  );
}

/** Floating surface shared by every cell menu. Repo popover spec. */
function CellMenu({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return (
    <PopoverContent
      align="start"
      sideOffset={6}
      style={{ width }}
      className={`flex flex-col p-1 ${floatMenuCls}`}
    >
      {children}
    </PopoverContent>
  );
}

/** The hint that lives inside a menu, under a hairline. */
function CellMenuHint({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-2 my-1 h-px bg-[#E5E5EA]" />
      <p className="px-2.5 pb-2 pt-1.5 text-[11px] leading-[1.5] text-[#888888]">
        {children}
      </p>
    </>
  );
}

export interface CellOption<T> {
  value: T;
  label: string;
  /** Leading glyph. Present on binaries, absent on plain lists. */
  icon?: React.ReactNode;
}

function CellMenuItem({
  label,
  icon,
  selected,
  onSelect,
}: {
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${focusRingCls} ${
        selected ? "bg-[#F5F5F5] font-medium text-[#1D1D1F]" : "text-[#1D1D1F] hover:bg-[#F5F5F5]"
      }`}
    >
      {icon && <span className="shrink-0 text-[#8A8A8E]">{icon}</span>}
      <span className="flex-1">{label}</span>
      {selected && (
        <Check
          aria-hidden="true"
          strokeWidth={2}
          className="size-3.5 shrink-0 text-[#3B82F6]"
        />
      )}
    </button>
  );
}

/**
 * The rows of a menu — the clear row, if the field is optional, then the
 * options. Shared so a framed cell and an inline trigger cannot drift into
 * two different menus.
 */
function MenuList<T>({
  ariaLabel,
  options,
  value,
  onChange,
  onClear,
  clearLabel,
  close,
}: {
  ariaLabel: string;
  options: readonly CellOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  onClear?: () => void;
  clearLabel: string;
  close: () => void;
}) {
  const chosen = options.find((o) => o.value === value);
  return (
    <div role="listbox" aria-label={ariaLabel} className="flex flex-col">
      {/* Optional fields keep a way back to unset. Without it the only way to
          undo an answer is to know it was never required. */}
      {onClear && (
        <CellMenuItem
          label={clearLabel}
          selected={!chosen}
          onSelect={() => {
            onClear();
            close();
          }}
        />
      )}
      {options.map((option) => (
        <CellMenuItem
          key={String(option.value)}
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          onSelect={() => {
            onChange(option.value);
            close();
          }}
        />
      ))}
    </div>
  );
}

interface SelectCellProps<T> {
  label: string;
  required?: boolean;
  /** Shown when nothing is chosen — "Not set", "Choose", "Derived from the score". */
  placeholder: string;
  value: T | undefined;
  options: readonly CellOption<T>[];
  onChange: (value: T) => void;
  /** Clears the field. Present only on the ones that are allowed to be unset. */
  onClear?: () => void;
  /** Explanation shown inside the menu, under a hairline. */
  hint?: React.ReactNode;
  /** Menu width. 220 for lists, 260 for the two binaries. */
  menuWidth?: number;
  className?: string;
  id?: string;
}

export function SelectCell<T extends string | number | boolean>({
  label,
  required,
  placeholder,
  value,
  options,
  onChange,
  onClear,
  hint,
  menuWidth = 220,
  className,
  id,
}: SelectCellProps<T>) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={label}
          className={`${cellCls} ${open ? cellOpenCls : cellRestCls} ${focusRingCls} ${className ?? ""}`}
        >
          <CellFace
            label={label}
            required={required}
            value={chosen?.label ?? placeholder}
            isSet={!!chosen}
            open={open}
          />
        </button>
      </PopoverTrigger>
      <CellMenu width={menuWidth}>
        <MenuList
          ariaLabel={label}
          options={options}
          value={value}
          onChange={onChange}
          onClear={onClear}
          clearLabel={placeholder}
          close={() => setOpen(false)}
        />
        {hint && <CellMenuHint>{hint}</CellMenuHint>}
      </CellMenu>
    </Popover>
  );
}

/**
 * The compact trigger under a player's name — hand and backhand.
 *
 * Deliberately not a framed cell: these hang inside the scoreboard, where a
 * frame would compete with the score itself. But the menu they open is the same
 * one every other field opens, because a native <select> dropdown next to a
 * custom popover is two answers to the same question, and the OS one wins on
 * looking accidental.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  onClear,
  ariaLabel,
  placeholder,
}: {
  value: T | undefined;
  options: readonly CellOption<T>[];
  onChange: (value: T) => void;
  onClear?: () => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex items-center gap-0.5 rounded-sm text-[10px] transition-colors duration-150 ${focusRingCls} ${
            open ? "text-[#525252]" : "text-[#AAAAAA] hover:text-[#525252]"
          }`}
        >
          {chosen?.label ?? placeholder}
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className={`size-2.5 shrink-0 transition-[color,transform] duration-150 ${
              open ? "rotate-180 text-[#3B82F6]" : "text-[#AAAAAA]"
            }`}
          />
        </button>
      </PopoverTrigger>
      <CellMenu width={190}>
        <MenuList
          ariaLabel={ariaLabel}
          options={options}
          value={value}
          onChange={onChange}
          onClear={onClear}
          clearLabel={placeholder}
          close={() => setOpen(false)}
        />
      </CellMenu>
    </Popover>
  );
}

interface EditorCellProps {
  label: string;
  placeholder: string;
  /** Formatted value, or undefined when nothing is set. */
  value: string | undefined;
  menuWidth?: number;
  tabular?: boolean;
  /** The editor itself — native inputs, rendered inside the popover. */
  children: React.ReactNode;
}

/**
 * A cell whose menu holds an editor rather than a list.
 *
 * Date & time and Duration read as one settled fact in the grid; the two or
 * three inputs behind them only exist while you are changing them.
 */
export function EditorCell({
  label,
  placeholder,
  value,
  menuWidth = 240,
  tabular,
  children,
}: EditorCellProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`${cellCls} ${open ? cellOpenCls : cellRestCls} ${focusRingCls}`}
        >
          <CellFace
            label={label}
            value={value || placeholder}
            isSet={!!value}
            open={open}
            tabular={tabular}
          />
        </button>
      </PopoverTrigger>
      <CellMenu width={menuWidth}>
        <div className="flex flex-col gap-2 p-2">{children}</div>
      </CellMenu>
    </Popover>
  );
}

/**
 * A cell that reports rather than asks.
 *
 * For facts the wizard works out for itself — the match length, which comes
 * from the trim window. It keeps the grid's shape so a derived fact reads as
 * part of the same set, and drops the chevron and the hover frame so it never
 * invites a click it would have to refuse. The placeholder says where the
 * value will come from, the way Result's says "Derived from the score".
 */
export function ReadOnlyCell({
  label,
  value,
  placeholder,
  tabular,
}: {
  label: string;
  value: string | undefined;
  placeholder: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <CellLabel>{label}</CellLabel>
      <span
        className={`text-[14px] ${tabular ? "tabular-nums" : ""} ${
          value ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
        }`}
      >
        {value || placeholder}
      </span>
    </div>
  );
}

interface TextCellProps {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  error?: string;
  className?: string;
}

/**
 * The match name — the one cell that is always an input.
 *
 * It carries the pencil rather than a chevron: there is nothing to choose from,
 * and the affordance has to say "type here" without borrowing a text field's
 * box, which at 18px would dominate everything below it.
 */
export function TextCell({
  label,
  required,
  placeholder,
  value,
  onChange,
  onBlur,
  invalid,
  error,
  className,
}: TextCellProps) {
  return (
    <div className={className}>
      <label
        className={`${cellCls} ${cellRestCls} cursor-text focus-within:border-[#F3F3F3] focus-within:bg-[#FAFAFA]`}
      >
        <CellLabel required={required}>{label}</CellLabel>
        <span className="flex items-center gap-2">
          <input
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            className="min-w-0 flex-1 bg-transparent text-[18px] font-normal tracking-[-0.3px] text-[#0D0D0D] outline-none placeholder:text-[#CCCCCC]"
          />
          <Pencil
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-3 shrink-0 text-[#AAAAAA]"
          />
        </span>
      </label>
      {error && (
        <p className="px-3 pt-1 text-[11px] text-[#E51837]">{error}</p>
      )}
    </div>
  );
}
