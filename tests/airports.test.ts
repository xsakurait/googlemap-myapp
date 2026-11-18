import { describe, it, expect } from "vitest";
import { resolveAirportCode } from "@/features/route-search/lib/airports";

describe("resolveAirportCode（空港コード解決）", () => {
  it("UT-140: 地名キーワードから解決する", () => {
    expect(resolveAirportCode("東京")).toBe("HND");
    expect(resolveAirportCode("福岡")).toBe("FUK");
    expect(resolveAirportCode("大阪")).toBe("ITM");
    expect(resolveAirportCode("新千歳空港")).toBe("CTS");
  });

  it("UT-141: 3文字の空港コードはそのまま使う（大文字化）", () => {
    expect(resolveAirportCode("fuk")).toBe("FUK");
    expect(resolveAirportCode("OKA")).toBe("OKA");
  });

  it("UT-142: 解決できない地名は null", () => {
    expect(resolveAirportCode("新宿駅")).toBeNull();
    expect(resolveAirportCode("")).toBeNull();
  });
});
