import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

export default function PlayerNotFound() {
  return (
    <div className="flex w-full flex-1 flex-col items-start gap-4 bg-[var(--surface-card)] px-10 py-12">
      <h1 className="text-title-lg">No such player</h1>
      <p
        className="max-w-[56ch] text-[13px] leading-[1.6]"
        style={{ color: "var(--ink-700)" }}
      >
        They may have left the roster, or belong to a program you&rsquo;re not
        in.
      </p>
      <Link
        href="/dashboard/team/roster"
        className={advButton("outline", "sm")}
      >
        Back to the roster
      </Link>
    </div>
  );
}
