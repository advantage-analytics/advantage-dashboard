"use client";

import { Input } from "@/components/ui/input";

export interface ScoreCellProps {
  refMap: React.RefObject<Record<number, HTMLInputElement | null>>;
  i: number;
  value: number | null;
  onValueChange: (v: string) => void;
  onEnterValue: (raw: string) => void;
  onEnterEmpty: () => void;
  maxLength: number;
  invalid?: boolean;
}

export function ScoreCell({
  refMap,
  i,
  value,
  onValueChange,
  onEnterValue,
  onEnterEmpty,
  maxLength,
  invalid,
}: ScoreCellProps) {
  return (
    <Input
      ref={(el) => {
        if (el) refMap.current[i] = el;
      }}
      placeholder="–"
      inputMode="numeric"
      pattern="\d*"
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      value={value === null ? "" : value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        const v = e.currentTarget.value;
        if (v === "") onEnterEmpty();
        else onEnterValue(v);
      }}
      className={`!w-7 h-8 text-center text-[#0D0D0D] bg-white border rounded-[6px] px-0 shadow-none focus-visible:ring-2 placeholder:text-[#CCCCCC] tabular-nums ${
        invalid
          ? "border-[#E51837] focus-visible:ring-[#E51837]/40"
          : "border-[#EAECF0] focus-visible:ring-[#3B82F6]/40"
      }`}
    />
  );
}
