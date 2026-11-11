"use client";

import { MoveVertical } from "lucide-react";

import {
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { formatDistanceValue } from "@/lib/format/distance";
import { depthPresets, type DepthScheme } from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";

import { useVizBands } from "./viz-bands-context";
import type { Cut } from "./viz-model";
import { bandKindFor } from "./cut-kinds";

/**
 * The bands rows of the lightbox's chart menu (`chart-menu.tsx`) — once the
 * fullscreen viewer's own bottom-slab menu (Phase 2B, Task 3; spec Appendix
 * P2l), moved into the chart menu when the lightbox replaced the viewer.
 *
 * It only exists on the three return cuts: `returnPlacement` reads DEPTH
 * bands (where the return landed, far half), `returnContact`/`rallyPosition`
 * read CONTACT bands (where it was struck, near half). Serve has no bands at
 * all, so the slab shows nothing there rather than a control that would do
 * nothing.
 *
 * ## Depth vs. contact
 *
 * Depth has four named presets. Contact does not — the plan's ruling: its
 * two dividers are a pair of positions relative to the baseline, and there
 * is no preset vocabulary for them worth inventing, so the only thing the
 * menu offers besides the editor is hiding the shading. That toggle is
 * SESSION-ONLY (`viz-bands-context.tsx`): it never writes, so unlike the
 * depth presets it stays live for a player who cannot edit the team's bands
 * — refusing to let someone turn off a wash would be a permission check on
 * their own eyes.
 *
 * ## Picking a preset
 *
 * `applyBands` is optimistic: the overlay and the `% · n` printed on it both
 * come from the same optimistic `BandSettings`, so they move together on the
 * frame of the click. The save follows; a refusal reverts it and says so in
 * the viewer's receipt slot. The other half of the record always rides along
 * unchanged — picking a depth preset must not silently rewrite where a
 * coach put their contact dividers.
 *
 * "Edit bands…" opens the drag editor (`viz-bands-editor.tsx`) through
 * `onEdit`. The row is disabled whenever the viewer cannot edit this
 * workspace's bands at all, or when no `onEdit` is passed — and is not
 * drawn at all on a read-only report (`useVizBands().readOnly`).
 */

const OWN_BANDS_NOTE =
  "Bands are yours — they change every return chart in this workspace, not this match.";
const READ_ONLY_NOTE = "Only coaches and staff can change this team's bands.";
const REPORT_READ_ONLY_NOTE =
  "These bands come with this report — they can't be changed here.";

/**
 * The contact trigger's mono slot — contact has no schemes, so it prints the
 * two positions the bands are actually cut at.
 *
 * A pair that sits entirely at or behind the baseline (the default `[0, 5]`,
 * and the common case) reads as a plain range with the unit once — "0 · 5
 * FT" — because "behind" is what the whole near-half axis already means
 * there. A pair that SPANS the line cannot: "-3 · 5 ft" would make a coach
 * work out which side of the baseline each number is on, so each divider
 * says so itself — "3 IN · 5 BEHIND". Zero is always "0": "at the line" is
 * the one position with no side.
 */
function contactDividersLabel(
  unit: DistanceUnit,
  [c0, c1]: [number, number],
): string {
  const n = (ft: number) => formatDistanceValue(unit, Math.abs(ft));
  if (c0 >= 0 && c1 >= 0) return `${n(c0)} · ${n(c1)} ${unit}`.toUpperCase();
  const side = (ft: number) =>
    ft === 0 ? "0" : ft < 0 ? `${n(ft)} in` : `${n(ft)} behind`;
  return `${side(c0)} · ${side(c1)}`.toUpperCase();
}

/**
 * The bands section: a label naming the band kind and its current setting,
 * the scheme rows (depth) or the session-only "No bands" toggle (contact),
 * "Edit bands…" and the note saying whose bands they are. Renders nothing on
 * a cut without bands. `close` shuts the menu it sits in.
 */
export function VizBandsMenuRows({
  cut,
  onEdit,
  close,
}: {
  cut: Cut;
  /** Opens the band editor. Without it the "Edit bands…" row is disabled. */
  onEdit?: () => void;
  close: () => void;
}) {
  const {
    bands,
    canEdit,
    readOnly,
    unit,
    contactHidden,
    toggleContactHidden,
    applyBands,
  } = useVizBands();

  const kind = bandKindFor(cut);
  if (kind === null) return null;

  const isDepth = kind === "depth";
  const label = isDepth ? "Depth bands" : "Contact bands";

  // Depth names its setting with the chosen check on a scheme row; contact
  // has no schemes, so its label carries the two dividers it is cut at.
  const heading = isDepth
    ? label
    : `${label} · ${contactDividersLabel(unit, bands.contactDividersFt).toLowerCase()}`;

  function pickScheme(scheme: DepthScheme) {
    close();
    applyBands({ ...bands, depthScheme: scheme });
  }

  function edit() {
    close();
    onEdit?.();
  }

  // A row with nothing behind it must not look live — one that highlights on
  // hover and then does nothing is worse than one that says it is
  // unavailable.
  const editDisabled = !canEdit || onEdit === undefined;

  return (
    <>
      <FloatMenuLabel>{heading}</FloatMenuLabel>

      {isDepth ? (
        <>
          <FloatMenuItem
            label="No bands"
            description="Just the landing points, no shading"
            chosen={bands.depthScheme === "none"}
            disabled={!canEdit}
            onSelect={() => pickScheme("none")}
          />
          {depthPresets(unit).map((preset) => (
            <FloatMenuItem
              key={preset.scheme}
              label={preset.label}
              description={preset.description}
              chosen={bands.depthScheme === preset.scheme}
              disabled={!canEdit}
              onSelect={() => pickScheme(preset.scheme)}
            />
          ))}
        </>
      ) : (
        // `menuitemradio`, deliberately: a check is what says whether the
        // shading is currently off. It is a SESSION toggle — it writes
        // nothing, which is also why it stays live for a player who cannot
        // edit the workspace's bands (see the file's own doc comment).
        <FloatMenuItem
          label="No bands"
          description="Just the contact points, no shading"
          chosen={contactHidden}
          onSelect={() => {
            close();
            toggleContactHidden();
          }}
        />
      )}

      {/* A read-only report (share page, sample match) draws no editor entry
          at all: a disabled row would promise an editor that exists for
          somebody else, and its note would name the wrong reason. */}
      {!readOnly && (
        <>
          <FloatMenuDivider />
          <FloatMenuItem
            label="Edit bands…"
            disabled={editDisabled}
            icon={
              <MoveVertical
                className="size-[13px] shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            }
            onSelect={edit}
          />
        </>
      )}

      <FloatMenuNote>
        {readOnly
          ? REPORT_READ_ONLY_NOTE
          : canEdit
            ? OWN_BANDS_NOTE
            : READ_ONLY_NOTE}
      </FloatMenuNote>
    </>
  );
}
