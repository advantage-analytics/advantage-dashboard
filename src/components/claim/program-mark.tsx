import { WorkspaceMark } from "@/components/dashboard/workspace-mark";

/**
 * The program's mark: its crest when it has uploaded one, its initial on ink
 * otherwise — the square the sidebar draws for a team workspace, so a program
 * looks the same before it is joined as after.
 *
 * `page` sits above a claim or join heading, one column gap clear of it;
 * `row` leads a row of the program search. Its own module rather than part of
 * `claim-shell.tsx`, because the search is a client component and that file
 * carries every claim screen's chrome.
 */
export function ProgramMark({
  name,
  crestUrl,
  size = "page",
}: {
  name: string;
  crestUrl?: string | null;
  size?: "page" | "row";
}) {
  return (
    <WorkspaceMark
      workspace={{
        kind: "team",
        mark: name.trim().charAt(0).toUpperCase(),
        iconUrl: crestUrl ?? null,
      }}
      // `object-contain`, not the workspace square's `object-cover`: crests
      // are often wordmarks, and a wide one cropped to a square loses letters.
      className={`${
        size === "page" ? "size-8 text-[12px]" : "size-5 text-[9px]"
      } rounded-[var(--radius-button)] object-contain`}
    />
  );
}
