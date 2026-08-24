/**
 * The ten rates a player is read on, wherever they are read.
 *
 * Extracted from `team-compare-server.ts` when Compare was removed. The list
 * outlived the screen that introduced it: the roster's player profile reads it,
 * and so does an opponent's. Leaving it in the deleted module's file would have
 * meant either keeping a page nobody navigates to alive for one constant, or
 * copying the list — and two copies of a measure list is two answers to "what
 * is this player's first serve percentage", drifting the first time one is
 * edited.
 *
 * ── Why these ten ───────────────────────────────────────────────────────────
 * Deliberately the set the radar on the match page already uses: every one is a
 * serve/return/pressure rate that derivation can produce, so a video-analysed
 * match contributes on the same terms as an imported one.
 *
 * Aces, winners and unforced errors are absent ON PURPOSE. They depend on
 * `result_type`, and `docs/splitstep-derivation.md` §4 puts aces in the
 * Unknowable tier and winners/errors in the Approximate one — so a program
 * mixing imported and video matches would be reading two players, or two
 * opponents, on differently-populated columns and calling the difference form.
 */

export interface PlayerMeasureDef {
  key: string;
  label: string;
  /** Longer form, for the row's title attribute. */
  hint: string;
}

/** The measures, in reading order. */
export const PLAYER_MEASURES: PlayerMeasureDef[] = [
  { key: "first_serve_pct", label: "First serve in", hint: "Share of first serves landing in" },
  { key: "first_serve_won_pct", label: "First serve won", hint: "Points won behind a first serve" },
  { key: "second_serve_won_pct", label: "Second serve won", hint: "Points won behind a second serve" },
  { key: "service_games_won_pct", label: "Service games held", hint: "Service games won" },
  { key: "break_points_saved_pct", label: "Break points saved", hint: "Break points faced and survived" },
  { key: "first_return_won_pct", label: "First return won", hint: "Points won returning a first serve" },
  { key: "second_return_won_pct", label: "Second return won", hint: "Points won returning a second serve" },
  { key: "return_games_won_pct", label: "Return games won", hint: "Opponent service games broken" },
  { key: "break_points_converted_pct", label: "Break points taken", hint: "Break chances converted" },
  { key: "total_points_won_pct", label: "Total points won", hint: "Share of all points won" },
];
