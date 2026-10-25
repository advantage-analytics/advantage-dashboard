import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  labelScores,
  type LabelGameOutcome,
} from "@/lib/services/labels/score";
import type { LabelPoint } from "@/lib/services/labels/session";
import { inner, tag, text } from "./fixtures/html-probe";
import { labelSessionFixture, noop } from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

// The game band's end: how the game ended, given its `outcome`.

const BAND = "src/components/admin/labels/label-game-band.tsx";
const NAMES = { p1: "Lee", p2: "Vargas" };

type BandProps = {
  band: unknown;
  points: readonly LabelPoint[];
  names: typeof NAMES;
  outcome?: LabelGameOutcome;
  onSetGameType?: () => void;
  onSetGameServer?: () => void;
};

function renderBand(outcome: LabelGameOutcome | undefined, editable: boolean) {
  const session = labelSessionFixture();
  const { LabelGameBand } = createLoader().load(BAND) as {
    LabelGameBand: React.ComponentType<BandProps>;
  };
  const [band] = labelScores(session.points, session.adScoring).games;
  return renderToStaticMarkup(
    React.createElement(LabelGameBand, {
      band,
      points: session.points,
      names: NAMES,
      outcome,
      ...(editable ? { onSetGameType: noop, onSetGameServer: noop } : {}),
    }),
  );
}

test.describe("the band's outcome", () => {
  test("the winner and the score, Unfinished and the call in amber, or the extra rows — after the server, with menus and without", () => {
    for (const editable of [true, false]) {
      const won = renderBand(
        { kind: "decided", winner: "p2", score: "4–2" },
        editable,
      );
      expect(text(won)).toBe("Set 1 · Game 1 0–0 · Lee serves · Vargas · 4–2");
      expect(tag(won, 'data-game-outcome="decided"')).not.toContain(
        "rail-amber",
      );

      const short = renderBand(
        { kind: "unfinished", score: "30–40" },
        editable,
      );
      expect(text(short)).toBe(
        "Set 1 · Game 1 0–0 · Lee serves · Unfinished · 30–40",
      );
      expect(tag(short, 'data-game-outcome="unfinished"')).toContain(
        "text-[var(--rail-amber)]",
      );

      const over = renderBand(
        { kind: "overflow", winner: "p1", score: "4–1", extra: 2 },
        editable,
      );
      expect(text(over)).toBe(
        "Set 1 · Game 1 0–0 · Lee serves · Lee · 4–1 · 2 extra",
      );
    }
  });

  test("the tail's gap from the server is its own margin in both branches, never a leading space the flex row would drop", () => {
    for (const editable of [true, false]) {
      const html = renderBand(
        { kind: "decided", winner: "p2", score: "4–2" },
        editable,
      );
      const outcome = tag(html, 'data-game-outcome="decided"');
      expect(outcome).toContain("ml-1");
      // The tail's words start at the dot: no space inside the span.
      expect(inner(html, 'data-game-outcome="decided"')).toBe("· Vargas · 4–2");
    }
  });

  test("without an outcome the band ends at the server, as before; it carries the game's key either way", () => {
    const html = renderBand(undefined, true);
    expect(text(html)).toBe("Set 1 · Game 1 0–0 · Lee serves");
    expect(html).not.toContain("data-game-outcome");
    expect(tag(html, 'data-game-band="1-1"')).toContain('data-game-key="1·1"');
  });

  test("gameBandOutcome, as data", () => {
    const { gameBandOutcome } = createLoader().load(BAND) as {
      gameBandOutcome: (
        outcome: LabelGameOutcome,
        names: typeof NAMES,
      ) => { text: string; amber: boolean };
    };
    expect(
      gameBandOutcome({ kind: "decided", winner: "p1", score: "5–3" }, NAMES),
    ).toEqual({ text: "Lee · 5–3", amber: false });
    expect(
      gameBandOutcome({ kind: "unfinished", score: "40–Ad" }, NAMES),
    ).toEqual({ text: "Unfinished · 40–Ad", amber: true });
    expect(
      gameBandOutcome(
        { kind: "overflow", winner: "p2", score: "4–0", extra: 1 },
        NAMES,
      ),
    ).toEqual({ text: "Vargas · 4–0 · 1 extra", amber: false });
  });
});

test.describe("the band's lock", () => {
  function renderLocked(locked: boolean, editable: boolean) {
    const session = labelSessionFixture();
    const points = session.points.map((p, i) =>
      i === 0 ? { ...p, gameStartLocked: locked } : p,
    );
    const { LabelGameBand } = createLoader().load(BAND) as {
      LabelGameBand: React.ComponentType<BandProps>;
    };
    const [band] = labelScores(points, session.adScoring).games;
    return renderToStaticMarkup(
      React.createElement(LabelGameBand, {
        band,
        points,
        names: NAMES,
        ...(editable ? { onSetGameType: noop, onSetGameServer: noop } : {}),
      }),
    );
  }

  test("a locked game's band draws a lock and set by you after its name, in the label's ink; an unlocked band neither", () => {
    for (const editable of [true, false]) {
      const html = renderLocked(true, editable);
      const mark = tag(html, "data-game-locked=");
      expect(mark).toContain("text-white/45");
      expect(mark).toContain("uppercase");
      const at = html.indexOf("data-game-locked=");
      const markup = html.slice(at, html.indexOf("</span>", at));
      expect(markup).toContain("lucide-lock");
      expect(markup).toContain('aria-hidden="true"');
      expect(text(html)).toBe("Set 1 · Game 1 set by you 0–0 · Lee serves");

      const open = renderLocked(false, editable);
      expect(open).not.toContain("data-game-locked");
      expect(open).not.toContain("lucide-lock");
      expect(text(open)).not.toContain("set by you");
    }
  });

  test("the lock is read off the game's first live row only", () => {
    const { gameBandModel } = createLoader().load(BAND) as {
      gameBandModel: (
        band: unknown,
        points: LabelPoint[],
      ) => { locked: boolean };
    };
    const session = labelSessionFixture();
    const [band] = labelScores(session.points, session.adScoring).games;
    expect(gameBandModel(band, session.points).locked).toBe(false);
    const later = session.points.map((p, i) =>
      i === 1 ? { ...p, gameStartLocked: true } : p,
    );
    expect(gameBandModel(band, later).locked).toBe(false);
  });
});
