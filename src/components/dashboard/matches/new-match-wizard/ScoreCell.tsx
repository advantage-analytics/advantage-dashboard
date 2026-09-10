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
      className={`h-8 !w-7 rounded-[6px] border bg-white px-0 text-center text-[#0D0D0D] tabular-nums shadow-none placeholder:text-[#CCCCCC] ${
        invalid ? "border-[#E51837]" : "border-[#EAECF0]"
      }`}
    />
  );
}
