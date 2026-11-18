import { describe, it, expect } from "vitest";
import { monthKey, loadUsage, serializeUsage, checkLimit, increment, type UsageState } from "@/lib/usage";

describe("monthKey", () => {
  it("UT-040: JST基準のYYYY-MMを返す", () => {
    expect(monthKey(new Date("2026-11-17T01:00:00Z"))).toBe("2026-11");
  });
  it("UT-041: UTCでは前月でもJSTで当月になる境界", () => {
    // 2026-10-31T16:00Z = 2026-11-01 01:00 JST
    expect(monthKey(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
  });
});

describe("loadUsage", () => {
  const now = new Date("2026-11-17T01:00:00Z");
  it("UT-042: 未保存（null）は当月0件", () => {
    expect(loadUsage(null, now)).toEqual({ month: "2026-11", count: 0 });
  });
  it("UT-043: 同月の保存値はそのまま読む", () => {
    expect(loadUsage('{"month":"2026-11","count":123}', now)).toEqual({ month: "2026-11", count: 123 });
  });
  it("UT-044: 前月の保存値は0にリセットされる（月次リセットの遅延評価）", () => {
    expect(loadUsage('{"month":"2026-10","count":9999}', now)).toEqual({ month: "2026-11", count: 0 });
  });
  it("UT-045: 壊れたJSONは当月0件（異常系）", () => {
    expect(loadUsage("{oops", now)).toEqual({ month: "2026-11", count: 0 });
    expect(loadUsage('{"month":123,"count":"x"}', now)).toEqual({ month: "2026-11", count: 0 });
  });
  it("UT-046: serializeUsage と往復できる", () => {
    const s: UsageState = { month: "2026-11", count: 7 };
    expect(loadUsage(serializeUsage(s), now)).toEqual(s);
  });
});

describe("checkLimit", () => {
  const base: UsageState = { month: "2026-11", count: 0 };
  it("UT-047: warnAt未満は ok", () => {
    expect(checkLimit({ ...base, count: 7999 }, 8000, 10000)).toBe("ok");
  });
  it("UT-048: warnAt到達で warn（境界値）", () => {
    expect(checkLimit({ ...base, count: 8000 }, 8000, 10000)).toBe("warn");
  });
  it("UT-049: stopAt到達で stop（境界値）", () => {
    expect(checkLimit({ ...base, count: 10000 }, 8000, 10000)).toBe("stop");
    expect(checkLimit({ ...base, count: 9999 }, 8000, 10000)).toBe("warn");
  });
});

describe("increment", () => {
  it("UT-050: 同月は+1する", () => {
    const now = new Date("2026-11-17T01:00:00Z");
    expect(increment({ month: "2026-11", count: 5 }, now)).toEqual({ month: "2026-11", count: 6 });
  });
  it("UT-051: 月が変わっていれば新月の1件目にする", () => {
    const now = new Date("2026-11-17T01:00:00Z");
    expect(increment({ month: "2026-10", count: 9999 }, now)).toEqual({ month: "2026-11", count: 1 });
  });
});
