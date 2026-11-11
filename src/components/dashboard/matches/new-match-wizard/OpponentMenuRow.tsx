import type * as React from "react";
import { Plus } from "lucide-react";

import { getInitials } from "@/lib/data/match-utils";

import { floatMenuRowCls } from "./styles";

/**
 * The opponent menu's width (Details step, Opponent field). One constant for
 * every branch — a 60-character name must not be what decides how wide the
 * menu is, and the dual-meet and personal menus must not differ.
 */
export const OPPONENT_MENU_WIDTH_CLS = "w-[360px]";

/** The 22px avatar a menu row carries. */
export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-medium text-[var(--ink-700)]"
    >
      {getInitials(name)}
    </span>
  );
}

/** The dashed ring a "new" row wears — a place waiting for something real. */
export function NewRing() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--ink-300)]"
    >
      <Plus className="size-[11px] text-[var(--ink-500)]" strokeWidth={1.5} />
    </span>
  );
}

/**
 * One 38px row of the opponent menu: initials avatar, name, meta. The name is
 * the part that gives way (`min-w-0 truncate`); the meta is a fact about the
 * person and never wraps or shrinks (`whitespace-nowrap shrink-0`).
 */
export function OpponentMenuRow({
  name,
  meta,
  onPick,
}: {
  name: string;
  meta: React.ReactNode;
  onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick} className={floatMenuRowCls}>
      <Avatar name={name} />
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          data-opponent-name=""
          className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]"
        >
          {name}
        </span>
        <span
          data-opponent-meta=""
          className="shrink-0 text-[11px] whitespace-nowrap text-[var(--ink-500)]"
        >
          {meta}
        </span>
      </span>
    </button>
  );
}

/** The "New opponent “…”" / "New player for …" row at the foot of the menu. */
export function OpponentNewRow({
  label,
  hint,
  onPick,
}: {
  label: React.ReactNode;
  hint: string;
  onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick} className={floatMenuRowCls}>
      <NewRing />
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
        {label}
      </span>
      <span className="flex-1" />
      <span className="shrink-0 text-[11px] whitespace-nowrap text-[var(--ink-500)]">
        {hint}
      </span>
    </button>
  );
}
