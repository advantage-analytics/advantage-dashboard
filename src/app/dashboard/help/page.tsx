import Image from "next/image";
import Link from "next/link";
import { Check, Eye, EyeOff, Minus, UserCheck } from "lucide-react";
import { HelpToc } from "./help-toc";
import { Kbd } from "@/components/ui/kbd";
import { ANALYSIS_LABEL } from "@/lib/data/match-analysis";
import { SUPPORT_EMAIL } from "@/lib/constants";

const SWINGVISION_TROUBLESHOOTING_URL =
  "https://support.swingvision.com/hc/en-us/articles/360058475731";

/**
 * The help centre.
 *
 * Round 4 gives it the shape of the settings pages beside it — sticky rail on
 * the left, one 660px column of content — and two topics it never had:
 * "Getting started" (there are two ways a match gets in, and nothing said so)
 * and "Teams" (the privacy question a player asks first).
 *
 * Every status name and shortcut here is read from the app's own vocabulary
 * rather than retyped. A help page that describes a key binding the app does
 * not have is worse than no help page — it was claiming ⌘B toggled the sidebar,
 * which has been ⌘\ since the rail took the toggle over.
 */

const topicHeadingClass =
  "text-[22px] font-light leading-[28px] tracking-[-0.3px] text-[var(--ink-900)]";
const blockLabelClass = "text-[12px] font-medium text-[var(--ink-900)]";
const proseClass = "text-[12px] leading-[1.65] text-[var(--ink-700)]";
const linkClass =
  "text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:rounded-sm";
const blockDividerClass = "border-t border-[var(--border-hairline)] pt-[22px]";

// Anchor offset accounts for the 44px sticky dashboard header and breathing room.
const sectionScrollMt = "scroll-mt-[88px] lg:scroll-mt-[72px]";

/**
 * The statuses a video passes through, named by the app rather than retyped.
 *
 * Read out of `ANALYSIS_LABEL`, so renaming a status renames it here too. Not
 * called `PIPELINE_STAGES` on purpose — `match-analysis.ts` exports a constant
 * by that name and it is a different thing: the weighted segments of the
 * progress bar, four of them, sized by how long each takes.
 */
const ANALYSIS_JOURNEY: { label: string; tone: StatusTone }[] = [
  { label: ANALYSIS_LABEL.uploading, tone: "blue" },
  { label: ANALYSIS_LABEL.queued, tone: "neutral" },
  { label: ANALYSIS_LABEL.processing, tone: "blue" },
  { label: ANALYSIS_LABEL.deriving, tone: "blue" },
  { label: ANALYSIS_LABEL.completed, tone: "win" },
];

/** Tones from the design system's StatusChip: blue in flight, win at the end. */
type StatusTone = "blue" | "neutral" | "win";

const STATUS_TONE: Record<StatusTone, string> = {
  blue: "text-[var(--blue)]",
  neutral: "text-[var(--ink-500)]",
  win: "text-[var(--success)]",
};

const INTELLIGENCE_REQUIREMENTS = [
  "Singles only",
  "1080p or higher",
  "30 fps or higher",
  "Trim covers complete games",
];

const CONFIDENCE_LEVELS: { level: string; meaning: string }[] = [
  {
    level: "High",
    meaning: "Derived score matches yours — nothing to note.",
  },
  {
    level: "Medium",
    meaning: "One quiet line on the report: reconciled within one game.",
  },
  {
    level: "Low",
    meaning:
      "Stats labeled as estimates, plus a “Review score” path to correct and re-run.",
  },
];

const TEAM_VISIBILITY: {
  icon: typeof Eye;
  title: string;
  detail: string;
}[] = [
  {
    icon: Eye,
    title: "Matches uploaded in the team workspace",
    detail:
      "Visible to your coach and — if the coach allows it — your teammates.",
  },
  {
    icon: EyeOff,
    title: "Matches uploaded in your personal workspace",
    detail: "Private. You share them one at a time, and you can unshare.",
  },
  {
    icon: UserCheck,
    title: "Your profile as your coach sees it",
    detail:
      "A read-only mirror of your own pages — no separate coach-only scoring.",
  },
];

type Shortcut = { keys: string[]; action: string; note?: string };
type ShortcutGroup = { label: string; items: Shortcut[] };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Global",
    items: [
      { keys: ["⌘", "K"], action: "Open the search command palette" },
      { keys: ["/"], action: "Focus search from anywhere outside an input" },
      {
        keys: ["⌘", "\\"],
        // The rail owns the toggle now, and so does this binding. This entry
        // said ⌘B for as long as the toggle lived in the header.
        action: "Pin or unpin the sidebar",
      },
      {
        keys: ["⌘", "U"],
        action: "Start a new match",
        note: "On pages that show the Create Match button.",
      },
      { keys: ["esc"], action: "Close the active modal, dropdown, or palette" },
      {
        keys: ["←"],
        action: "Jump to the previous match",
        note: "On a match detail page.",
      },
      {
        keys: ["→"],
        action: "Jump to the next match",
        note: "On a match detail page.",
      },
    ],
  },
  {
    label: "Visualizations",
    items: [
      {
        keys: ["1"],
        action: "Color serve placement by serve type",
        note: "Inside the serve placement widget.",
      },
      {
        keys: ["2"],
        action: "Color serve placement by point result",
        note: "Inside the serve placement widget.",
      },
      { keys: ["R"], action: "Reset serve placement filters" },
    ],
  },
  {
    label: "Settings",
    items: [{ keys: ["⌘", "S"], action: "Save changes on a settings page" }],
  },
];

type GlossaryEntry = { term: string; definition: string };
type GlossaryGroup = { id: string; label: string; entries: GlossaryEntry[] };

const GLOSSARY: GlossaryGroup[] = [
  {
    id: "glossary-ratings",
    label: "Ratings",
    entries: [
      {
        term: "Serve Rating",
        definition:
          "Composite 0–100 score summarizing serving performance — combines first-serve %, ace rate, double-fault rate, and points won on serve.",
      },
      {
        term: "Return Rating",
        definition:
          "Composite 0–100 score summarizing return performance — combines return-in-play rate, depth, and points won on return.",
      },
      {
        term: "Under Pressure Rating",
        definition:
          "Performance score in high-leverage moments, weighted toward break points and tiebreaks.",
      },
    ],
  },
  {
    id: "glossary-serve",
    label: "Serve",
    entries: [
      {
        term: "First Serve %",
        definition:
          "Percentage of first serves that land in the service box.",
      },
      {
        term: "Ace",
        definition:
          "An unreturnable serve — the opponent does not make contact with the ball.",
      },
      {
        term: "Double Fault",
        definition: "Two consecutive serve faults; the receiver wins the point.",
      },
      {
        term: "Serve Zones · Wide / Body / T",
        definition:
          "The service box is split into three placement zones: Wide (outer third), Body (middle third), and T (center stripe near the T-line).",
      },
      {
        term: "Spin · Flat / Slice / Kick",
        definition:
          "Serve spin classification. Flat is minimal spin, Slice curves laterally, and Kick uses topspin to bounce high.",
      },
    ],
  },
  {
    id: "glossary-return",
    label: "Return",
    entries: [
      {
        term: "Return Stroke",
        definition: "Forehand or backhand return of serve.",
      },
      {
        term: "Return Direction",
        definition:
          "Where the return lands: Cross-court, Down the Line, or Middle.",
      },
      {
        term: "Contact Position",
        definition:
          "Where the returner makes contact relative to the baseline: Inside (inside the court), Middle (on the baseline), or Deep (behind the baseline).",
      },
    ],
  },
  {
    id: "glossary-rally",
    label: "Rally",
    entries: [
      {
        term: "Short Rally",
        definition: "Rallies of 0–4 shots — typically decided by serve or return.",
      },
      {
        term: "Medium Rally",
        definition: "Rallies of 5–8 shots — neutral baseline exchanges.",
      },
      {
        term: "Long Rally",
        definition: "Rallies of 9+ shots — endurance and shot tolerance points.",
      },
    ],
  },
  {
    id: "glossary-outcomes",
    label: "Outcomes",
    entries: [
      {
        term: "Winner",
        definition: "A shot the opponent cannot reach or return into play.",
      },
      {
        term: "Unforced Error",
        definition: "A mistake made without direct pressure from the opponent.",
      },
      {
        term: "Break Point",
        definition: "A point on which the returner can win the service game.",
      },
      {
        term: "Service Games Won %",
        definition: "Percentage of games held while serving.",
      },
      {
        term: "Break Points Saved %",
        definition: "Percentage of break points successfully defended on serve.",
      },
      {
        term: "Break Points Converted %",
        definition: "Percentage of break points won while returning.",
      },
      {
        term: "Net Points Won %",
        definition: "Percentage of points won when finishing at the net.",
      },
      {
        term: "Total Points Won %",
        definition: "Overall percentage of points won across the match.",
      },
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen w-full flex-1 bg-[var(--surface-card)]">
      {/* Same centred container as the settings pages — see the note in
          settings/layout.tsx. Help's rail is 200px, so the block is ~908px and
          fits the same 960px measure. */}
      <div className="mx-auto flex w-full max-w-[1032px] flex-col gap-9 px-6 py-8 sm:px-8 sm:py-10">
        <header
          id="top"
          className={`flex flex-col gap-3 ${sectionScrollMt}`}
        >
          <p className="eyebrow">Help</p>
          <h1 className="text-display">Help center</h1>
          <p className="text-body-sm max-w-[520px]">
            Short answers, real definitions, and a person at the end:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Help%20Center%20question`}
              className={linkClass}
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </header>

        <div className="flex flex-col items-start gap-12 lg:flex-row">
          <HelpToc />

          <article className="flex min-w-0 max-w-[660px] flex-1 flex-col gap-14">
            {/* ══════════ Getting started — two sources ══════════ */}
            <section
              id="getting-started"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Getting started — two sources</h2>
              <p className={`${proseClass} max-w-[560px]`}>
                A match gets into Advantage one of two ways. Both end in the
                same library and the same report — pick by what you have, not by
                which is “better”.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SourceCard
                  title="You have video"
                  body="Advantage Intelligence tracks every shot from your own footage. Singles, 1080p+, 30fps+."
                  cost="Costs analysis hours · takes time · richest report"
                />
                <SourceCard
                  title="You have a SwingVision export"
                  body="Drop the .xlsx. Stats appear as soon as it parses. Singles and doubles."
                  cost="No hours used · instant · stats only, no video"
                />
              </div>

              <div className={`${blockDividerClass} flex flex-col gap-2.5`}>
                <span className={blockLabelClass}>What you get either way</span>
                <div className="flex flex-col">
                  <FeatureRow>
                    Serve, return, rally and break-point breakdowns
                  </FeatureRow>
                  <FeatureRow>
                    Trends across your season, and Ask over your own matches
                  </FeatureRow>
                  <FeatureRow included={false}>
                    Shot-by-shot video review — Advantage Intelligence only
                  </FeatureRow>
                </div>
              </div>

              <div
                className={`${blockDividerClass} flex flex-wrap items-center gap-4`}
              >
                <Link
                  href="/dashboard/matches/new"
                  className={`text-[12px] font-medium ${linkClass}`}
                >
                  Upload your first match →
                </Link>
                <span className="text-[11px] text-[var(--ink-500)]">
                  or press <Kbd size="sm">⌘</Kbd> <Kbd size="sm">U</Kbd> from the
                  matches list
                </span>
              </div>
            </section>

            {/* ══════════ Advantage Intelligence ══════════ */}
            <section
              id="advantage-intelligence"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Advantage Intelligence</h2>

              <div className="flex flex-col gap-2.5">
                <span className={blockLabelClass}>What it needs</span>
                <div className="flex flex-wrap gap-1.5">
                  {INTELLIGENCE_REQUIREMENTS.map((requirement) => (
                    <span
                      key={requirement}
                      className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-[3px] text-[11px] text-[var(--ink-700)]"
                    >
                      {requirement}
                    </span>
                  ))}
                </div>
                <p className={proseClass}>
                  Files are checked when you pick them — a 720p video is
                  rejected before a single byte uploads, with the fix spelled
                  out: Phone settings → Camera → Record at 1080p/30 or higher.
                  Doubles matches import via SwingVision instead.
                </p>
              </div>

              <div className={`${blockDividerClass} flex flex-col gap-2.5`}>
                <span className={blockLabelClass}>After you submit</span>
                {/* Dot + label, no container — the design system's StatusChip
                    is "quiet inline dot + sentence-case text", and a row of
                    filled pills would read as five buttons. */}
                <ol className="flex flex-wrap items-center gap-2.5">
                  {ANALYSIS_JOURNEY.map((stage, index) => (
                    <li key={stage.label} className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-none ${STATUS_TONE[stage.tone]}`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-[5px] shrink-0 rounded-full bg-current"
                        />
                        {stage.label}
                      </span>
                      {index < ANALYSIS_JOURNEY.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="text-[11px] text-[var(--ink-300)]"
                        >
                          →
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                <p className={proseClass}>
                  There is no fixed turnaround. Close the tab once the upload
                  finishes — we email you when it is analyzed and at any
                  failure. The video is watchable the moment it is processed,
                  even while stats are finalizing.
                </p>
              </div>

              <div className={`${blockDividerClass} flex flex-col gap-1`}>
                <span className={`${blockLabelClass} pb-1.5`}>
                  Reading confidence
                </span>
                {CONFIDENCE_LEVELS.map((row) => (
                  <div
                    key={row.level}
                    className="flex items-start gap-3 border-b border-[var(--border-hairline)] py-2 last:border-b-0"
                  >
                    <span className="w-[60px] shrink-0 text-[11px] text-[var(--ink-600)]">
                      {row.level}
                    </span>
                    <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
                      {row.meaning}
                    </span>
                  </div>
                ))}
              </div>

              <p className={`${blockDividerClass} ${proseClass}`}>
                Analysis time is metered per month and shown on{" "}
                <Link href="/dashboard/settings/usage" className={linkClass}>
                  Settings → Usage
                </Link>
                . Hours reserve when you submit and reconcile when the job
                finishes; a failed job gives them back.
              </p>
            </section>

            {/* ══════════ Importing from SwingVision ══════════ */}
            <section
              id="swingvision"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Importing from SwingVision</h2>
              <p className={`${proseClass} max-w-[560px]`}>
                Exporting takes about a minute and costs no analysis hours. You
                need a SwingVision Pro account to export, and at least one
                complete match uploaded there.
              </p>

              <div className="flex flex-col gap-5">
                <Step number="01" title="Open the match you want">
                  In SwingVision, go to the match and scroll to the top section
                  of the match page.
                </Step>
                <Step number="02" title="Export the data">
                  Click{" "}
                  <strong className="font-medium text-[var(--ink-900)]">
                    Export Data
                  </strong>
                  . The file should contain
                  six sheets:
                  <span className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                    {["Settings", "Shots", "Points", "Games", "Sets", "Stats"].map(
                      (sheet) => (
                        <span key={sheet} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-1 rounded-full bg-[var(--ink-300)]"
                          />
                          {sheet}
                        </span>
                      ),
                    )}
                  </span>
                </Step>
                <Step number="03" title="Drop the .xlsx into Advantage">
                  Start a{" "}
                  <Link href="/dashboard/matches/new" className={linkClass}>
                    new match
                  </Link>
                  , pick SwingVision, and upload the file. Stats appear as soon
                  as it parses.
                </Step>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <figure className="flex flex-col gap-2">
                  <div className="overflow-hidden rounded-[8px] border border-[var(--border-card)] bg-[var(--surface-muted)]">
                    <Image
                      src="/swingvision1.png"
                      alt="SwingVision match page showing the Export Data option"
                      width={505}
                      height={350}
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    Open the match you want to export.
                  </figcaption>
                </figure>
                <figure className="flex flex-col gap-2">
                  <div className="overflow-hidden rounded-[8px] border border-[var(--border-card)] bg-[var(--surface-muted)]">
                    <Image
                      src="/swingvision2.png"
                      alt="SwingVision export confirmation showing the included sheets"
                      width={505}
                      height={350}
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    Confirm the export and save the .xlsx file.
                  </figcaption>
                </figure>
              </div>

              <p className={`${blockDividerClass} ${proseClass}`}>
                Missing sheets or an incomplete file? Follow SwingVision&apos;s
                own{" "}
                <a
                  href={SWINGVISION_TROUBLESHOOTING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  troubleshooting guide
                </a>
                , then try the export again.
              </p>
            </section>

            {/* ══════════ Teams ══════════ */}
            <section
              id="teams"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Teams</h2>
              <p className={`${proseClass} max-w-[560px]`}>
                Joining a program adds a second workspace to your account. Your
                personal matches stay yours — the two never merge on their own.
              </p>

              <div className="flex flex-col gap-2.5">
                <span className={blockLabelClass}>
                  What the program can see
                </span>
                <div className="flex flex-col">
                  {TEAM_VISIBILITY.map((row) => {
                    const Icon = row.icon;
                    return (
                      <div
                        key={row.title}
                        className="flex items-start gap-3 border-b border-[var(--border-hairline)] py-[11px] last:border-b-0"
                      >
                        <Icon
                          className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-600)]"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-[12px] text-[var(--ink-900)]">
                            {row.title}
                          </div>
                          <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
                            {row.detail}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`${blockDividerClass} flex flex-col gap-2.5`}>
                <span className={blockLabelClass}>Uploads on your behalf</span>
                <p className={proseClass}>
                  Your coach — and, if they turn it on, your teammates — can add
                  a team match for you. The match card always names who added
                  it. Team uploads draw on the program&apos;s shared hours,
                  never your personal allowance.
                </p>
              </div>

              <div className={`${blockDividerClass} flex flex-col gap-2.5`}>
                <span className={blockLabelClass}>Leaving a program</span>
                <p className={proseClass}>
                  Team matches stay with the program; your personal library
                  leaves with you. Ask your coach to remove you, or contact
                  support.
                </p>
              </div>
            </section>

            {/* ══════════ Keyboard shortcuts ══════════ */}
            <section
              id="shortcuts"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Keyboard shortcuts</h2>
              <p className={`${proseClass} max-w-[560px]`}>
                Use Ctrl instead of ⌘ on Windows and Linux.
              </p>

              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-2.5">
                  <span className={blockLabelClass}>{group.label}</span>
                  <dl className="flex flex-col">
                    {group.items.map((shortcut) => (
                      <div
                        key={shortcut.action}
                        className="flex items-center justify-between gap-6 border-b border-[var(--border-hairline)] py-2.5 last:border-b-0"
                      >
                        <dd className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[12px] leading-[1.45] text-[var(--ink-900)]">
                            {shortcut.action}
                          </span>
                          {shortcut.note && (
                            <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                              {shortcut.note}
                            </span>
                          )}
                        </dd>
                        <dt className="flex shrink-0 items-center gap-1">
                          {shortcut.keys.map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </dt>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>

            {/* ══════════ Glossary ══════════ */}
            <section
              id="glossary"
              className={`flex flex-col gap-[26px] ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Glossary</h2>
              <p className={`${proseClass} max-w-[560px]`}>
                What every stat, zone and rating means. The same definitions
                power the hover cards on stat labels across the app — turn those
                off in{" "}
                <Link
                  href="/dashboard/settings/preferences"
                  className={linkClass}
                >
                  Preferences
                </Link>
                .
              </p>

              {GLOSSARY.map((group) => (
                <div
                  key={group.label}
                  id={group.id}
                  className={`flex flex-col gap-2.5 ${sectionScrollMt}`}
                >
                  <span className={blockLabelClass}>{group.label}</span>
                  <dl className="flex flex-col">
                    {group.entries.map((entry) => (
                      <div
                        key={entry.term}
                        className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-[var(--border-hairline)] py-3 last:border-b-0 sm:grid-cols-[180px_1fr]"
                      >
                        <dt className="text-[12px] font-medium leading-[1.5] text-[var(--ink-900)]">
                          {entry.term}
                        </dt>
                        <dd className={proseClass}>{entry.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>

            {/* ══════════ Contact support ══════════ */}
            <section
              id="support"
              className={`flex flex-col gap-2.5 ${sectionScrollMt}`}
            >
              <h2 className={topicHeadingClass}>Contact support</h2>
              <p className={proseClass}>
                Still stuck?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Help%20Center%20question`}
                  className={linkClass}
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                — a person answers. Include the match you were looking at and
                we can go straight to the job.
              </p>
              <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                By Clajerson Gimena, Founder
              </p>
              <a
                href="#top"
                className="mt-4 inline-flex w-fit items-center gap-1.5 text-[12px] text-[var(--ink-700)] transition-colors hover:text-[var(--ink-900)]"
              >
                <span aria-hidden="true">↑</span>
                Back to top
              </a>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  title,
  body,
  cost,
}: {
  title: string;
  body: string;
  cost: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--border-card)] p-[18px]">
      <span className="text-[13px] font-medium text-[var(--ink-900)]">
        {title}
      </span>
      <span className="text-[11px] leading-[1.6] text-[var(--ink-600)]">
        {body}
      </span>
      <span aria-hidden="true" className="h-px bg-[var(--border-hairline)]" />
      <span className="text-[11px] text-[var(--ink-600)]">{cost}</span>
    </div>
  );
}

/** A capability line. `included={false}` is the one thing a source does not do. */
function FeatureRow({
  children,
  included = true,
}: {
  children: React.ReactNode;
  included?: boolean;
}) {
  const Icon = included ? Check : Minus;
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-2.5 last:border-b-0">
      <Icon
        className={`size-[13px] shrink-0 ${
          included ? "text-[var(--ink-600)]" : "text-[var(--ink-400)]"
        }`}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span
        className={`text-[12px] ${
          included ? "text-[var(--ink-700)]" : "text-[var(--ink-600)]"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5">
      <span className="mono mt-px w-[22px] shrink-0 text-[11px] text-[var(--ink-400)]">
        {number}
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-[var(--ink-900)]">{title}</span>
        <span className={proseClass}>{children}</span>
      </div>
    </div>
  );
}
