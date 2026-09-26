"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { SettingsNavigation } from "@/components/dashboard/settings/settings-navigation";
import { settingsSection, SETTINGS_SECTIONS } from "@/lib/dashboard/nav";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { teamLabel } from "@/lib/workspace/types";
import { capitalize } from "@/lib/utils";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/** `/dashboard/settings/teams/<id>` → the id; null anywhere else. */
const TEAM_DETAIL = /^\/dashboard\/settings\/teams\/([^/]+)/;

/**
 * Every settings page wears the same header: eyebrow, 30px light title,
 * subtitle. Which words go in it belong to `SETTINGS_SECTIONS` — this used to
 * hold a second `Record` keyed by the same ids, so a seventh section added to
 * the rail would have rendered under the Profile heading, silently.
 *
 * Teams is the one section with pages beneath it. On a program's own page the
 * title is the program and the eyebrow is the way back, resolved from the
 * workspaces the client already holds — so no round trip, and no chance of
 * naming the *active* program when the person is looking at another.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { available } = useWorkspace();

  const section = settingsSection(pathname ?? "") ?? SETTINGS_SECTIONS[0];

  const detailId = pathname?.match(TEAM_DETAIL)?.[1] ?? null;
  const program = detailId
    ? available.find(
        (workspace) => workspace.kind === "team" && workspace.id === detailId,
      )
    : undefined;
  const squad = program ? teamLabel(program.team) : null;

  return (
    <div className="min-h-screen w-full flex-1 bg-[var(--surface-card)]">
      {/* Centred on the block's own width, not on the viewport.
          The canvas measures 40/32/48/48 inside a fixed 1280px artboard, where
          the rail + column (~870px) nearly fills the 968px of inner width — so
          it reads as centred there. Transcribed literally, or dropped into the
          `max-w-screen-2xl` the wide dashboard pages use, that same block sits
          hard against the left edge of a real display with several hundred
          pixels of dead space beside it. Sizing the container to the content
          keeps the artboard's proportion at every width.

          1032 = the artboard's 968px of inner content width, plus the 32px of
          padding this container adds on each side. Measure the design from the
          inside out, not the outside in — sizing the box to 968 instead loses
          64px and the page reads cramped. */}
      <div className="mx-auto flex w-full max-w-[1032px] flex-col gap-10 px-6 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-3">
          {program ? (
            <>
              {/* In the eyebrow's row, but a control, not a label: 28px tall,
                  arrow and word, the same wash every secondary control hovers
                  to. Says where it goes ("Teams"), not where you are — the
                  crumb above already says that. */}
              <Link
                href="/dashboard/settings/teams"
                className="-ml-2 inline-flex h-7 items-center gap-1.5 self-start rounded-[6px] pr-2.5 pl-2 text-[12px] font-medium text-[var(--ink-600)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:outline-none"
              >
                <ArrowLeft
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Teams
              </Link>
              <h1 className="text-display">{program.name}</h1>
              <p className="text-body-sm max-w-[520px]">
                {squad ? `${squad} tennis · ` : ""}
                {capitalize(program.role)}
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">Settings</p>
              <h1 className="text-display">{section.title ?? section.label}</h1>
              <p className="text-body-sm max-w-[520px]">
                {section.subtitle}
                {section.id === "plan" && (
                  <>
                    {" "}
                    Analysis hours are metered separately on{" "}
                    <Link
                      href="/dashboard/settings/usage"
                      className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                    >
                      Usage
                    </Link>
                    .
                  </>
                )}
              </p>
            </>
          )}
        </header>

        <div className="flex flex-col gap-12 md:flex-row">
          <SettingsNavigation />
          <div className="min-w-0 flex-1">
            <motion.div
              // Teams has pages beneath it; keying on the path lets the
              // drill-down fade like every other section change does.
              key={
                section.id === "teams" ? (pathname ?? section.id) : section.id
              }
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE_CURVE }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
