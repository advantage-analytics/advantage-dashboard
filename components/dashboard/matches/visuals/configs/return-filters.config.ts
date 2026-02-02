import { FilterConfig } from "../types/filters.types";

export const returnFiltersConfig: FilterConfig = {
  type: "return",
  courtType: "full",
  rows: [
    // Row 1: Player, Serve Type, Side
    [
      {
        key: "player",
        label: "Player",
        options: [
          { value: "player1", labelKey: "player1Name" },
          { value: "player2", labelKey: "player2Name" },
        ],
        multiSelect: false,
      },
      {
        key: "serveType",
        label: "Serve Type",
        options: [
          { value: "first", label: "First Serve" },
          { value: "second", label: "Second Serve" },
        ],
      },
      {
        key: "side",
        label: "Side",
        options: [
          { value: "deuce", label: "Deuce" },
          { value: "ad", label: "Ad" },
        ],
      },
    ],
    // Row 2: Depth, Direction, Shot Type
    [
      {
        key: "depth",
        label: "Depth",
        options: [
          { value: "short", label: "Short" },
          { value: "mid", label: "Mid" },
          { value: "deep", label: "Deep" },
        ],
      },
      {
        key: "direction",
        label: "Direction",
        options: [
          { value: "crosscourt", label: "Crosscourt" },
          { value: "dtl", label: "Down the Line" },
          { value: "middle", label: "Middle" },
        ],
      },
      {
        key: "shotType",
        label: "Shot Type",
        options: [
          { value: "forehand", label: "Forehand" },
          { value: "backhand", label: "Backhand" },
        ],
      },
    ],
    // Row 3: Result, Other
    [
      {
        key: "result",
        label: "Result",
        options: [
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
          { value: "winner", label: "Winner" },
        ],
      },
      {
        key: "other",
        label: "Other",
        options: [
          { value: "errors", label: "Errors" },
          { value: "forced", label: "Forced Errors" },
        ],
      },
      null,
    ],
  ],
};
