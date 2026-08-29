/** Display duration for active media events (milliseconds). */
export const MEDIA_DISPLAY_WINDOW_MS = 30_000;

/** Format position/duration as "m:ss / m:ss". */
export function formatMediaTime(positionMs?: number, durationMs?: number): string {
  if (positionMs === undefined || durationMs === undefined || durationMs <= 0) {
    return "";
  }
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return `${fmt(positionMs)} / ${fmt(durationMs)}`;
}
