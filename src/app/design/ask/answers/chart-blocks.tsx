import type { ReactNode } from "react";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { cn } from "@/lib/utils";

/**
 * The chart blocks an Ask answer could carry — sketches for a decision, drawn
 * to be moved into `components/dashboard/ask/visuals/` once chosen.
 *
 * Every block takes plain numbers: the values would be cells of the query
 * result, resolved by the server, never text a model typed. Each is a
 * `<figure>` whose caption says what is drawn and from how much, and each
 * keeps a text reading of its numbers, so the picture is never the only way
 * to the figure.
 *
 * Colour is role, not decoration (`--viz-*`): blue steps are the player,
 * slate steps are whatever they are being compared with. Green and red stay
 * with outcomes — only the form strip uses them.
 */

function Block({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      {children}
      <figcaption className="text-micro">{caption}</figcaption>
    </figure>
  );
}

function Key({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]"
        >
          <span
            aria-hidden="true"
            className="h-[3px] w-3 rounded-[1px]"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const pct = (value: number) => `${Number(value.toFixed(1))}%`;

// ── Comparison bars ─────────────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  /** 0–100. */
  you: number;
  /** 0–100. */
  base: number;
}

/** One measure per row, the player's bar over the baseline's. */
export function ComparisonBars({
  rows,
  youLabel,
  baseLabel,
  caption,
}: {
  rows: ComparisonRow[];
  youLabel: string;
  baseLabel: string;
  caption: string;
}) {
  return (
    <Block caption={caption}>
      <Key
        items={[
          { label: youLabel, color: "var(--viz-you)" },
          { label: baseLabel, color: "var(--viz-opp-light)" },
        ]}
      />
      <ul className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-center gap-x-4"
          >
            <span className="text-[12px] text-[var(--ink-700)]">
              {row.label}
            </span>
            <span className="flex flex-col gap-1">
              <Bar value={row.you} color="var(--viz-you)" strong />
              <Bar value={row.base} color="var(--viz-opp-light)" />
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Bar({
  value,
  color,
  strong = false,
}: {
  value: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-1.5 flex-1 rounded-[1px] bg-[var(--ink-100)]">
        <span
          className="block h-full rounded-[1px]"
          style={{
            width: `${Math.min(Math.max(value, 0), 100)}%`,
            background: color,
          }}
        />
      </span>
      <span
        className={cn(
          "w-11 text-right text-[12px] tabular-nums",
          strong ? "text-[var(--ink-900)]" : "text-[var(--ink-500)]",
        )}
      >
        {pct(value)}
      </span>
    </span>
  );
}

// ── Split bar ───────────────────────────────────────────────────────────────

export interface SplitSegment {
  label: string;
  value: number;
}

const SPLIT_STEPS = [
  "var(--viz-you)",
  "var(--viz-you-mid)",
  "var(--viz-you-light)",
  "var(--viz-opp-light)",
];

/** One whole, in parts: counts that sum to a total. */
export function SplitBar({
  segments,
  caption,
}: {
  segments: SplitSegment[];
  caption: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <Block caption={caption}>
      <span aria-hidden="true" className="flex h-3.5 gap-0.5">
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className="h-full rounded-[var(--radius-cell)]"
            style={{
              flexGrow: segment.value,
              flexBasis: 0,
              background: SPLIT_STEPS[index % SPLIT_STEPS.length],
            }}
          />
        ))}
      </span>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                style={{ background: SPLIT_STEPS[index % SPLIT_STEPS.length] }}
              />
              {segment.label}
            </span>
            <span className="text-[13px] text-[var(--ink-900)] tabular-nums">
              {segment.value}
              <span className="pl-1.5 text-[11px] text-[var(--ink-500)]">
                {total > 0 ? pct((segment.value / total) * 100) : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

// ── Trend line ──────────────────────────────────────────────────────────────

export interface TrendPoint {
  /** Short label under the axis: a date. */
  label: string;
  value: number;
}

const TREND_W = 640;
const TREND_H = 132;
const TREND_PAD = { top: 14, right: 8, bottom: 22, left: 8 };

/** One value across matches in date order, with the player's average as a
 *  dashed rule so a point reads as above or below their own level. */
export function TrendLine({
  points,
  caption,
  averageLabel,
}: {
  points: TrendPoint[];
  caption: string;
  averageLabel: string;
}) {
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const innerW = TREND_W - TREND_PAD.left - TREND_PAD.right;
  const innerH = TREND_H - TREND_PAD.top - TREND_PAD.bottom;
  const x = (index: number) =>
    TREND_PAD.left +
    (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) =>
    TREND_PAD.top + innerH - ((value - low) / span) * innerH;
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`,
    )
    .join(" ");
  const last = points.length - 1;

  return (
    <Block caption={caption}>
      <Key
        items={[
          { label: "Each match", color: "var(--viz-you)" },
          { label: averageLabel, color: "var(--viz-opp-mid)" },
        ]}
      />
      <svg
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        role="img"
        aria-label={`${points.length} matches, from ${pct(points[0].value)} on ${points[0].label} to ${pct(points[last].value)} on ${points[last].label}; average ${pct(average)}`}
        className="w-full"
      >
        <line
          x1={TREND_PAD.left}
          x2={TREND_W - TREND_PAD.right}
          y1={y(average)}
          y2={y(average)}
          stroke="var(--viz-opp-mid)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--viz-you)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <circle
            key={point.label}
            cx={x(index)}
            cy={y(point.value)}
            r={index === last ? 3.5 : 2.5}
            fill={index === last ? "var(--viz-you)" : "var(--surface-card)"}
            stroke="var(--viz-you)"
            strokeWidth={1.5}
          />
        ))}
        <text
          x={x(0)}
          y={TREND_H - 6}
          textAnchor="start"
          fontSize={10}
          fill="var(--ink-500)"
        >
          {points[0].label}
        </text>
        <text
          x={x(last)}
          y={TREND_H - 6}
          textAnchor="end"
          fontSize={10}
          fill="var(--ink-500)"
        >
          {points[last].label}
        </text>
        <text
          x={x(last) - 10}
          y={y(points[last].value) + 4}
          textAnchor="end"
          fontSize={11}
          fill="var(--ink-900)"
        >
          {pct(points[last].value)}
        </text>
      </svg>
    </Block>
  );
}

// ── Stat table ──────────────────────────────────────────────────────────────

/** Rows of measures against two or three columns. The first value column is
 *  the subject of the question and reads in full ink. */
export function StatTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: { label: string; values: string[] }[];
  caption: string;
}) {
  return (
    <Block caption={caption}>
      <table className="w-full max-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-hairline)]">
            <th className="pb-2 font-normal">
              <span className="sr-only">Measure</span>
            </th>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="eyebrow-sm w-[104px] pb-2 text-right font-normal"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="h-8 text-[12px] font-normal text-[var(--ink-700)]"
              >
                {row.label}
              </th>
              {row.values.map((value, index) => (
                <td
                  key={columns[index]}
                  className={cn(
                    "h-8 text-right text-[13px] tabular-nums",
                    index === 0
                      ? "text-[var(--ink-900)]"
                      : "text-[var(--ink-500)]",
                  )}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  );
}

// ── Serve placement ─────────────────────────────────────────────────────────

export interface ServeCourt {
  name: string;
  t: number;
  body: number;
  wide: number;
}

const ZONES = [
  { key: "t", label: "T", color: "var(--viz-you)" },
  { key: "body", label: "Body", color: "var(--viz-you-mid)" },
  { key: "wide", label: "Wide", color: "var(--viz-you-light)" },
] as const;

/** Where serves went, one bar per court — the Home card's recipe: 14px bars,
 *  2px gaps, T · Body · Wide in the three blue steps. */
export function ServePlacement({
  courts,
  caption,
}: {
  courts: ServeCourt[];
  caption: string;
}) {
  return (
    <Block caption={caption}>
      <Key
        items={ZONES.map((zone) => ({ label: zone.label, color: zone.color }))}
      />
      <ul className="flex max-w-[520px] flex-col gap-3">
        {courts.map((court) => {
          const total = court.t + court.body + court.wide;
          return (
            <li key={court.name} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between text-[12px]">
                <span className="text-[var(--ink-700)]">{court.name}</span>
                <span className="text-[11px] text-[var(--ink-500)] tabular-nums">
                  {total} serves
                </span>
              </span>
              <span className="flex h-3.5 gap-0.5">
                {ZONES.map((zone) => (
                  <span
                    key={zone.key}
                    className="flex h-full items-center justify-center rounded-[var(--radius-cell)]"
                    style={{
                      flexGrow: court[zone.key],
                      flexBasis: 0,
                      background: zone.color,
                    }}
                  />
                ))}
              </span>
              <span className="flex gap-4 text-[11px] text-[var(--ink-500)] tabular-nums">
                {ZONES.map((zone) => (
                  <span key={zone.key}>
                    {zone.label}{" "}
                    <span className="text-[var(--ink-900)]">
                      {total > 0 ? pct((court[zone.key] / total) * 100) : "—"}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

// ── Form strip ──────────────────────────────────────────────────────────────

/** A record as its matches, oldest left. The one block that uses the outcome
 *  colours, because an outcome is what it draws. */
export function FormStrip({
  form,
  caption,
}: {
  form: ("win" | "loss")[];
  caption: string;
}) {
  const wins = form.filter((result) => result === "win").length;
  return (
    <Block caption={caption}>
      <div className="flex items-center gap-4">
        <p className="text-scoreboard">
          {wins}
          <span className="px-1 text-[var(--ink-400)]">–</span>
          {form.length - wins}
        </p>
        <FormTicks form={form} slots={form.length} />
      </div>
    </Block>
  );
}
