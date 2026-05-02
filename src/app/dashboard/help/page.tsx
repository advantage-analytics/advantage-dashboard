import Image from "next/image";
import Link from "next/link";
import { HelpToc } from "./help-toc";
import { Kbd } from "./kbd";

const SUPPORT_EMAIL = "support@advantageanalytics.app";
const SWINGVISION_TROUBLESHOOTING_URL =
  "https://support.swingvision.com/hc/en-us/articles/360058475731";

const eyebrowClass =
  "text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]";
const topicHeadingClass =
  "font-light text-[28px] sm:text-[32px] text-[var(--color-ink-900)] tracking-[-0.5px] leading-[38px]";
const stepHeadingClass =
  "font-light text-[20px] sm:text-[22px] text-[var(--color-ink-900)] tracking-[-0.3px] leading-[28px]";
const groupHeadingClass =
  "text-[11px] font-medium text-[var(--color-ink-500)] uppercase tracking-[1.8px]";
const bodyClass = "text-[14px] leading-[1.7] text-[var(--color-ink-700)]";
const subBodyClass = "text-[13px] leading-[1.65] text-[var(--color-ink-700)]";
const linkClass =
  "text-[var(--color-blue)] underline decoration-[var(--color-blue)]/30 underline-offset-2 transition-colors hover:decoration-[var(--color-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-ring-40)] focus-visible:rounded-sm";
const sectionDividerClass =
  "pt-10 border-t border-[var(--color-ink-100)]";
const topicDividerClass =
  "pt-16 mt-4 border-t border-[var(--color-ink-200)]";

// Anchor offset accounts for the 44px sticky dashboard header and breathing room.
const sectionScrollMt = "scroll-mt-[88px] lg:scroll-mt-[72px]";

type Shortcut = { keys: string[]; action: string; note?: string };
type ShortcutGroup = { label: string; items: Shortcut[] };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Global",
    items: [
      { keys: ["⌘", "K"], action: "Open the search command palette" },
      { keys: ["/"], action: "Focus search from anywhere outside an input" },
      { keys: ["⌘", "B"], action: "Toggle the sidebar" },
      { keys: ["⌘", "U"], action: "Open the upload-match modal" },
      { keys: ["Esc"], action: "Close the active modal, dropdown, or palette" },
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
    items: [{ keys: ["⌘", "S"], action: "Save profile changes" }],
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
    <div className="flex-1 w-full min-h-screen bg-[var(--color-surface-card)]">
      <div className="pl-12 pr-8 py-10">
        {/* Page header — full width above the two-column body */}
        <header id="top" className="flex flex-col gap-3 max-w-[760px] scroll-mt-[88px] lg:scroll-mt-[72px]">
          <p className={eyebrowClass}>Help</p>
          <h1 className="font-light text-[34px] sm:text-[40px] text-[var(--color-ink-900)] tracking-[-0.6px] leading-[46px]">
            Help &amp; reference
          </h1>
          <p className="text-[14px] text-[var(--color-ink-700)] leading-[1.65] max-w-xl">
            A quick reference for moving around faster, getting your data in,
            and understanding what the numbers mean.
          </p>
        </header>

        {/* Body — article + sticky right-rail TOC on lg+. Mobile gets a sticky pill bar from HelpToc. */}
        <div className="mt-10 flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
          <article className="max-w-[760px] flex-1 min-w-0 flex flex-col">
            {/* ═════════════ TOPIC 1 — Keyboard shortcuts ═════════════ */}
            <section
              id="shortcuts"
              className={`flex flex-col gap-12 ${sectionScrollMt}`}
            >
              <div className="flex flex-col gap-3">
                <h2 className={topicHeadingClass}>Keyboard shortcuts</h2>
                <p className="text-[14px] text-[var(--color-ink-700)] leading-[1.65] max-w-xl">
                  Move through Advantage without leaving the keyboard.
                </p>
                <p className={`${subBodyClass} mt-1`}>
                  Use Ctrl instead of ⌘ on Windows and Linux.
                </p>
              </div>

              {SHORTCUT_GROUPS.map((group) => (
                <div
                  key={group.label}
                  className={`${sectionDividerClass} flex flex-col gap-4`}
                >
                  <h3 className={groupHeadingClass}>{group.label}</h3>
                  <dl className="flex flex-col">
                    {group.items.map((shortcut, idx) => (
                      <div
                        key={`${group.label}-${idx}`}
                        className={`
                          flex items-center justify-between gap-6 py-3.5
                          ${idx > 0 ? "border-t border-[var(--color-ink-100)]/60" : ""}
                        `}
                      >
                        <dd className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="text-[14px] text-[var(--color-ink-900)] leading-[1.45]">
                            {shortcut.action}
                          </span>
                          {shortcut.note && (
                            <span className="text-[12px] text-[var(--color-ink-500)] leading-[1.5]">
                              {shortcut.note}
                            </span>
                          )}
                        </dd>
                        <dt className="flex items-center gap-1 flex-shrink-0">
                          {shortcut.keys.map((key, keyIdx) => (
                            <Kbd key={keyIdx}>{key}</Kbd>
                          ))}
                        </dt>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>

            {/* ═════════════ TOPIC 2 — Upload SwingVision data ═════════════ */}
            <section
              id="upload"
              className={`${topicDividerClass} flex flex-col gap-12 ${sectionScrollMt}`}
            >
              <div className="flex flex-col gap-3">
                <h2 className={topicHeadingClass}>Upload your SwingVision data</h2>
                <p className="text-[14px] text-[var(--color-ink-700)] leading-[1.65] max-w-xl">
                  A step-by-step guide to exporting your match data from
                  SwingVision and bringing it into Advantage.
                </p>
              </div>

              <div id="step-1" className={`${sectionDividerClass} flex flex-col gap-3`}>
                <p className={eyebrowClass}>Step 01</p>
                <h3 className={stepHeadingClass}>Log in to your SwingVision account</h3>
                <p className={bodyClass}>
                  You must be a{" "}
                  <strong className="font-medium text-[var(--color-ink-900)]">
                    Pro user
                  </strong>{" "}
                  to export your data. Make sure your account has the necessary
                  subscription level before proceeding.
                </p>
              </div>

              <div id="step-2" className={`${sectionDividerClass} flex flex-col gap-3`}>
                <p className={eyebrowClass}>Step 02</p>
                <h3 className={stepHeadingClass}>Upload a match</h3>
                <p className={bodyClass}>
                  Advantage currently supports importing match-level data only.
                  Make sure you have uploaded{" "}
                  <strong className="font-medium text-[var(--color-ink-900)]">
                    at least one complete match
                  </strong>{" "}
                  to your SwingVision account.
                </p>
              </div>

              <div id="step-3" className={`${sectionDividerClass} flex flex-col gap-5`}>
                <div className="flex flex-col gap-3">
                  <p className={eyebrowClass}>Step 03</p>
                  <h3 className={stepHeadingClass}>Export the data</h3>
                  <ol
                    className={`${bodyClass} list-decimal pl-5 space-y-1.5 marker:text-[var(--color-ink-400)]`}
                  >
                    <li>Navigate to the match you want to export.</li>
                    <li>Go to the top section of the match page.</li>
                    <li>
                      Click{" "}
                      <strong className="font-medium text-[var(--color-ink-900)]">
                        Export Data
                      </strong>
                      .
                    </li>
                  </ol>
                  <p className={`${bodyClass} pt-1`}>
                    Your exported file should include these sheets:
                  </p>
                  <ul
                    className={`${bodyClass} grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 pl-1`}
                  >
                    {["Settings", "Shots", "Points", "Games", "Sets", "Stats"].map(
                      (sheet) => (
                        <li key={sheet} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-1 rounded-full bg-[var(--color-ink-300)]"
                          />
                          {sheet}
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <figure className="flex flex-col gap-2">
                    <div className="overflow-hidden rounded-[6px] border border-[var(--color-ink-100)] bg-[var(--color-surface-muted)]">
                      <Image
                        src="/swingvision1.png"
                        alt="SwingVision match page showing the Export Data option"
                        width={505}
                        height={350}
                        className="w-full h-auto"
                      />
                    </div>
                    <figcaption className="text-[11px] text-[var(--color-ink-500)] leading-[1.5]">
                      Open the match you want to export.
                    </figcaption>
                  </figure>
                  <figure className="flex flex-col gap-2">
                    <div className="overflow-hidden rounded-[6px] border border-[var(--color-ink-100)] bg-[var(--color-surface-muted)]">
                      <Image
                        src="/swingvision2.png"
                        alt="SwingVision export confirmation showing the included sheets"
                        width={505}
                        height={350}
                        className="w-full h-auto"
                      />
                    </div>
                    <figcaption className="text-[11px] text-[var(--color-ink-500)] leading-[1.5]">
                      Confirm the export and save the .xlsx file.
                    </figcaption>
                  </figure>
                </div>
              </div>

              <div id="step-4" className={`${sectionDividerClass} flex flex-col gap-3`}>
                <p className={eyebrowClass}>Step 04</p>
                <h3 className={stepHeadingClass}>Troubleshoot any issues</h3>
                <p className={bodyClass}>
                  If your exported data is missing sheets or seems incomplete,
                  follow SwingVision&apos;s official troubleshooting guide:{" "}
                  <a
                    href={SWINGVISION_TROUBLESHOOTING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    Troubleshoot SwingVision export issues
                  </a>
                  .
                </p>
              </div>

              <div id="step-5" className={`${sectionDividerClass} flex flex-col gap-3`}>
                <p className={eyebrowClass}>Step 05</p>
                <h3 className={stepHeadingClass}>Import your data into Advantage</h3>
                <p className={bodyClass}>
                  Once your data is exported and verified, head to your{" "}
                  <Link href="/dashboard" className={linkClass}>
                    dashboard
                  </Link>{" "}
                  and upload the file to start generating advanced analytics for
                  your match.
                </p>
              </div>
            </section>

            {/* ═════════════ TOPIC 3 — Glossary ═════════════ */}
            <section
              id="glossary"
              className={`${topicDividerClass} flex flex-col gap-12 ${sectionScrollMt}`}
            >
              <div className="flex flex-col gap-3">
                <h2 className={topicHeadingClass}>Glossary</h2>
                <p className="text-[14px] text-[var(--color-ink-700)] leading-[1.65] max-w-xl">
                  What every stat, zone, and rating means in Advantage.
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-[12px] leading-[1.5] text-[var(--color-ink-700)]">
                  <span className="text-[var(--color-ink-500)]">Jump to</span>
                  {GLOSSARY.map((group, idx) => (
                    <span key={group.label} className="inline-flex items-center gap-1">
                      <a
                        href={`#${group.id}`}
                        className="
                          inline-flex items-center min-h-[28px] px-1 -mx-1 rounded-sm
                          underline decoration-[var(--color-ink-300)] underline-offset-2
                          text-[var(--color-ink-700)]
                          transition-colors
                          hover:text-[var(--color-ink-900)] hover:decoration-[var(--color-ink-500)]
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-ring-40)]
                        "
                      >
                        {group.label}
                      </a>
                      {idx < GLOSSARY.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="text-[var(--color-ink-400)]"
                        >
                          ·
                        </span>
                      )}
                    </span>
                  ))}
                </p>
              </div>

              {GLOSSARY.map((group) => (
                <div
                  key={group.label}
                  className={`${sectionDividerClass} flex flex-col gap-5 ${sectionScrollMt}`}
                >
                  <h3 id={group.id} className={groupHeadingClass}>
                    {group.label}
                  </h3>
                  <dl className="flex flex-col">
                    {group.entries.map((entry, idx) => (
                      <div
                        key={`${group.label}-${idx}`}
                        className={`
                          grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-8 gap-y-1 py-4
                          ${idx > 0 ? "border-t border-[var(--color-ink-100)]/60" : ""}
                        `}
                      >
                        <dt className="text-[13px] font-medium text-[var(--color-ink-900)] leading-[1.5]">
                          {entry.term}
                        </dt>
                        <dd className={`${bodyClass} sm:pt-px`}>
                          {entry.definition}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>

            {/* Back to top — quiet editorial affordance */}
            <div className="mt-16 flex justify-end">
              <a
                href="#top"
                className="
                  inline-flex items-center gap-1.5 min-h-[44px] px-2 -mx-2 rounded-sm
                  text-[13px] text-[var(--color-ink-700)]
                  transition-colors
                  hover:text-[var(--color-ink-900)]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-ring-40)]
                "
              >
                <span aria-hidden="true">↑</span>
                Back to top
              </a>
            </div>

            {/* Footer — uses the lighter section divider; not a topic */}
            <footer className={`${sectionDividerClass} mt-6 flex flex-col gap-3`}>
              <p className={bodyClass}>
                Still stuck?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Help%20Center%20question`}
                  className={linkClass}
                >
                  Email {SUPPORT_EMAIL}
                </a>
                .
              </p>
              <p className="text-[11px] text-[var(--color-ink-500)] leading-[1.5]">
                By CJ Gimena, Founder
              </p>
            </footer>
          </article>

          <HelpToc />
        </div>
      </div>
    </div>
  );
}
