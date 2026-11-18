import { describe, it, expect } from "vitest";
import { normalizeRoutes } from "@/lib/routes-normalize";
import { MOCK_GOOGLE_RESPONSE } from "@/lib/mock-data";

describe("normalizeRoutes（モックフィクスチャ）", () => {
  const routes = normalizeRoutes(MOCK_GOOGLE_RESPONSE);
  it("UT-020: 候補3件に変換される", () => {
    expect(routes).toHaveLength(3);
  });
  it("UT-021: 運賃は units から円の整数になる", () => {
    expect(routes[0].fareYen).toBe(230);
    expect(routes[1].fareYen).toBe(180);
    expect(routes[0].currencyCode).toBe("JPY");
  });
  it("UT-022: 運賃が返らないルートは null（運賃不明）", () => {
    expect(routes[2].fareYen).toBeNull();
  });
  it("UT-023: 乗り換え回数 = TRANSITステップ数 - 1", () => {
    expect(routes[0].transfers).toBe(0);
    expect(routes[1].transfers).toBe(1);
    expect(routes[2].transfers).toBe(1);
  });
  it("UT-024: 出発・到着時刻は legs の startTime/endTime", () => {
    expect(routes[0].departureTime).toBe("2026-11-17T01:03:00Z");
    expect(routes[0].arrivalTime).toBe("2026-11-17T01:36:00Z");
    expect(routes[0].durationSeconds).toBe(1980);
  });
  it("UT-025: 区間は transitDetails から路線名・乗降駅・停車駅数を取る", () => {
    const seg = routes[0].segments.find((s) => s.kind === "transit");
    expect(seg?.lineName).toBe("山手線");
    expect(seg?.departureStop).toBe("品川");
    expect(seg?.arrivalStop).toBe("新宿");
    expect(seg?.stopCount).toBe(10);
    expect(seg?.departureTime).toBe("2026-11-17T01:08:00Z");
  });
  it("UT-026: 徒歩区間は kind=walk で分数換算できる秒数を持つ", () => {
    const walk = routes[0].segments[0];
    expect(walk.kind).toBe("walk");
    expect(walk.durationSeconds).toBe(300);
  });
});

describe("normalizeRoutes（異常系・境界）", () => {
  it("UT-027: null / 非オブジェクト / routes無しは空配列", () => {
    expect(normalizeRoutes(null)).toEqual([]);
    expect(normalizeRoutes("x")).toEqual([]);
    expect(normalizeRoutes({})).toEqual([]);
    expect(normalizeRoutes({ routes: "no" })).toEqual([]);
  });
  it("UT-028: legs が無いルートでも落ちない", () => {
    const r = normalizeRoutes({ routes: [{ duration: "600s" }] });
    expect(r).toHaveLength(1);
    expect(r[0].transfers).toBe(0);
    expect(r[0].departureTime).toBeNull();
    expect(r[0].fareYen).toBeNull();
  });
  it("UT-029: nanos を含む運賃は合算して丸める", () => {
    const r = normalizeRoutes({
      routes: [{ travelAdvisories: { transitFare: { currencyCode: "JPY", units: "200", nanos: 600_000_000 } } }],
    });
    expect(r[0].fareYen).toBe(201);
  });
  it("UT-030: units が数値型でも変換できる／不正値は null", () => {
    const ok = normalizeRoutes({ routes: [{ travelAdvisories: { transitFare: { units: 320 } } }] });
    expect(ok[0].fareYen).toBe(320);
    const ng = normalizeRoutes({ routes: [{ travelAdvisories: { transitFare: { units: "abc" } } }] });
    expect(ng[0].fareYen).toBeNull();
  });
});
