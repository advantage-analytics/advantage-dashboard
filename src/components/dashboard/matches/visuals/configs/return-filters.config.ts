import { FilterConfig } from "../types/filters.types";

export const returnFiltersConfig: FilterConfig = {
  type: "return",
  courtType: "full",
  rows: [
    // Row 1: Player, Type (serve), Side
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
    // Row 2: Placement, Type (shot), Spin
    [
      {
        key: "placement",
        label: "Placement",
        options: [
          { value: "dtl", label: "Down the Line" },
          { value: "middle", label: "Middle" },
          { value: "crosscourt", label: "Crosscourt" },
        ],
      },
      {
        key: "shotType",
        label: "Stroke",
        options: [
          { value: "forehand", label: "Forehand" },
          { value: "backhand", label: "Backhand" },
        ],
      },
      {
        key: "spin",
        label: "Spin",
        options: [
          { value: "topspin", label: "Topspin" },
          { value: "slice", label: "Slice" },
        ],
      },
    ],
    // Row 3: Contact, Depth, Result
    [
      {
        key: "contact",
        label: "Contact",
        options: [
          { value: "inside", label: "Inside" },
          { value: "neutral", label: "Neutral" },
          { value: "far", label: "Far" },
        ],
      },
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
        key: "result",
        label: "Result",
        options: [
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
          { value: "winner", label: "Winner" },
        ],
      },
    ],
    // Row 4: Other
    [
      {
        key: "other",
        label: "Other",
        options: [{ value: "doubleFault", label: "Double Fault" }],
      },
      null,
      null,
    ],
  ],
};
