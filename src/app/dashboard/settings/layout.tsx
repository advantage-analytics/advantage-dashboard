"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsNavigation } from "@/components/dashboard/settings/settings-navigation";
import { settingsSection, SETTINGS_SECTIONS } from "@/lib/dashboard/nav";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { teamLabel } from "@/lib/workspace/types";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/**
 * Every settings page wears the same header: eyebrow, 30px light title,
 * subtitle. Which words go in it belong to `SETTINGS_SECTIONS` — this used to
 * hold a second `Record` keyed by the same ids, so a seventh section added to
 * the rail would have rendered under the Profile heading, silently.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { active } = useWorkspace();

  const section = settingsSection(pathname ?? "") ?? SETTINGS_SECTIONS[0];
  const squad = teamLabel(active.team);

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
          <p className="eyebrow">Settings</p>
          <h1 className="text-display">{section.title ?? section.label}</h1>
          <p className="text-body-sm max-w-[520px]">
            {/* The two subtitles that cannot be a static string: Team names the
                program you are looking at, Plan points at where hours live. */}
            {section.id === "team" && active.kind === "team"
              ? `${active.name}${squad ? ` ${squad.toLowerCase()} tennis` : ""} — ${section.subtitle.toLowerCase()}`
              : section.subtitle}
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
        </header>

        <div className="flex flex-col gap-12 md:flex-row">
          <SettingsNavigation />
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_CURVE }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
