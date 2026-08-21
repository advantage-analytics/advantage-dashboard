"use client";

import { useState } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { InviteDialog, type InviteKind } from "./invite-dialog";

/**
 * F6 — the three things to do on visit one, in order.
 *
 * Numbered by eyebrow and only the first one filled: a coach who does one
 * thing today should do the one that produces a report. There is no "skip" —
 * the cards are dismissed by doing them, which is what makes the populated
 * page (F8) the real end of onboarding rather than a state you can declare.
 */

const CARD =
  "flex flex-col gap-3 rounded-[var(--radius-card)] border p-6";

/** One filled action per surface, and it is the DS primary — Signal Blue. */
const PRIMARY_BUTTON = advButton("primary");

/** The two invites are the DS outline: present, deliberately not competing. */
const SECONDARY_BUTTON = advButton("outline");

export function FirstSteps({
  canSubmitVideo,
  playersCanUpload,
}: {
  /**
   * False while a claim is still being confirmed. The claim-review screen
   * promises that inviting works and only sending video waits, so this card
   * has to keep that promise rather than offer a button that the quota check
   * would refuse.
   */
  canSubmitVideo: boolean;
  playersCanUpload: boolean;
}) {
  const [inviting, setInviting] = useState<InviteKind | null>(null);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <div
          className={`${CARD} border-[var(--border-medium)]`}
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
            First
          </span>
          <span className="text-[16px] tracking-[-0.4px] text-[var(--ink-900)]">
            Send your first match
          </span>
          <span className="max-w-[34ch] text-[12px] leading-[1.5] text-[var(--ink-700)]">
            Singles, 1080p or better.
          </span>
          <div className="mt-1">
            {canSubmitVideo ? (
              <Link href="/dashboard/matches/new" className={PRIMARY_BUTTON}>
                Send a match
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <button type="button" disabled className={PRIMARY_BUTTON}>
                  Send a match
                </button>
                <span className="text-[11px] leading-[1.4] text-[var(--ink-500)]">
                  Paused until we confirm the program. Everything else below
                  works now.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={`${CARD} border-[var(--border-hairline)]`}>
          <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
            Second
          </span>
          <span className="text-[16px] tracking-[-0.4px] text-[var(--ink-900)]">
            Invite staff
          </span>
          <span className="max-w-[34ch] text-[12px] leading-[1.5] text-[var(--ink-700)]">
            They see everything you see.
          </span>
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setInviting("staff")}
              className={SECONDARY_BUTTON}
            >
              Add staff
            </button>
          </div>
        </div>

        <div className={`${CARD} border-[var(--border-hairline)]`}>
          <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
            Third
          </span>
          <span className="text-[16px] tracking-[-0.4px] text-[var(--ink-900)]">
            Invite players
          </span>
          <span className="max-w-[34ch] text-[12px] leading-[1.5] text-[var(--ink-700)]">
            They see their own matches only.
          </span>
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setInviting("player")}
              className={SECONDARY_BUTTON}
            >
              Add players
            </button>
          </div>
        </div>
      </div>

      <InviteDialog
        kind={inviting}
        playersCanUpload={playersCanUpload}
        onOpenChange={(open) => {
          if (!open) setInviting(null);
        }}
      />
    </>
  );
}
