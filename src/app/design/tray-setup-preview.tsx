"use client";

import { ChevronRight } from "lucide-react";

import { SetupSection } from "@/components/dashboard/activity/activity-tray";
import { personalSetupSteps } from "@/components/dashboard/activity/tray-setup";

/** The personal workspace's setup facts at three points in a new player's first days. */
const STATES = [
  {
    label: "Just signed up — nothing done",
    facts: { sampleReport: false, playingProfile: false, notifications: false },
  },
  {
    label: "Toured the sample report",
    facts: { sampleReport: true, playingProfile: false, notifications: false },
  },
  {
    label: "One step left",
    facts: { sampleReport: true, playingProfile: true, notifications: false },
  },
] as const;

/**
 * The activity tray's "Getting set up" section for a personal workspace, in
 * the tray's own 360px panel: header, the section, the empty feed and the
 * footer. The section is the real `SetupSection` over `personalSetupSteps`;
 * the panel around it is drawn here, since the tray itself needs a session.
 * Links are live but go nowhere useful on this page.
 */
export function TraySetupPreview() {
  return (
    <section id="tray-setup" className="mt-16">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
        Activity tray — getting set up
      </h2>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        A personal workspace&apos;s setup section: the sample report tour, then
        hand and backhand, then report notifications. Done once either report
        tour is, so a player who has read their own first report is not asked.
        All three done, no section.
      </p>
      <div className="mt-6 flex flex-wrap gap-8">
        {STATES.map((state) => (
          <div key={state.label} className="flex flex-col gap-2">
            <span className="text-[11px] text-[var(--ink-500)]">
              {state.label}
            </span>
            <div className="w-[360px] overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border-hairline)] px-4 py-[11px]">
                <p className="text-[13px] font-medium text-[var(--ink-900)]">
                  Activity
                </p>
              </div>
              <div className="flex flex-col p-2">
                <SetupSection
                  steps={personalSetupSteps(state.facts)}
                  onOpen={() => {}}
                />
                <p className="px-2.5 py-4 text-[12px] text-[var(--ink-500)]">
                  Nothing running here.
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-4 py-2.5 text-[11px] text-[var(--ink-600)]">
                Everything that finished
                <ChevronRight
                  className="size-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
