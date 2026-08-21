import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

export default function EventNotFound() {
  return (
    <div className="flex w-full flex-1 flex-col items-start gap-4 bg-[var(--surface-card)] px-10 py-12">
      <h1
        className="text-[24px] font-light leading-[1.2] tracking-[-0.4px]"
        style={{ color: "var(--ink-900)" }}
      >
        No such event
      </h1>
      <p
        className="max-w-[56ch] text-[13px] leading-[1.6]"
        style={{ color: "var(--ink-700)" }}
      >
        It may have been deleted, or it belongs to a program you&rsquo;re not in.
      </p>
      <Link href="/dashboard/team/schedule" className={advButton("outline", "sm")}>
        Back to the schedule
      </Link>
    </div>
  );
}
