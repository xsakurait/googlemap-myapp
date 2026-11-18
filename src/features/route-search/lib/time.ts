/** 時刻まわりの共通処理 */

/**
 * 出発時刻を計算し RFC3339 UTC 文字列で返す。
 * @param now 基準時刻
 * @param offsetMinutes 今から何分後か
 */
export function computeDepartureIso(now: Date, offsetMinutes: number): string {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
}

/** Google の duration 文字列 "123s" / "123.4s" を秒数に変換する。不正値は 0 */
export function parseDurationSeconds(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** ISO文字列を Asia/Tokyo の HH:mm に整形する。不正値は空文字 */
export function formatHm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** 分数を "○時間○分" / "○分" に整形する */
export function formatDurationJa(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** 秒数を日本語の所要時間表記にする */
export function formatDurationSecondsJa(seconds: number): string {
  return formatDurationJa(Math.round(seconds / 60));
}
