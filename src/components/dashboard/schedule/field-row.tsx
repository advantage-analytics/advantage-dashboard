"use client";

/*
 * DORMANT — no route renders this file. It has no single static counterpart:
 * `static/dual-build-step.tsx` and `static/static-tournament-builder.tsx` each
 * draw their own defaults cells, deliberately NOT reusing this row's 25b
 * spacing (see `dual-build-step.tsx:391`). Its only importers, `dual-form.tsx`
 * and `tournament-form.tsx`, are dormant too.
 *
 * See `./README.md` for the full live/dormant map.
 */

import { ChevronDown, Calendar } from "lucide-react";

/**
 * 25b's defaults row — an underlined cell per fact.
 *
 * Not a boxed input. These arrive already answered from the program's settings,
 * so the field's job is to show what will be used and stay out of the way, not
 * to look like a question. A four-up row of bordered inputs would read as a
 * form to fill rather than defaults to check.
 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-3.5 grid grid-cols-4 gap-8">{children}</div>;
}

export function FieldCellText({
  label,
  value,
  onChange,
  mono = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none ${mono ? "mono" : ""}`}
        />
        {type === "date" ? (
          <Calendar
            strokeWidth={1.5}
            className="size-3 shrink-0 text-[var(--ink-400)]"
          />
        ) : null}
      </span>
    </label>
  );
}

export function FieldCellSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="relative flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full cursor-pointer appearance-none bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          strokeWidth={1.5}
          className="pointer-events-none size-3 shrink-0 text-[var(--ink-400)]"
        />
      </span>
    </label>
  );
}
