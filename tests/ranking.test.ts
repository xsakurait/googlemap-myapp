import { describe, it, expect } from "vitest";
import { WEIGHTS, scoreRoutes, sortRoutes, computeBadges } from "@/features/route-search/lib/ranking";
import type { NormalizedRoute } from "@/features/route-search/lib/types";

function route(partial: Partial<NormalizedRoute> & { id: string }): NormalizedRoute {
  return {
    fareYen: null,
    durationSeconds: 1800,
    distanceMeters: null,
    departureTime: "2026-11-17T01:00:00Z",
    arrivalTime: "2026-11-17T01:30:00Z",
    transfers: 0,
    segments: [],
    ...partial,
  };
}

describe("WEIGHTS", () => {
  it("UT-070: 重みは運賃0.4・所要時間0.3・乗り換え0.3（要件定義どおり）", () => {
    expect(WEIGHTS).toEqual({ fare: 0.4, duration: 0.3, transfers: 0.3 });
  });
});

describe("scoreRoutes", () => {
  it("UT-071: 全指標が最良のルートはスコア0になる", () => {
    const scored = scoreRoutes([
      route({ id: "a", fareYen: 100, durationSeconds: 600, transfers: 0 }),
      route({ id: "b", fareYen: 300, durationSeconds: 1800, transfers: 2 }),
    ]);
    expect(scored.find((r) => r.id === "a")?.score).toBe(0);
    expect(scored.find((r) => r.id === "b")?.score).toBeCloseTo(1);
  });
  it("UT-072: 全候補同値なら全員スコア0（境界値）", () => {
    const scored = scoreRoutes([
      route({ id: "a", fareYen: 200, durationSeconds: 900, transfers: 1 }),
      route({ id: "b", fareYen: 200, durationSeconds: 900, transfers: 1 }),
    ]);
    expect(scored.every((r) => r.score === 0)).toBe(true);
  });
  it("UT-073: 空配列は空配列、元配列は変更しない", () => {
    expect(scoreRoutes([])).toEqual([]);
    const input = [route({ id: "a", fareYen: 100 })];
    scoreRoutes(input);
    expect(input[0].score).toBeUndefined();
  });
});

describe("sortRoutes recommend", () => {
  it("UT-074: 運賃不明は運賃確定組の後ろに回る", () => {
    const sorted = sortRoutes(
      [
        route({ id: "unknown", fareYen: null, durationSeconds: 600, transfers: 0 }),
        route({ id: "known", fareYen: 500, durationSeconds: 3600, transfers: 3 }),
      ],
      "recommend",
    );
    expect(sorted[0].id).toBe("known");
    expect(sorted[1].id).toBe("unknown");
  });
  it("UT-075: 総合スコア順（安くて速く乗り換え少ない方が上位）", () => {
    const sorted = sortRoutes(
      [
        route({ id: "bad", fareYen: 400, durationSeconds: 3600, transfers: 2 }),
        route({ id: "good", fareYen: 200, durationSeconds: 1200, transfers: 0 }),
        route({ id: "mid", fareYen: 300, durationSeconds: 2400, transfers: 1 }),
      ],
      "recommend",
    );
    expect(sorted.map((r) => r.id)).toEqual(["good", "mid", "bad"]);
  });
  it("UT-076: 全件運賃不明なら所要時間と乗り換えで順位付けする", () => {
    const sorted = sortRoutes(
      [
        route({ id: "slow", fareYen: null, durationSeconds: 3600, transfers: 0 }),
        route({ id: "fast", fareYen: null, durationSeconds: 1200, transfers: 0 }),
      ],
      "recommend",
    );
    expect(sorted[0].id).toBe("fast");
  });
});

describe("sortRoutes fare / transfers / duration", () => {
  const list = [
    route({ id: "x", fareYen: 300, durationSeconds: 1500, transfers: 0, arrivalTime: "2026-11-17T01:40:00Z" }),
    route({ id: "y", fareYen: 200, durationSeconds: 2000, transfers: 1, arrivalTime: "2026-11-17T01:35:00Z" }),
    route({ id: "z", fareYen: null, durationSeconds: 900, transfers: 0, arrivalTime: "2026-11-17T01:20:00Z" }),
  ];
  it("UT-077: fare は運賃昇順・不明は最後、同額は乗り換え→所要時間", () => {
    expect(sortRoutes(list, "fare").map((r) => r.id)).toEqual(["y", "x", "z"]);
    const tie = sortRoutes(
      [
        route({ id: "t2", fareYen: 200, durationSeconds: 1000, transfers: 2 }),
        route({ id: "t1", fareYen: 200, durationSeconds: 1500, transfers: 1 }),
        route({ id: "t0", fareYen: 200, durationSeconds: 1200, transfers: 1 }),
      ],
      "fare",
    );
    expect(tie.map((r) => r.id)).toEqual(["t0", "t1", "t2"]);
  });
  it("UT-078: transfers は乗り換え昇順→運賃（不明最後）", () => {
    expect(sortRoutes(list, "transfers").map((r) => r.id)).toEqual(["x", "z", "y"]);
  });
  it("UT-079: duration は到着時刻の早い順→運賃", () => {
    expect(sortRoutes(list, "duration").map((r) => r.id)).toEqual(["z", "y", "x"]);
  });
});

describe("computeBadges", () => {
  it("UT-080: 最安・最短・乗り換え最少が正しく付く", () => {
    const badges = computeBadges([
      route({ id: "a", fareYen: 200, durationSeconds: 1800, transfers: 1 }),
      route({ id: "b", fareYen: 300, durationSeconds: 1200, transfers: 0 }),
    ]);
    expect([...badges.cheapest]).toEqual(["a"]);
    expect([...badges.fastest]).toEqual(["b"]);
    expect([...badges.fewestTransfers]).toEqual(["b"]);
  });
  it("UT-081: 同点は全員に付与される", () => {
    const badges = computeBadges([
      route({ id: "a", fareYen: 200, durationSeconds: 1200, transfers: 0 }),
      route({ id: "b", fareYen: 200, durationSeconds: 1200, transfers: 0 }),
    ]);
    expect(badges.cheapest.size).toBe(2);
    expect(badges.fastest.size).toBe(2);
    expect(badges.fewestTransfers.size).toBe(2);
  });
  it("UT-082: 運賃不明だけなら最安バッジは付かない／空配列は空", () => {
    const badges = computeBadges([route({ id: "a", fareYen: null })]);
    expect(badges.cheapest.size).toBe(0);
    expect(computeBadges([]).fastest.size).toBe(0);
  });
});

describe("sortRoutes 同点時のタイブレーク", () => {
  it("UT-083: recommend でスコア同点なら所要時間の短い順", () => {
    const sorted = sortRoutes(
      [
        route({ id: "a", fareYen: 500, durationSeconds: 200, transfers: 0 }),
        route({ id: "b", fareYen: 500, durationSeconds: 100, transfers: 1 }),
      ],
      "recommend",
    );
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("UT-084: recommend で全指標が同値なら入力順を保つ（最終タイブレーク到達）", () => {
    const sorted = sortRoutes(
      [
        route({ id: "a", fareYen: 500, durationSeconds: 100, transfers: 1 }),
        route({ id: "b", fareYen: 500, durationSeconds: 100, transfers: 1 }),
      ],
      "recommend",
    );
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("UT-085: transfers で乗り換え・運賃とも同点なら所要時間の短い順", () => {
    const sorted = sortRoutes(
      [
        route({ id: "a", fareYen: null, durationSeconds: 300, transfers: 1 }),
        route({ id: "b", fareYen: null, durationSeconds: 100, transfers: 1 }),
      ],
      "transfers",
    );
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("UT-086: duration で到着時刻・運賃とも同点なら所要時間の短い順", () => {
    const sorted = sortRoutes(
      [
        route({ id: "a", fareYen: 500, durationSeconds: 300, arrivalTime: "2026-11-17T01:30:00Z" }),
        route({ id: "b", fareYen: 500, durationSeconds: 100, arrivalTime: "2026-11-17T01:30:00Z" }),
        route({ id: "c", fareYen: 300, durationSeconds: 200, arrivalTime: "2026-11-17T01:30:00Z" }),
      ],
      "duration",
    );
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("sortRoutes 運賃不明の位置と到着時刻なし", () => {
  it("UT-087: recommend で運賃不明が先頭にあっても確定組が前に来る", () => {
    const sorted = sortRoutes(
      [
        route({ id: "u", fareYen: null, durationSeconds: 100, transfers: 0 }),
        route({ id: "k", fareYen: 500, durationSeconds: 900, transfers: 2 }),
      ],
      "recommend",
    );
    expect(sorted.map((r) => r.id)).toEqual(["k", "u"]);
  });
  it("UT-088: fare / transfers で運賃確定と不明が混在しても不明は最後", () => {
    const list = [
      route({ id: "a", fareYen: 300 }),
      route({ id: "u", fareYen: null }),
      route({ id: "b", fareYen: 200 }),
    ];
    expect(sortRoutes(list, "fare").map((r) => r.id)).toEqual(["b", "a", "u"]);
    expect(sortRoutes(list, "transfers").map((r) => r.id)).toEqual(["b", "a", "u"]);
  });
  it("UT-089: duration で到着時刻なしは最後に回り、同士は運賃順", () => {
    const sorted = sortRoutes(
      [
        route({ id: "a", fareYen: 500, arrivalTime: null }),
        route({ id: "b", fareYen: 900, arrivalTime: "2026-11-17T01:30:00Z" }),
        route({ id: "c", fareYen: 300, arrivalTime: null }),
      ],
      "duration",
    );
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sortRoutes recommend の運賃不明の挟み込み", () => {
  it("UT-090: 運賃不明が確定組の間にあっても最後に回る", () => {
    const sorted = sortRoutes(
      [
        route({ id: "k1", fareYen: 500, durationSeconds: 900, transfers: 2 }),
        route({ id: "u", fareYen: null, durationSeconds: 100, transfers: 0 }),
        route({ id: "k2", fareYen: 300, durationSeconds: 900, transfers: 2 }),
      ],
      "recommend",
    );
    expect(sorted.map((r) => r.id)).toEqual(["k2", "k1", "u"]);
  });
});
