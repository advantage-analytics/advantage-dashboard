import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import type { SwingVisionParser as Parser } from "@/lib/services/upload/parsers/swingvision-parser";
import { createLoader } from "./fixtures/vm-modules";

// Loaded through the vm loader rather than a plain import: the parser's
// `await import("exceljs")` runs as native Node ESM under Playwright, where
// exceljs (CommonJS) exposes only `default`, so `exceljs.Workbook` is
// undefined. The loader transpiles to CommonJS with esModuleInterop, which
// resolves the named export the way the Next bundler does.
const { SwingVisionParser } = createLoader().load(
  "src/lib/services/upload/parsers/swingvision-parser.ts",
) as { SwingVisionParser: new () => Parser };

/**
 * The host is always player1. When SwingVision leaves the Guest Team cell
 * blank, the parser recovers the opponent's name from a Settings metadata row
 * (`guestTeamFromFallback`) — but it must not swap the names: the wizard saves
 * `playerName` as `player1_name`, and process-match keys `is_player1` on the
 * Settings "Host Team" cell, so a swap would put one name on the other
 * player's statistics.
 */

const HOST = "Riley Host";
const GUEST = "Casey Guest";

async function exportFile(guestTeamCell: string | null) {
  const workbook = new ExcelJS.Workbook();
  const settings = workbook.addWorksheet("Settings");
  settings.addRow([
    "Start Time",
    "End Time",
    "Host Team",
    "Guest Team",
    "Ad Scoring",
  ]);
  settings.addRow([
    "2026-09-10T10:00:00",
    "2026-09-10T11:30:00",
    HOST,
    guestTeamCell,
    true,
  ]);
  // Metadata block below the header pair. The fallback scans rows[5..9][0]
  // for the first name-like value that is not the host.
  settings.addRow(["ab"]);
  settings.addRow([HOST]);
  settings.addRow(["Serve Speed"]);
  settings.addRow([GUEST]);
  settings.addRow(["Forehand Speed"]);

  const sets = workbook.addWorksheet("Sets");
  sets.addRow([
    "Set",
    "Host Score",
    "Guest Score",
    "Host Tiebreak",
    "Guest Tiebreak",
    "Set Winner",
    "Duration",
  ]);
  sets.addRow([1, 6, 4, null, null, "host", "0:40"]);
  sets.addRow([2, 7, 6, 7, 5, "host", "0:50"]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return new File([buffer], "swingvision-export.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const expected = {
  playerName: HOST,
  opponentName: GUEST,
  playerScores: [6, 7],
  opponentScores: [4, 6],
  playerTiebreaks: [null, 7],
  opponentTiebreaks: [null, 5],
  result: `${HOST} Wins`,
};

test.describe("SwingVision parser: host is player1", () => {
  test("a blank Guest Team takes the metadata fallback without swapping names", async () => {
    const result = await new SwingVisionParser().parse(await exportFile(null));
    expect(result.success).toBe(true);
    // The fallback was taken: the opponent's name came from the metadata row.
    expect(result.data?.opponentName).toBe(GUEST);
    expect(result.data).toMatchObject(expected);
  });

  test("a filled Guest Team produces identical output", async () => {
    const fallback = await new SwingVisionParser().parse(
      await exportFile(null),
    );
    const filled = await new SwingVisionParser().parse(await exportFile(GUEST));
    expect(filled.success).toBe(true);
    expect(filled.data).toMatchObject(expected);
    expect(filled.data).toEqual(fallback.data);
  });
});
