"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Swords, Trophy, User } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { Kbd } from "@/components/ui/kbd";

/**
 * 25a's New event menu.
 *
 * Three destinations and a hairline. The rule separating them is what a match
 * belongs to: a dual and a tournament are events the program shows up to, and a
 * single match — a challenge, a practice set, an outside tournament — belongs
 * to the player's season and nothing else. That is why it sits below the rule
 * and runs the personal wizard rather than creating anything here.
 */
const ITEMS = [
  {
    key: "d",
    icon: Swords,
    label: "Dual match",
    note: null,
    href: "/dashboard/team/schedule/new/dual",
  },
  {
    key: "t",
    icon: Trophy,
    label: "Tournament",
    note: null,
    href: "/dashboard/team/schedule/new/tournament",
  },
  {
    key: "m",
    icon: User,
    label: "Single match",
    note: "Challenge, practice or an outside event",
    href: "/dashboard/matches/new",
  },
] as const;

export function NewEventMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Bound only while the menu is open, and torn down with it. A global D/T/M
  // would fire while somebody was typing an opponent's name two screens away.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const item = ITEMS.find((entry) => entry.key === event.key.toLowerCase());
      if (!item) return;
      event.preventDefault();
      setOpen(false);
      router.push(item.href);
    }

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, router]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className={advButton("primary", "sm")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        New event
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[274px] rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-floating)]"
        >
          {ITEMS.map((item, index) => (
            <div key={item.key}>
              {index === ITEMS.length - 1 ? (
                <div className="mx-1 my-[5px] h-px bg-[var(--border-hairline)]" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className="flex w-full cursor-pointer items-center gap-[11px] rounded-[var(--radius-element)] px-[11px] py-[9px] text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
              >
                <item.icon
                  strokeWidth={1.5}
                  className="size-3.5 shrink-0 text-[var(--ink-700)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-[var(--ink-900)]">
                    {item.label}
                  </span>
                  {item.note ? (
                    <span
                      className="text-micro mt-0.5 block"
                      style={{ color: "var(--ink-600)" }}
                    >
                      {item.note}
                    </span>
                  ) : null}
                </span>
                <Kbd size="sm">{item.key.toUpperCase()}</Kbd>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
