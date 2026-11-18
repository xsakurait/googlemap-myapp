import { describe, it, expect } from "vitest";
import { computeDepartureIso, parseDurationSeconds, formatHm, formatDurationJa } from "@/features/route-search/lib/time";

describe("computeDepartureIso", () => {
  it("UT-001: オフセット0分は基準時刻そのものを返す", () => {
    const now = new Date("2026-11-17T01:00:00Z");
    expect(computeDepartureIso(now, 0)).toBe("2026-11-17T01:00:00.000Z");
  });
  it("UT-002: 30分後を加算する", () => {
    const now = new Date("2026-11-17T01:00:00Z");
    expect(computeDepartureIso(now, 30)).toBe("2026-11-17T01:30:00.000Z");
  });
  it("UT-003: 日付をまたぐ加算ができる（境界値）", () => {
    const now = new Date("2026-11-17T23:50:00Z");
    expect(computeDepartureIso(now, 30)).toBe("2026-11-18T00:20:00.000Z");
  });
});

describe("parseDurationSeconds", () => {
  it("UT-004: '900s' を 900 に変換する", () => {
    expect(parseDurationSeconds("900s")).toBe(900);
  });
  it("UT-005: 小数 '12.6s' は四捨五入する", () => {
    expect(parseDurationSeconds("12.6s")).toBe(13);
  });
  it("UT-006: undefined / null / 不正文字列は 0（異常系）", () => {
    expect(parseDurationSeconds(undefined)).toBe(0);
    expect(parseDurationSeconds(null)).toBe(0);
    expect(parseDurationSeconds("abc")).toBe(0);
    expect(parseDurationSeconds("")).toBe(0);
  });
  it("UT-007: 数値はそのまま丸める", () => {
    expect(parseDurationSeconds(61.4)).toBe(61);
  });
});

describe("formatHm", () => {
  it("UT-008: UTC を Asia/Tokyo の HH:mm に変換する", () => {
    expect(formatHm("2026-11-17T01:05:00Z")).toBe("10:05");
  });
  it("UT-009: null / 不正値は空文字（異常系）", () => {
    expect(formatHm(null)).toBe("");
    expect(formatHm("not-a-date")).toBe("");
  });
});

describe("formatDurationJa", () => {
  it("UT-010: 45分は '45分'", () => {
    expect(formatDurationJa(45)).toBe("45分");
  });
  it("UT-011: 90分は '1時間30分'", () => {
    expect(formatDurationJa(90)).toBe("1時間30分");
  });
  it("UT-012: 60分ちょうどは '1時間'（境界値）", () => {
    expect(formatDurationJa(60)).toBe("1時間");
  });
  it("UT-013: 0分は '0分'、負数は0に丸める（境界値）", () => {
    expect(formatDurationJa(0)).toBe("0分");
    expect(formatDurationJa(-5)).toBe("0分");
  });
});
