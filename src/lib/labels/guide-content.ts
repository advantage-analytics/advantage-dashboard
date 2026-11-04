/**
 * The labeller's guide at `/label/guide`: how the console works, then the
 * standard a cleaned match is held to. Written for an outside vendor who has
 * never seen the tool, so it describes only what the console really does, in
 * the words its own buttons use. Never mentions a page a labeller cannot open.
 *
 * Plain data: `LabelGuide` (src/components/label/label-guide.tsx) renders it,
 * and the offline spec reads it. The Keys subsection carries no keys of its
 * own: its `shortcuts` block is drawn from `LABEL_SHORTCUT_GROUPS`, the one
 * list the console's shortcut sheet reads, so the two never drift.
 *
 * Bump `GUIDE_VERSION` (the day of the change) whenever the words change, so a
 * labeller can tell the guide they read from the one in front of them.
 */

export const GUIDE_VERSION = "2026-11-03";

export type GuideBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: readonly string[] }
  /** Every group in `LABEL_SHORTCUT_GROUPS`, as the shortcut sheet lists them. */
  | { kind: "shortcuts" };

export interface GuideSection {
  /** The in-page anchor. */
  id: string;
  heading: string;
  blocks: readonly GuideBlock[];
}

/** The two halves of the page, in order, each its own `<section id>`. */
export const GUIDE_PARTS = {
  howTo: { id: "how-to", heading: "How to use the console" },
  standard: { id: "cleaning-standard", heading: "Cleaning standard" },
} as const;

const p = (text: string): GuideBlock => ({ kind: "paragraph", text });
const list = (...items: string[]): GuideBlock => ({ kind: "list", items });

export const HOW_TO_SECTIONS: readonly GuideSection[] = [
  {
    id: "video-controls",
    heading: "Video controls",
    blocks: [
      p(
        "Open a match from your list, then press Open labelling. The video sits beside the rail of points. The full screen button at the top of the rail gives both the whole screen.",
      ),
      list(
        "Play or pause with the play button or the space bar.",
        "Previous and Next move one point at a time. ← and → do the same.",
        "The speed control slows the video down or speeds it up.",
        "Loop (L) replays the current point until you turn it off.",
        "Skip dead time (D) jumps over the time between points.",
        "Mute (M) turns the sound off and on.",
      ),
      p("To leave full screen, use the exit button at the top of the rail."),
    ],
  },
  {
    id: "the-rail",
    heading: "The rail",
    blocks: [
      p(
        "The rail lists every point of the match in order, grouped by game. Each game starts with a band that names the set and game, the games score before it, and who serves.",
      ),
      p(
        "Click a point to open it and play it. Its shots are listed under it. ↑ and ↓ move between shots, and Enter opens the point the video is playing. Select a shot to change it with the shot keys.",
      ),
      p(
        "When a point is right, mark it checked with ⌘ Enter. The page title counts how many points are checked.",
      ),
      p("Above the points, the rail keeps two flag lists:"),
      list(
        "Amber flags are things that can change the score. ] goes to the next amber stop and [ to the previous one. Amber stops also include the slots drawn between rows, such as a game that is already won or not finished, and a set whose score does not add up.",
        "Grey flags are wrong data that rarely changes the score. ' goes to the next one and ; to the previous one. A grey flag goes when its point is checked.",
      ),
      p(
        "When no amber flag is left, the rail asks about errors: each missed last shot can be marked forced (E) or unforced (U). With no amber flag open, ] and [ walk through the errors still to mark.",
      ),
    ],
  },
  {
    id: "keys",
    heading: "Keys",
    blocks: [
      p(
        "Every key the console reads. In the console, ⌘ / or ? shows the same list. Shot keys act on the selected shot. On Windows and Linux, use Ctrl instead of ⌘.",
      ),
      { kind: "shortcuts" },
    ],
  },
  {
    id: "combine-and-split",
    heading: "Combine and split points",
    blocks: [
      p(
        "The video analysis sometimes runs two points into one row, or cuts one point into two rows.",
      ),
      list(
        "Two points in one row: select the first shot of the second point and choose Split point here. That shot and every shot after it become a new point below.",
        "One point across two rows: open the point menu (the … button on the row) and choose Combine with point above or Combine with point below.",
        "A point with no row at all: choose Add point above or Add point below in the same menu.",
        "A let that was replayed: choose Mark as a let. The score skips it. Count this point puts it back.",
      ),
    ],
  },
  {
    id: "game-boundaries",
    heading: "Game boundaries",
    blocks: [
      p(
        "A game that starts in the wrong place moves the score of every point after it, so fix game boundaries before anything else.",
      ),
      list(
        "Split game: in the point menu, Start a new game here begins a new game at that point. The rest of its game moves with it, served by the other player.",
        "Pull points: when a game ends short, for example at 30–40, an amber slot says the game isn’t finished. Move here pulls the next game’s first points into it. When a point is more likely missing, the slot offers Add point instead.",
        "Shift overflow: when a game is already won but still has points after it, an amber slot says so. Move to game moves those points into the next game, and on through later games when needed. The point menu has the same action: Move leftover points to the next game.",
        "Move to game… in the point menu moves one point into the game before or after it.",
        "You can also drag a game band up or down to the point where the game really starts.",
      ),
    ],
  },
  {
    id: "wrong-end",
    heading: "Players at the wrong end",
    blocks: [
      p(
        "The two players are called Near player and Far player for the whole match. The names do not swap when the players change ends.",
      ),
      p(
        "Players change ends after the first game, then every two games, and every six points in a tiebreak. When a game’s shots sit at the wrong end, an amber slot appears above the first of those points: Players at the wrong end.",
      ),
      list(
        "Switch players, or Switch 4 points when there are several, swaps the hitter on every shot of those points. The winner swaps with them. The server stays.",
        "For one point, Switch players is also in the point menu.",
        "For one shot, H switches its hitter.",
      ),
    ],
  },
  {
    id: "set-the-server",
    heading: "Set the server",
    blocks: [
      p(
        "Each game band names who serves. Click the name and choose the other player.",
      ),
      list(
        "In a game, this changes the server on every point of the game and recalculates the scores after it.",
        "In a tiebreak, it sets who serves first, and the serve rotates 1-2-2 from that player.",
        "When two games in a row are served by the same player, an amber slot names who should serve. Its button gives the game to that player.",
      ),
      p(
        "Click the game’s name on the band to change its type: Game, Tiebreak or Match tiebreak.",
      ),
    ],
  },
  {
    id: "undo-and-redo",
    heading: "Undo and redo",
    blocks: [
      p(
        "⌘Z undoes your last change and ⌘⇧Z redoes it. The Undo and Redo buttons do the same. A fix that changes many points at once, such as Switch 4 points, undoes in one step.",
      ),
      p(
        "Every change saves as you make it. Wait for saving to finish before you close the page.",
      ),
    ],
  },
  {
    id: "submit-for-review",
    heading: "Submit for review",
    blocks: [
      p(
        "When the match meets the cleaning standard, leave full screen and press Submit for review at the top of the page. The button waits until every change has saved.",
      ),
      p(
        "The match goes to an Advantage reviewer as it stands, and you can no longer edit it. Your list shows it as Submitted. If the reviewer sends it back, it reopens for you to finish.",
      ),
    ],
  },
];

/** The six rules, verbatim: the review holds a submitted match to these. */
export const CLEANING_STANDARD_RULES = [
  "Structure and amber flags first, then grey, then forced/unforced error marks.",
  "Watch the whole match: a clean flag count does not mean a correct match — a hitter swap raises no flag.",
  "Never delete a rally. If you are unsure, it is a point.",
  "Do not adjust shot coordinates.",
  "Leave anything you cannot resolve flagged.",
  "Done means: no amber stops, and the score matches.",
] as const;

export const CLEANING_STANDARD_SECTIONS: readonly GuideSection[] = [
  {
    id: "the-standard",
    heading: "The standard",
    blocks: [list(...CLEANING_STANDARD_RULES)],
  },
  {
    id: "working-order",
    heading: "Working order",
    blocks: [
      list(
        "Fix the structure: game boundaries, the server, players at the wrong end, and points that need combining or splitting.",
        "Clear the amber stops with ] until none are left.",
        "Clear the grey flags with '.",
        "Mark each error forced or unforced.",
        "Watch the match through once more, checking each point with ⌘ Enter.",
        "Submit for review.",
      ),
    ],
  },
];
