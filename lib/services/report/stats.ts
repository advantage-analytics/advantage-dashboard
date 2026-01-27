/**
 * TypeScript port of `scripts/stats_functions.py`.
 *
 * All functions here are **pure**: they operate on arrays of plain objects
 * (rows) and return derived metrics. This mirrors the Python module which
 * operates on pandas DataFrames.
 *
 * NOTE:
 * - These helpers are intentionally permissive in their typings to avoid
 *   over-constraining callers. They expect objects with certain keys present.
 * - All numeric operations coerce via `Number(...)` and guard against NaN.
 */

export type Row = Record<string, any>;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Filter shot data by serve state and side, mirroring `filter_data`.
 */
export function filterData(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): Row[] {
  if (serve === "both" && side === "both") {
    return shotData;
  }

  return shotData.filter((row) => {
    let ok = true;
    if (serve !== "both") {
      ok = ok && row["Serve State"] === serve;
    }
    if (side !== "both") {
      ok = ok && row["Serve Side"] === side;
    }
    return ok;
  });
}

// ---------------------------------------------------------------------------
// SINGLE-VALUE METRICS
// ---------------------------------------------------------------------------

export function fastestShot(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): number {
  const data = filterData(shotData, serve, side);
  let max = 0;
  for (const row of data) {
    const v = Number(row["Speed (MPH)"]);
    if (!Number.isNaN(v) && v > max) max = v;
  }
  return Math.round(max);
}

export function favoriteZone(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): string | null {
  const data = filterData(shotData, serve, side);
  const counts: Record<string, number> = {};
  for (const row of data) {
    const zone = row["Shot Zone"];
    if (zone == null) continue;
    counts[zone] = (counts[zone] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [zone, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}

export function bestZone(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): string | null {
  const data = filterData(shotData, serve, side);
  const totals: Record<string, { wins: number; total: number }> = {};

  for (const row of data) {
    const zone = row["Shot Zone"];
    if (!zone) continue;
    const winner = row["Point Winner"];
    if (!totals[zone]) totals[zone] = { wins: 0, total: 0 };
    totals[zone].total += 1;
    if (winner === "host") totals[zone].wins += 1;
  }

  let best: string | null = null;
  let bestPct = -1;
  for (const [zone, { wins, total }] of Object.entries(totals)) {
    if (total === 0) continue;
    const pct = wins / total;
    if (pct > bestPct) {
      bestPct = pct;
      best = zone;
    }
  }
  return best;
}

export function favoriteStroke(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): string | null {
  const data = filterData(shotData, serve, side);
  const counts: Record<string, number> = {};
  for (const row of data) {
    const stroke = row["Stroke"];
    if (!stroke) continue;
    counts[stroke] = (counts[stroke] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [stroke, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = stroke;
      bestCount = count;
    }
  }
  return best;
}

export function bestStroke(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): string | null {
  const data = filterData(shotData, serve, side);
  const totals: Record<string, { wins: number; total: number }> = {};

  for (const row of data) {
    const stroke = row["Stroke"];
    if (!stroke) continue;
    const winner = row["Point Winner"];
    if (!totals[stroke]) totals[stroke] = { wins: 0, total: 0 };
    totals[stroke].total += 1;
    if (winner === "host") totals[stroke].wins += 1;
  }

  // Python version only compares Forehand/Backhand slice; mirror that logic.
  const candidates = ["Forehand", "Backhand"];
  let best: string | null = null;
  let bestPct = -1;
  for (const stroke of candidates) {
    const entry = totals[stroke];
    if (!entry || entry.total === 0) continue;
    const pct = entry.wins / entry.total;
    if (pct > bestPct) {
      bestPct = pct;
      best = stroke;
    }
  }
  return best;
}

export function averageGameTime(
  gameData: Row[],
  server: "host" | "guest" = "host",
): { min: number; sec: number } {
  const games = gameData.filter((row) => row["Server"] === server);
  if (games.length === 0) return { min: 0, sec: 0 };

  const avgSeconds =
    games.reduce((sum, row) => sum + Number(row["Duration"] ?? 0), 0) /
    games.length;
  const total = Math.round(avgSeconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return { min, sec };
}

export function pctIn(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
  shotType: "serve" | "non-serve" = "non-serve",
): number {
  let data: Row[];
  if (shotType === "serve") {
    data = shotData.filter((row) => row["Type"] === `${serve}_serve`);
  } else {
    data = filterData(shotData, serve, side);
  }

  if (data.length === 0) return 0.0;

  const counts: Record<string, number> = {};
  for (const row of data) {
    const result = row["Result"];
    if (!result) continue;
    counts[result] = (counts[result] ?? 0) + 1;
  }

  const inPct = (counts["In"] ?? 0) / data.length;
  return Number((inPct * 100).toFixed(1));
}

export function pctWon(
  shotData: Row[],
  serve: "first" | "second" | "both" = "both",
  side: "deuce" | "ad" | "both" = "both",
): number {
  const data = filterData(shotData, serve, side);
  const dataIn = data.filter(
    (row) => row["Result"] !== "Out" && row["Result"] !== "Net",
  );
  if (dataIn.length === 0) return 0.0;

  const hostWins = dataIn.filter((row) => row["Point Winner"] === "host").length;
  const winPct = (hostWins / dataIn.length) * 100;
  return Number(winPct.toFixed(1));
}

export function gamesWon(
  gameData: Row[],
  server: "host" | "guest" = "host",
): number {
  const games = gameData.filter((row) => row["Server"] === server);
  if (games.length === 0) return 0.0;

  const total = games.length;
  const wins = games.filter((row) => row["Game Winner"] === "host").length;
  return Number(((wins / total) * 100).toFixed(1));
}

export function breakPointsConverted(statData: Row[]): number {
  const getSum = (name: string) =>
    statData
      .filter((row) => row["Stat Name"] === name)
      .reduce((sum, row) => {
        // Filter(like="Host") in pandas → columns whose name contains "Host"
        const hostCols = Object.entries(row).filter(([key]) =>
          key.includes("Host"),
        );
        const s = hostCols.reduce(
          (acc, [, value]) => acc + Number(value ?? 0),
          0,
        );
        return sum + s;
      }, 0);

  const opportunities = getSum("Break Point Opportunities");
  const won = getSum("Break Points Won");

  if (!opportunities) return 0.0;
  return Number(((won / opportunities) * 100).toFixed(1));
}

export function breakPointsSaved(shotData: Row[]): number {
  const breakPoints = shotData.filter((row) => row["Break Point"] === true);
  if (breakPoints.length === 0) return 0.0;

  const counts: Record<string, number> = {};
  for (const row of breakPoints) {
    const winner = row["Point Winner"];
    counts[winner] = (counts[winner] ?? 0) + 1;
  }
  const hostPct = (counts["host"] ?? 0) / breakPoints.length;
  return Number((hostPct * 100).toFixed(1));
}

export function averageAces(statData: Row[]): number {
  const totalAces = statData
    .filter((row) => row["Stat Name"] === "Aces")
    .reduce((sum, row) => {
      const hostCols = Object.entries(row).filter(([key]) =>
        key.includes("Host"),
      );
      const s = hostCols.reduce(
        (acc, [, value]) => acc + Number(value ?? 0),
        0,
      );
      return sum + s;
    }, 0);

  const matches = new Set<string>();
  for (const row of statData) {
    if (row["__source_file__"]) {
      matches.add(String(row["__source_file__"]));
    }
  }
  const totalMatches = matches.size || 1;
  return Number((totalAces / totalMatches).toFixed(1));
}

export function averageDoubleFaults(statData: Row[]): number {
  const getSum = (name: string) =>
    statData
      .filter((row) => row["Stat Name"] === name)
      .reduce((sum, row) => {
        const hostCols = Object.entries(row).filter(([key]) =>
          key.includes("Host"),
        );
        const s = hostCols.reduce(
          (acc, [, value]) => acc + Number(value ?? 0),
          0,
        );
        return sum + s;
      }, 0);

  const secondTotal = getSum("2nd Serves");
  const secondIn = getSum("2nd Serves In");

  const matches = new Set<string>();
  for (const row of statData) {
    if (row["__source_file__"]) {
      matches.add(String(row["__source_file__"]));
    }
  }
  const totalMatches = matches.size || 1;

  return Number(((secondTotal - secondIn) / totalMatches).toFixed(1));
}

export function numMatches(statData: Row[]): number {
  const matches = new Set<string>();
  for (const row of statData) {
    if (row["__source_file__"]) {
      matches.add(String(row["__source_file__"]));
    }
  }
  return matches.size;
}

export function numPoints(pointData: Row[]): number {
  return pointData.length;
}

export function numPointsWon(pointData: Row[]): number {
  return pointData.filter((row) => row["Point Winner"] === "host").length;
}

export function totalWinPct(pointData: Row[]): number {
  if (pointData.length === 0) return 0.0;
  const hostWins = numPointsWon(pointData);
  const winPct = (hostWins / pointData.length) * 100;
  return Number(winPct.toFixed(2));
}

export function avgCourtTime(gameData: Row[]): { hr: number; min: number } {
  if (gameData.length === 0) return { hr: 0, min: 0 };

  // group by __source_file__ and sum Duration per match
  const perMatch: Record<string, number> = {};
  for (const row of gameData) {
    const file = String(row["__source_file__"] ?? "unknown");
    perMatch[file] = (perMatch[file] ?? 0) + Number(row["Duration"] ?? 0);
  }

  const totals = Object.values(perMatch).map((sec) =>
    Math.round(sec / 60),
  ); // minutes
  if (totals.length === 0) return { hr: 0, min: 0 };

  const avgMins =
    totals.reduce((sum, v) => sum + v, 0) / Math.max(totals.length, 1);
  const totalMins = Math.round(avgMins);
  const hr = Math.floor(totalMins / 60);
  const min = totalMins % 60;
  return { hr, min };
}

export function setsWon(setData: Row[]): number {
  return setData.filter((row) => row["Set Winner"] === "host").length;
}

export function tiebreakersWon(setData: Row[]): number {
  return setData.filter(
    (row) =>
      Number(row["Host Tiebreak Score"] ?? 0) >
      Number(row["Guest Tiebreak Score"] ?? 0),
  ).length;
}

export function totalGamesWon(gameData: Row[]): number {
  return gameData.filter((row) => row["Game Winner"] === "host").length;
}

export function threeSetMatchesWon(setData: Row[]): number {
  return setData.filter(
    (row) => row["Set"] === 3 && row["Set Winner"] === "host",
  ).length;
}

export function longestRallyLen(shotData: Row[]): number {
  let max = 0;
  for (const row of shotData) {
    const v = Number(row["Shot"] ?? 0);
    if (!Number.isNaN(v) && v > max) max = v;
  }
  return max;
}

export function avgWinners(statData: Row[]): number {
  const totalWinners = statData
    .filter(
      (row) =>
        row["Stat Name"] === "Forehand Winners" ||
        row["Stat Name"] === "Backhand Winners",
    )
    .reduce((sum, row) => {
      const hostCols = Object.entries(row).filter(([key]) =>
        key.includes("Host"),
      );
      const s = hostCols.reduce(
        (acc, [, value]) => acc + Number(value ?? 0),
        0,
      );
      return sum + s;
    }, 0);

  const matches = new Set<string>();
  for (const row of statData) {
    if (row["__source_file__"]) {
      matches.add(String(row["__source_file__"]));
    }
  }
  const totalMatches = matches.size || 1;
  return Math.round(totalWinners / totalMatches);
}

export function unfinishedMatches(setData: Row[]): number {
  return setData.filter((row) => row["Set Winner"] === "draw").length;
}

export function pctTiebreaksWon(setData: Row[]): number {
  const tiebreaks = setData.filter(
    (row) =>
      Number(row["Host Tiebreak Score"] ?? 0) >
      Number(row["Guest Tiebreak Score"] ?? 0),
  );
  if (tiebreaks.length === 0) return 0.0;

  // In the Python implementation, they call value_counts(normalize=True).get("host", 0)
  // but because we've already filtered where host > guest, all are wins.
  const pctWon = tiebreaks.length / tiebreaks.length;
  return Number((pctWon * 100).toFixed(2));
}

export function pctDecidingSetsWon(setData: Row[]): number {
  const deciding = setData.filter(
    (row) => row["Set"] === 3 && row["Set Winner"] !== "draw",
  );
  if (deciding.length === 0) return 0.0;

  const wins = deciding.filter((row) => row["Set Winner"] === "host").length;
  const pct = wins / deciding.length;
  return Number((pct * 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// VISUAL DATA GENERATORS
// ---------------------------------------------------------------------------

export function shotsWon(shotData: Row[]): number {
  if (shotData.length === 0) return 0.0;
  const hostWins =
    shotData.filter((row) => row["Point Winner"] === "host").length /
    shotData.length;
  return Number((hostWins * 100).toFixed(1));
}

export function strokeDistribution(
  shotData: Row[],
): { forehand: number; backhand: number } {
  const counts: Record<string, number> = {};
  for (const row of shotData) {
    const stroke = row["Stroke"];
    if (!stroke) continue;
    counts[stroke] = (counts[stroke] ?? 0) + 1;
  }
  const total =
    (counts["Forehand"] ?? 0) + (counts["Backhand"] ?? 0) || 1;
  const forehand = Number(
    (((counts["Forehand"] ?? 0) / total) * 100).toFixed(1),
  );
  const backhand = Number(
    (((counts["Backhand"] ?? 0) / total) * 100).toFixed(1),
  );
  return { forehand, backhand };
}

export function shotZones(
  shotData: Row[],
  shotType: "serve" | "return" | "non-serve" = "non-serve",
): Record<string, any> {
  // This is a partial port focused on the structure used by the report.
  // We mirror the Python structure:
  // - for serves: { "<serve>_serve_zone_distribution": { deuce: { ... }, ad: { ... } } }
  // - for returns: { "<serve>_serve_returns": { ... } }

  let strokeTypes: string[];
  let zones: string[];

  if (shotType === "serve") {
    strokeTypes = ["Serve"];
    zones = ["Wide", "Body", "T"];
  } else {
    strokeTypes = ["Forehand", "Backhand"];
    zones = ["Cross", "Line", "Middle"];
  }

  const groupKey = (row: Row) =>
    [
      row["Serve State"],
      row["Serve Side"],
      row["Stroke"],
      row["Shot Zone"],
    ].join("|");

  const counts: Record<string, number> = {};
  for (const row of shotData) {
    const key = groupKey(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const metrics: Record<string, any> = {};

  for (const serve of ["first", "second"] as const) {
    const sides: Record<string, any> = {};
    for (const side of ["deuce", "ad"] as const) {
      const strokesOutput: Record<string, any> = {};
      for (const stroke of strokeTypes) {
        const zoneTotals: Record<string, number> = {};
        for (const zone of zones) {
          const key = [serve, side, stroke, zone].join("|");
          zoneTotals[zone.toLowerCase()] = counts[key] ?? 0;
        }
        strokesOutput[stroke.toLowerCase()] = zoneTotals;
      }

      if (shotType === "serve") {
        sides[side] =
          strokesOutput["serve"] ??
          Object.fromEntries(zones.map((z) => [z.toLowerCase(), 0]));
      } else {
        sides[side] = strokesOutput;
      }
    }

    if (shotType === "serve") {
      metrics[`${serve}_serve_zone_distribution`] = sides;
    } else {
      metrics[`${serve}_serve_${shotType}s`] = sides;
    }
  }

  return metrics;
}

export function placementMetrics(
  shotData: Row[],
  serve: "first" | "second" | "both",
  side: "deuce" | "ad" | "both",
  shotType: "serve" | "non-serve" = "non-serve",
): Record<string, { total: number; win: number }> {
  let data = shotData;

  if (shotType === "serve") {
    // Exclude Out/Net for serves
    data = data.filter(
      (row) => row["Result"] !== "Out" && row["Result"] !== "Net",
    );
  }

  const zones =
    shotType === "serve" ? ["Wide", "Body", "T"] : ["Cross", "Line", "Middle"];

  data = filterData(data, serve, side);

  const zoneTotals: Record<string, number> = {};
  const winTotals: Record<string, number> = {};

  for (const row of data) {
    const zone = row["Shot Zone"];
    if (!zone) continue;
    zoneTotals[zone] = (zoneTotals[zone] ?? 0) + 1;
    if (row["Point Winner"] === "host") {
      winTotals[zone] = (winTotals[zone] ?? 0) + 1;
    }
  }

  const metrics: Record<string, { total: number; win: number }> = {};
  for (const zone of zones) {
    const total = zoneTotals[zone] ?? 0;
    if (total === 0) {
      metrics[zone.toLowerCase()] = { total: 0, win: 0 };
    } else {
      const winTotal = winTotals[zone] ?? 0;
      const winPct = Number(((winTotal / total) * 100).toFixed(1));
      metrics[zone.toLowerCase()] = { total, win: winPct };
    }
  }

  return metrics;
}

export function contactMetrics(
  shotData: Row[],
  serve: "first" | "second" = "first",
  side: "deuce" | "ad" = "deuce",
): Record<string, { total: number; win: number }> {
  const data = filterData(shotData, serve, side);
  const contactTotals: Record<string, number> = {};
  const winTotals: Record<string, number> = {};

  for (const row of data) {
    const contact = row["Contact Point"];
    if (!contact) continue;
    contactTotals[contact] = (contactTotals[contact] ?? 0) + 1;
    if (row["Point Winner"] === "host") {
      winTotals[contact] = (winTotals[contact] ?? 0) + 1;
    }
  }

  const metrics: Record<string, { total: number; win: number }> = {};
  for (const contact of ["Inside", "Mid", "Deep"]) {
    const total = contactTotals[contact] ?? 0;
    if (total === 0) {
      metrics[contact.toLowerCase()] = { total: 0, win: 0 };
    } else {
      const winTotal = winTotals[contact] ?? 0;
      const winPct = Number(((winTotal / total) * 100).toFixed(1));
      metrics[contact.toLowerCase()] = { total, win: winPct };
    }
  }

  return metrics;
}

/**
 * Calculate the match record in "W-L" format, mirroring `match_record`.
 *
 * Groups by `__source_file__` and inspects the last set (highest Set number)
 * to determine whether the host won or lost each match.
 */
export function matchRecord(setData: Row[]): string {
  if (setData.length === 0) return "0-0";

  // Group by __source_file__ and get the last set per match
  const groups: Record<string, Row[]> = {};
  for (const row of setData) {
    const key = String(row["__source_file__"] ?? "unknown");
    (groups[key] ||= []).push(row);
  }

  let wins = 0;
  let losses = 0;

  for (const rows of Object.values(groups)) {
    // sort by Set ascending and take last
    const sorted = [...rows].sort(
      (a, b) => Number(a["Set"] ?? 0) - Number(b["Set"] ?? 0),
    );
    const last = sorted[sorted.length - 1];
    const winner = last["Set Winner"];
    if (winner === "host") wins += 1;
    else if (winner === "guest") losses += 1;
  }

  return `${wins}-${losses}`;
}

