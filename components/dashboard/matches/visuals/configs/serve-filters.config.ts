import { FilterConfig } from "../types/filters.types";

export const serveFiltersConfig: FilterConfig = {
  type: "serve",
  courtType: "half",
  rows: [
    // Row 1: Player, Type, Side
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
        key: "type",
        label: "Type",
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
    // Row 2: Zone, Spin, (empty)
    [
      {
        key: "zone",
        label: "Zone",
        options: [
          { value: "wide", label: "Wide" },
          { value: "body", label: "Body" },
          { value: "t", label: "T" },
          { value: "create", label: "Create Zone" },
        ],
      },
      {
        key: "spin",
        label: "Spin",
        options: [
          { value: "flat", label: "Flat" },
          { value: "slice", label: "Slice" },
          { value: "kick", label: "Kick" },
        ],
      },
      null,
    ],
    // Row 3: Result, Other
    [
      {
        key: "result",
        label: "Result",
        options: [
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
          { value: "ace", label: "Ace" },
        ],
      },
      {
        key: "other",
        label: "Other",
        options: [{ value: "errors", label: "Errors" }],
      },
      null,
    ],
  ],
};
