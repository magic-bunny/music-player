export function clock(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}
export function playbackTime(position, duration, liveLabel = null) {
  return `${clock(position)} / ${liveLabel || (Number.isFinite(duration) && duration > 0 ? clock(duration) : "--:--")}`;
}
