"use client";

import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Popover,
} from "react-aria-components";
import type { CalendarDate } from "@internationalized/date";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatIsoDate, parseIsoDate } from "@/lib/ui/date-value";
import { cn } from "@/lib/utils";

/**
 * The date field. There is no other: a native `<input type="date">` draws
 * the browser's picker, not ours, and its resting text cannot be typed into
 * segment by segment. Built on react-aria's `DatePicker`, which owns the
 * segment keyboard model, the month arithmetic and the grid's ARIA; this file
 * owns the chrome and the wire format.
 *
 * The public contract is the product's, not the library's: a `YYYY-MM-DD`
 * string in and a `YYYY-MM-DD` string out, `""` for empty. A `CalendarDate`
 * never crosses this boundary — `parseIsoDate` / `formatIsoDate` in
 * `lib/ui/date-value.ts` are the only two places that know both shapes.
 *
 * Three chromes, each matching what its call sites already draw so no surface
 * changes shape: `underline` is a form field — 34px, the caption's hairline
 * beneath, 2px Signal Blue on focus, identical to `MenuSelect
 * variant="underline"`; `bare` draws no rule and no height of its own, for a
 * parent row (`FieldCell`, `UnderlineField`) that owns both; `boxed` is the
 * 30px bordered box beside a filter caption.
 *
 * Focus. `focus.css` is the entire focus treatment and this file writes no
 * ring of its own. A segment is a `[tabindex]` div, so the file would ring it
 * blue on top of the blue fill that already says which segment is live; each
 * `DateSegment` therefore carries `data-focus-ring="none"`. That opt-out is
 * earned the way the skill requires — the fill is a real on-focus change from
 * react-aria's `data-focused`, not a standing colour. The calendar button is a
 * plain `<button>` whose appearance does not change on focus, and a day cell
 * is a `[role="button"]` with a roving tabindex; both keep the ring the file
 * gives them, and neither is given a focus class here. The `underline`
 * variant's `focus-within:` rule is the one exception to "write nothing" the
 * skill names: it is the on-focus change the underline family's opt-out rests
 * on, not a ring.
 *
 * The calendar popover is NOT a `FloatMenu`, though it looks like one. It
 * agrees with `ui/float-menu.tsx` by value — `rounded-[10px]`, the hairline
 * border, white, `--shadow-dropdown` — so a date picker and a select on the
 * same page are visibly one family. It does not import it because `FloatMenu`
 * wraps its children in `role="menu"`, and a menu cannot contain a grid: the
 * calendar would be an ARIA error that no reviewer sees on screen. The classes
 * are duplicated on purpose; keep them in step with `FloatMenu` if either
 * moves.
 */

export type DateFieldVariant = "underline" | "bare" | "boxed";

/** What `handleRef` receives: focus the first segment, for focus-first-invalid. */
export type DateFieldHandle = { focus: () => void };

export function DateField({
  label,
  value,
  onChange,
  variant = "underline",
  min,
  max,
  disabled = false,
  required = false,
  className,
  handleRef,
  emphasis = false,
  onIncompleteChange,
}: {
  /** Accessible name — the visible eyebrow or row label sits outside. */
  label: string;
  /** `YYYY-MM-DD`, or `""` for empty. Never `null`; convert at the call site. */
  value: string;
  /** Receives `YYYY-MM-DD`, or `""` when the field is cleared. */
  onChange: (next: string) => void;
  variant?: DateFieldVariant;
  /** `YYYY-MM-DD`. Earlier days are unpickable and a typed one marks the field invalid. */
  min?: string;
  /** `YYYY-MM-DD`. Later days are unpickable and a typed one marks the field invalid. */
  max?: string;
  disabled?: boolean;
  required?: boolean;
  /** Extra classes on the outer element — a width, a margin. */
  className?: string;
  /** Filled with `{ focus() }` so a dialog can send focus here as the first invalid field. */
  handleRef?: React.RefObject<DateFieldHandle | null>;
  /**
   * Draw the `underline` rule 2px blue at rest — a field the page is asking
   * for, matching `SettingsUnderlineInput`'s prop of the same name. It exists
   * so a call site can say what it wants rather than reach through this
   * component with a descendant selector to restyle the rule itself; that
   * bound the caller to which element happens to draw it.
   */
  emphasis?: boolean;
  /**
   * Fires when the field starts or stops showing a blank segment.
   *
   * **A call site that saves a date needs this.** `onChange` reports complete
   * dates only: clear one segment of `03/21/2026` and react-stately updates
   * what is drawn without calling `setDate`, so the field reads `03/21/yyyy`
   * while `value` still holds the old date. A form that trusts `value` alone
   * then writes the date the person was in the middle of replacing, and
   * nothing on screen says so. The native `<input type="date">` this replaced
   * reported `""` the moment a component went missing, so `required` caught
   * it; nothing catches it here.
   *
   * Refuse the submit while this is true. Do NOT respond by clearing `value` —
   * the field is controlled, so that would blank the segments the person kept.
   */
  onIncompleteChange?: (incomplete: boolean) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  // The first tabbable thing in the group is the first segment; the calendar
  // button comes after it in document order. `useImperativeHandle` is the API
  // for filling a caller's ref — it also clears it on unmount, which the
  // hand-rolled effect had to remember to do.
  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => groupRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(),
    }),
    []
  );

  // The one translation in each direction. A `null` from the library — the
  // field cleared — becomes `""`, never a dropped update.
  const handleChange = (next: CalendarDate | null) => onChange(formatIsoDate(next));

  // Memoised on the ISO strings, not recomputed per render. `react-stately`
  // memoises the segment list, the formatted parts and the bound validation on
  // the identity of these `CalendarDate` objects — so handing it a fresh one
  // each render made every one of those memos miss and rebuilt the segments
  // through `Intl.DateTimeFormat` on a parent's every keystroke. Measured on
  // `useDateFieldState`, not assumed.
  // Blank segments are watched in the DOM rather than in React state, and the
  // reason is structural: `DateInput` creates the field state *below* this
  // component and provides it on `DateFieldStateContext` inside its own
  // subtree, so clearing a segment re-renders that subtree and never this one.
  // An effect here would not run. `data-placeholder` is the attribute
  // react-aria puts on a blank segment, and the same one the segment styling
  // below already keys on — so if it ever changed, the placeholder colour
  // would break in the same release, visibly, rather than this going quiet.
  // Held in a ref so the observer below is built once. Call sites pass an
  // inline arrow, so keying the effect on the callback itself would tear the
  // observer down and rebuild it on every render of the form around it. The
  // assignment is an effect rather than a line in the render body because
  // writing a ref during render is a React 19 lint error, and this effect is
  // declared first so it has already run when the observer's first report
  // fires on mount.
  const notifyIncomplete = useRef(onIncompleteChange);
  useEffect(() => {
    notifyIncomplete.current = onIncompleteChange;
  }, [onIncompleteChange]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    let last: boolean | null = null;
    const report = () => {
      const incomplete = group.querySelector("[data-placeholder]") !== null;
      if (incomplete === last) return;
      last = incomplete;
      notifyIncomplete.current?.(incomplete);
    };
    report();
    const observer = new MutationObserver(report);
    observer.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-placeholder"],
    });
    return () => observer.disconnect();
  }, []);

  const dateValue = useMemo(() => parseIsoDate(value), [value]);
  const minValue = useMemo(() => (min ? (parseIsoDate(min) ?? undefined) : undefined), [min]);
  const maxValue = useMemo(() => (max ? (parseIsoDate(max) ?? undefined) : undefined), [max]);

  return (
    <DatePicker
      aria-label={label}
      value={dateValue}
      onChange={handleChange}
      minValue={minValue}
      maxValue={maxValue}
      isDisabled={disabled}
      isRequired={required}
      // "native" (the default) only reports a bound violation on form submit;
      // "aria" marks the group `data-invalid` the moment a typed date falls
      // outside `min`/`max`, which is what turns the rule red below. The value
      // is still reported upward either way — the call site stays the
      // authority on whether it may be submitted.
      validationBehavior="aria"
      granularity="day"
      shouldForceLeadingZeros
      className={cn(
        "group/date",
        variant === "underline" ? "block w-full" : "inline-block",
        className
      )}
    >
      <Group
        ref={groupRef}
        className={cn(
          "flex items-center gap-1 transition-colors duration-150",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
          variant === "underline" &&
            // 34px, the underline family's one height (`SettingsUnderlineInput`,
            // `MenuSelect variant="underline"`). The rule goes 2px blue on
            // focus and stays blue while the calendar is open — the segments
            // are not focused then, but the field is still the thing being
            // edited. Error owns the colour; focus owns the weight.
            cn(
              "h-[34px] w-full border-b",
              emphasis
                ? "border-b-2 border-[var(--blue)]"
                : "border-[var(--border-field)]",
              "focus-within:border-b-2 focus-within:border-[var(--blue)]",
              "group-data-[open]/date:border-b-2 group-data-[open]/date:border-[var(--blue)]",
              "data-[invalid]:border-[var(--error)] data-[invalid]:focus-within:border-[var(--error)]"
            ),
          variant === "boxed" &&
            cn(
              "h-[30px] rounded-[6px] border border-[var(--border-field)] bg-[var(--surface-field)] px-2.5",
              "data-[invalid]:border-[var(--error)]"
            )
        )}
      >
        <DateInput
          className={cn(
            "flex min-w-0 flex-1 items-center text-[var(--ink-900)]",
            variant === "boxed" ? "text-[12px]" : "text-[13px]"
          )}
        >
          {(segment) => (
            <DateSegment
              segment={segment}
              data-focus-ring="none"
              className={cn(
                "rounded-[3px] px-[2px] leading-[18px] tabular-nums",
                "data-[placeholder]:text-[var(--ink-400)]",
                "data-[type=literal]:text-[var(--ink-400)]",
                "data-[focused]:bg-[var(--blue)] data-[focused]:text-white data-[focused]:data-[placeholder]:text-white"
              )}
            />
          )}
        </DateInput>
        <Button
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-400)] transition-colors duration-150",
            "hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]",
            "data-[disabled]:cursor-not-allowed"
          )}
        >
          <CalendarIcon className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </Group>

      <Popover
        placement="bottom start"
        offset={4}
        className={cn(
          // The FloatMenu surface, by value — see the header for why it is
          // not the component.
          "rounded-[10px] border border-[var(--border-hairline)] bg-white p-[10px] shadow-[var(--shadow-dropdown)]",
          // The popover portals to `document.body`, and a Radix `Dialog` puts
          // `pointer-events: none` on `body` for as long as it is open — so
          // inside a dialog (the match-edit one) every day cell inherited
          // `none` and the calendar was mouse-dead while looking perfectly
          // normal. Measured, not assumed. Restoring it here is safe
          // everywhere: a popover that is on screen is always meant to be
          // clickable.
          "pointer-events-auto",
          // A fade and a 2px lift, on the sanctioned curve. Nothing inside
          // the grid animates. Reduced motion keeps the fade and drops the lift.
          "duration-[var(--duration-hover)] ease-[var(--ease-out-expo)]",
          "data-[entering]:animate-in data-[entering]:fade-in data-[entering]:slide-in-from-bottom-[2px]",
          "data-[exiting]:animate-out data-[exiting]:fade-out data-[exiting]:slide-out-to-bottom-[2px]",
          "motion-reduce:data-[entering]:slide-in-from-bottom-0 motion-reduce:data-[exiting]:slide-out-to-bottom-0"
        )}
      >
        <Dialog aria-label={`${label} calendar`}>
          <Calendar>
            <header className="mb-1.5 flex items-center justify-between">
              <Button
                slot="previous"
                className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-500)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] data-[disabled]:cursor-default data-[disabled]:opacity-40"
              >
                <ChevronLeft className="size-[14px]" strokeWidth={1.5} aria-hidden="true" />
              </Button>
              <Heading className="text-[12px] font-medium text-[var(--ink-900)]" />
              <Button
                slot="next"
                className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-[var(--ink-500)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] data-[disabled]:cursor-default data-[disabled]:opacity-40"
              >
                <ChevronRight className="size-[14px]" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </header>
            <CalendarGrid
              weekdayStyle="short"
              className="border-separate border-spacing-0 [&_td]:p-0 [&_th]:p-0"
            >
              <CalendarGridHeader>
                {(day) => (
                  <CalendarHeaderCell className="h-[22px] w-[30px] text-center text-[10px] font-medium uppercase text-[var(--ink-400)]">
                    {day}
                  </CalendarHeaderCell>
                )}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={cn(
                      "relative flex size-[30px] cursor-pointer select-none items-center justify-center rounded-[7px] text-[12px] tabular-nums text-[var(--ink-900)]",
                      "data-[hovered]:bg-[var(--surface-subtle)]",
                      "data-[outside-month]:opacity-[0.35]",
                      "data-[disabled]:cursor-default data-[disabled]:text-[var(--ink-400)] data-[disabled]:data-[hovered]:bg-transparent",
                      "data-[selected]:bg-[var(--blue)] data-[selected]:text-white data-[selected]:data-[hovered]:bg-[var(--blue)]"
                    )}
                  >
                    {({ formattedDate, isToday, isSelected }) => (
                      <>
                        {formattedDate}
                        {isToday && !isSelected ? (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-[3px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-[var(--blue)]"
                          />
                        ) : null}
                      </>
                    )}
                  </CalendarCell>
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}
