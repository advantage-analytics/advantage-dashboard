import { FilterConfig } from "../types/filters.types";

export const returnFiltersConfig: FilterConfig = {
  type: "return",
  courtType: "full",
  rows: [
    // Row 1: Context — who's returning, against which serve, on which side
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
        label: "Serve",
        options: [
          { value: "first", label: "1st Serve" },
          { value: "second", label: "2nd Serve" },
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
    // Row 2: Return shot — stroke, spin, outcome
    [
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
          { value: "flat", label: "Flat" },
          { value: "slice", label: "Slice" },
          { value: "topspin", label: "Topspin" },
        ],
      },
      {
        key: "result",
        label: "Result",
        options: [
          { value: "won", label: "Point Won" },
          { value: "lost", label: "Point Lost" },
          { value: "outnet", label: "Out / Net" },
        ],
      },
    ],
  ],
};
