"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS, settingsSection } from "@/lib/dashboard/nav";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { isProgramStaff } from "@/lib/workspace/types";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";

/**
 * The settings rail.
 *
 * Six words in a column. It used to be a magazine table of contents — numbered
 * index, icon, label, and a one-line description each — which was more chrome
 * than the six destinations it points at, and grew a scrollbar the moment the
 * list went past three. Round 4 makes it a plain list: the page's own header
 * says where you are, so the rail only has to say where else you can go.
 *
 * Team appears only for staff of a program. That is presentation, not
 * authorization — `/dashboard/settings/team` re-checks on the server.
 */
export function SettingsNavigation(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useWorkspace();
  const { confirmNavigation } = useUnsavedChanges();

  const activeId = settingsSection(pathname ?? "")?.id ?? "profile";
  const sections = SETTINGS_SECTIONS.filter(
    (section) => !section.teamStaffOnly || isProgramStaff(active)
  );

  const handleClick = (
    event: React.MouseEvent,
    href: string,
    isActive: boolean
  ) => {
    if (isActive) return;
    event.preventDefault();
    if (confirmNavigation()) router.push(href);
  };

  return (
    <nav
      className="w-full shrink-0 md:sticky md:top-6 md:w-[168px] md:self-start"
      aria-label="Settings"
    >
      <div className="-mx-2 flex gap-0.5 overflow-x-auto px-2 pb-2 md:mx-0 md:flex-col md:px-0 md:pb-0 scrollbar-hide">
        {sections.map(({ id, label, href }) => {
          const isActive = activeId === id;

          return (
            <Link
              key={id}
              href={href}
              onClick={(event) => handleClick(event, href, isActive)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-[8px] px-2.5 py-[7px] text-[12px] transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                isActive
                  ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                  : "text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
