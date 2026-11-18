import type { NormalizedRoute, SortMode } from "./types";

/** 総合おすすめの重み（要件定義 §5.2）。変更はここ1か所 */
export const WEIGHTS = { fare: 0.4, duration: 0.3, transfers: 0.3 } as const;

function minMax(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function normalize(value: number, range: { min: number; max: number }): number {
  if (range.max === range.min) return 0;
  return (value - range.min) / (range.max - range.min);
}

/**
 * 各ルートに総合スコアを付与して返す（元の配列は変更しない）。
 * - 運賃が取れた組: スコア = 運賃0.4 + 所要時間0.3 + 乗り換え0.3（各指標を候補内で0〜1正規化）
 * - 運賃不明の組: 運賃を除き、所要時間と乗り換えを 0.5/0.5 で再配分してスコア化
 *   （recommend ソートでは不明組は確定組の後ろに回るため、組内の順序付け専用）
 */
export function scoreRoutes(routes: NormalizedRoute[]): (NormalizedRoute & { score: number })[] {
  if (routes.length === 0) return [];
  const durationRange = minMax(routes.map((r) => r.durationSeconds));
  const transfersRange = minMax(routes.map((r) => r.transfers));
  const knownFares = routes.filter((r) => r.fareYen !== null).map((r) => r.fareYen as number);
  const fareRange = minMax(knownFares);
  return routes.map((r) => {
    const d = normalize(r.durationSeconds, durationRange);
    const t = normalize(r.transfers, transfersRange);
    const score =
      r.fareYen !== null
        ? WEIGHTS.fare * normalize(r.fareYen, fareRange) + WEIGHTS.duration * d + WEIGHTS.transfers * t
        : 0.5 * d + 0.5 * t;
    return { ...r, score };
  });
}

function fareAsc(a: NormalizedRoute, b: NormalizedRoute): number {
  if (a.fareYen === null && b.fareYen === null) return 0;
  if (a.fareYen === null) return 1;
  if (b.fareYen === null) return -1;
  return a.fareYen - b.fareYen;
}

/** モード別に並び替えた新しい配列を返す */
export function sortRoutes(routes: NormalizedRoute[], mode: SortMode): NormalizedRoute[] {
  const arr = [...routes];
  switch (mode) {
    case "recommend": {
      const scored = scoreRoutes(arr);
      return scored.sort((a, b) => {
        const aKnown = a.fareYen !== null;
        const bKnown = b.fareYen !== null;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        const s = a.score - b.score;
        if (s !== 0) return s;
        if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
        return a.transfers - b.transfers;
      });
    }
    case "fare":
      return arr.sort((a, b) => {
        const f = fareAsc(a, b);
        if (f !== 0) return f;
        if (a.transfers !== b.transfers) return a.transfers - b.transfers;
        return a.durationSeconds - b.durationSeconds;
      });
    case "transfers":
      return arr.sort((a, b) => {
        if (a.transfers !== b.transfers) return a.transfers - b.transfers;
        const f = fareAsc(a, b);
        if (f !== 0) return f;
        return a.durationSeconds - b.durationSeconds;
      });
    case "duration":
      return arr.sort((a, b) => {
        const at = a.arrivalTime ?? "9999-12-31T23:59:59Z";
        const bt = b.arrivalTime ?? "9999-12-31T23:59:59Z";
        if (at !== bt) return at < bt ? -1 : 1;
        const f = fareAsc(a, b);
        if (f !== 0) return f;
        return a.durationSeconds - b.durationSeconds;
      });
  }
}

export interface RouteBadges {
  /** 最安（運賃が取れた候補の中で最小。同点は全員） */
  cheapest: Set<string>;
  /** 最短（所要時間最小。同点は全員） */
  fastest: Set<string>;
  /** 乗り換え最少（同点は全員） */
  fewestTransfers: Set<string>;
}

/** 最安・最短・乗り換え最少のバッジ対象を判定する */
export function computeBadges(routes: NormalizedRoute[]): RouteBadges {
  const badges: RouteBadges = {
    cheapest: new Set(),
    fastest: new Set(),
    fewestTransfers: new Set(),
  };
  if (routes.length === 0) return badges;
  const known = routes.filter((r) => r.fareYen !== null);
  if (known.length > 0) {
    const minFare = Math.min(...known.map((r) => r.fareYen as number));
    known.forEach((r) => {
      if (r.fareYen === minFare) badges.cheapest.add(r.id);
    });
  }
  const minDur = Math.min(...routes.map((r) => r.durationSeconds));
  routes.forEach((r) => {
    if (r.durationSeconds === minDur) badges.fastest.add(r.id);
  });
  const minTr = Math.min(...routes.map((r) => r.transfers));
  routes.forEach((r) => {
    if (r.transfers === minTr) badges.fewestTransfers.add(r.id);
  });
  return badges;
}
