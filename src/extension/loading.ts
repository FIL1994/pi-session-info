import type { HistoryProgress } from "../history/reader";

export type LoadProgress = HistoryProgress | { phase: "checking-running" | "checking-matches" };
export interface LoadingState {
  label: string;
  startedAt: number;
  progress: LoadProgress;
  counts?: HistoryProgress;
}

/** Indeterminate progress: the total is unknown until the scan finishes. */
export function loadingLines(state: LoadingState, now: number): string[] {
  const elapsed = Math.max(0, now - state.startedAt);
  const seconds = Math.floor(elapsed / 1000);
  const age = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const frame = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][Math.floor(elapsed / 100) % 10];
  const phase = {
    "checking-running": "Checking running sessions…",
    scanning: "Reading saved-session metadata…",
    sorting: "Sorting newest sessions first…",
    "checking-matches": "Checking which sessions are still running…",
  }[state.progress.phase];
  const counts = state.counts;
  return [
    `${frame} ${state.label}`,
    `${age} elapsed · ${phase}`,
    counts ? `${counts.files} files checked · ${counts.sessions} saved sessions found · ${counts.directories} folders visited`
      : "Preparing scan · total size not known yet",
  ];
}
