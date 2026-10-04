export * from "./matches/verification.js";
export * from "./reputation/recalculate.js";
export * from "./moderation/blacklist-expiry.js";
export { detectThrowsForMatch } from "./throw-detection/detect.js";
export {
  binomialUpperTail,
  baselineLossRate,
  eventLossStreak,
  killShare,
  performanceDrop,
  teammateLossPattern,
  type LossPattern,
  type PerformanceDrop,
} from "./throw-detection/signals.js";
export {
  claimPendingReadings,
  processPendingReadings,
  processReading,
  queueScreenshotReading,
  type ImageRegion,
  type OcrEngine,
  type OcrResult,
  type RegionCutter,
  type ScreenshotLoader,
} from "./ocr/reading.js";
export {
  compareToSubmitted,
  matchRows,
  parseScoreboard,
  linesFromWords,
  panelIsConsistent,
  panelOwner,
  parsePanel,
  parseRows,
  HARDPOINT_TABLE_COLUMNS,
  planFill,
  type Discrepancy,
  type OcrWord,
  type MatchedRow,
  type StatField,
} from "./ocr/scoreboard.js";
export {
  POINTS,
  MIN_RANKED_MATCHES,
  computeStandings,
  monthKey,
  monthWindow,
  type PlayerMatchResult,
  type Standing,
} from "./leaderboards/standings.js";
export {
  boardsAffectedBy,
  refreshForMatch,
  refreshLeaderboard,
  sweepLeaderboards,
  type BoardRef,
  type Period,
} from "./leaderboards/refresh.js";
