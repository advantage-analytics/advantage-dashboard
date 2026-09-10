import type { ReactNode } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

export function TeamListHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-display">{title}</h1>
      <div className="text-body-sm mt-[9px]">{children}</div>
    </div>
  );
}

export function ScheduleTitleRow({
  children,
  canCreate,
}: {
  children: ReactNode;
  canCreate: boolean;
}) {
  return (
    <div className="flex items-end gap-2.5">
      <TeamListHeading title="Schedule">{children}</TeamListHeading>
      <div className="flex-1" />
      {canCreate && (
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            title="Schedule import is not available yet"
          >
            Import
          </button>
          <Link
            href="/dashboard/team/schedule/new"
            className={advButton("primary", "md")}
          >
            New event
          </Link>
        </>
      )}
    </div>
  );
}
