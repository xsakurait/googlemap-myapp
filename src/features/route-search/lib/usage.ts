/** 月間リクエストカウンター（純関数群。永続化は呼び出し側の localStorage） */

export interface UsageState {
  /** Asia/Tokyo 基準の YYYY-MM */
  month: string;
  count: number;
}

export type LimitStatus = "ok" | "warn" | "stop";

/** 無料枠ガードの初期値（警告・停止件数。定義はここに一元化する） */
export const DEFAULT_USAGE_LIMITS = { warnAt: 8000, stopAt: 10000 };

/** Asia/Tokyo 基準の YYYY-MM を返す */
export function monthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/**
 * 保存済みJSON文字列を読み、現在月と違えば 0 にリセットした状態を返す
 * （月次リセットの遅延評価。バッチは持たない）。
 */
export function loadUsage(raw: string | null | undefined, now: Date): UsageState {
  const current = monthKey(now);
  if (!raw) return { month: current, count: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    if (typeof parsed.month !== "string" || typeof parsed.count !== "number" || !Number.isFinite(parsed.count)) {
      return { month: current, count: 0 };
    }
    if (parsed.month !== current) return { month: current, count: 0 };
    return { month: parsed.month, count: Math.max(0, Math.floor(parsed.count)) };
  } catch {
    return { month: current, count: 0 };
  }
}

/** 利用カウンタを保存用の文字列へ変換する */
export function serializeUsage(state: UsageState): string {
  return JSON.stringify(state);
}

/** 上限判定。count >= stopAt で stop、>= warnAt で warn */
export function checkLimit(state: UsageState, warnAt: number, stopAt: number): LimitStatus {
  if (state.count >= stopAt) return "stop";
  if (state.count >= warnAt) return "warn";
  return "ok";
}

/** 1件加算した新しい状態を返す。月が変わっていれば新月の1件目にする */
export function increment(state: UsageState, now: Date): UsageState {
  const current = monthKey(now);
  if (state.month !== current) return { month: current, count: 1 };
  return { month: state.month, count: state.count + 1 };
}
