import { Kbd } from "@/components/ui/kbd";
import { shortcutGroupsFor } from "@/components/admin/labels/label-shortcuts";
import {
  CLEANING_STANDARD_SECTIONS,
  GUIDE_PARTS,
  GUIDE_VERSION,
  HOW_TO_SECTIONS,
  type GuideBlock,
  type GuideSection,
} from "@/lib/labels/guide-content";

/**
 * The body of `/label/guide`: the title, an in-page nav to the two halves,
 * then "How to use the console" and "Cleaning standard", each a
 * `<section id>` of `GuideSection`s from guide-content.ts. Plain prose on
 * the DS text tokens, in the help centre's 660px column; no video, no images.
 *
 * The Keys subsection is `LABEL_SHORTCUT_GROUPS` — the list the console's
 * shortcut sheet reads — never a copy of it.
 *
 * No hooks, so it renders on the server and in the offline spec alike. It
 * links only to its own anchors: a labeller has nowhere else to go.
 */

const proseClass = "text-[13px] leading-[1.65] text-[var(--ink-700)]";
const linkClass =
  "text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:rounded-sm focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

function Shortcuts() {
  return (
    <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2">
      {shortcutGroupsFor("labeller").map((group) => (
        <div
          key={group.label}
          data-guide-shortcut-group={group.label}
          className="flex min-w-0 flex-col gap-1.5"
        >
          <span className="eyebrow">{group.label}</span>
          <dl className="flex flex-col">
            {group.items.map((shortcut) => (
              <div
                key={shortcut.action}
                data-guide-keys={shortcut.keys.join("")}
                className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] py-1.5 last:border-b-0"
              >
                <dd className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[12px] leading-[1.45] text-[var(--ink-900)]">
                    {shortcut.action}
                  </span>
                  {shortcut.note ? (
                    <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                      {shortcut.note}
                    </span>
                  ) : null}
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
    </div>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <p className={proseClass}>{block.text}</p>;
    case "list":
      return (
        <ul className={`${proseClass} flex list-disc flex-col gap-1.5 pl-5`}>
          {block.items.map((item) => (
            <li key={item} className="pl-1">
              {item}
            </li>
          ))}
        </ul>
      );
    case "shortcuts":
      return <Shortcuts />;
  }
}

function Subsection({ section }: { section: GuideSection }) {
  return (
    <div
      id={section.id}
      data-guide-subsection={section.id}
      className="flex scroll-mt-[72px] flex-col gap-3 border-t border-[var(--border-hairline)] pt-[22px]"
    >
      <h3 className="text-title">{section.heading}</h3>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Part({
  part,
  sections,
}: {
  part: { id: string; heading: string };
  sections: readonly GuideSection[];
}) {
  return (
    <section
      id={part.id}
      aria-labelledby={`${part.id}-heading`}
      data-guide-part={part.id}
      className="flex scroll-mt-[72px] flex-col gap-[22px]"
    >
      <h2 id={`${part.id}-heading`} className="text-title-lg">
        {part.heading}
      </h2>
      {sections.map((section) => (
        <Subsection key={section.id} section={section} />
      ))}
    </section>
  );
}

export function LabelGuide() {
  const parts = [
    { part: GUIDE_PARTS.howTo, sections: HOW_TO_SECTIONS },
    { part: GUIDE_PARTS.standard, sections: CLEANING_STANDARD_SECTIONS },
  ];

  return (
    <div className="flex w-full max-w-[660px] flex-col gap-10">
      <div>
        <h1 className="text-display">Labelling guide</h1>
        <p className="mt-[9px] text-[13px] text-[var(--ink-600)]">
          How the console works, and the standard a finished match meets.
          <span className="text-[var(--ink-400)]"> · </span>
          <span data-guide-version="" className="tabular-nums">
            {`Guide v${GUIDE_VERSION}`}
          </span>
        </p>
        <nav aria-label="On this page" className="mt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {parts.map(({ part }) => (
              <li key={part.id}>
                <a href={`#${part.id}`} className={linkClass}>
                  {part.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {parts.map(({ part, sections }) => (
        <Part key={part.id} part={part} sections={sections} />
      ))}
    </div>
  );
}
