import { FilterConfig } from "../types/filters.types";

export const customFiltersConfig: FilterConfig = {
  type: "custom",
  courtType: "full",
  rows: [
    // Row 1: Player, Shot Number, Court Position
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
        key: "shotNumber",
        label: "Shot Number",
        options: [
          { value: "1", label: "1st" },
          { value: "2", label: "2nd" },
          { value: "3", label: "3rd" },
          { value: "4+", label: "4+" },
        ],
      },
      {
        key: "courtPosition",
        label: "Court Position",
        options: [
          { value: "baseline", label: "Baseline" },
          { value: "midcourt", label: "Midcourt" },
          { value: "net", label: "Net" },
        ],
      },
    ],
    // Row 2: Shot Type, Direction, (empty)
    [
      {
        key: "shotType",
        label: "Shot Type",
        options: [
          { value: "forehand", label: "Forehand" },
          { value: "backhand", label: "Backhand" },
          { value: "volley", label: "Volley" },
          { value: "overhead", label: "Overhead" },
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
          { value: "winner", label: "Winner" },
        ],
      },
      {
        key: "other",
        label: "Other",
        options: [
          { value: "doubleFault", label: "Double Fault" },
          { value: "errors", label: "Errors" },
          { value: "forced", label: "Forced Errors" },
        ],
      },
      null,
    ],
  ],
};
