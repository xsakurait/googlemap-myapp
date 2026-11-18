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
