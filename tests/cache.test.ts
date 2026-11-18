import { describe, it, expect } from "vitest";
import { createCache, cacheKeyFor, stableStringify } from "@/lib/cache";

describe("createCache", () => {
  it("UT-060: setした値をgetできる", () => {
    const c = createCache<string>(60_000, () => 1000);
    c.set("k", "v");
    expect(c.get("k")).toBe("v");
    expect(c.has("k")).toBe(true);
    expect(c.size()).toBe(1);
  });
  it("UT-061: 未登録キーは undefined", () => {
    const c = createCache<string>(60_000, () => 1000);
    expect(c.get("none")).toBeUndefined();
    expect(c.has("none")).toBe(false);
  });
  it("UT-062: TTLを過ぎたら期限切れとして破棄される（境界値）", () => {
    let t = 1000;
    const c = createCache<string>(60_000, () => t);
    c.set("k", "v");
    t = 1000 + 59_999;
    expect(c.get("k")).toBe("v");
    t = 1000 + 60_000;
    expect(c.get("k")).toBeUndefined();
    expect(c.size()).toBe(0);
  });
  it("UT-063: clearで全消去できる", () => {
    const c = createCache<string>(60_000, () => 0);
    c.set("a", "1");
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.get("a")).toBeUndefined();
  });
});

describe("cacheKeyFor / stableStringify", () => {
  it("UT-064: キー順が違っても同じキーになる", () => {
    expect(cacheKeyFor({ a: 1, b: { c: 2, d: 3 } })).toBe(cacheKeyFor({ b: { d: 3, c: 2 }, a: 1 }));
  });
  it("UT-065: 値が違えばキーが変わる", () => {
    expect(cacheKeyFor({ destination: "新宿" })).not.toBe(cacheKeyFor({ destination: "渋谷" }));
  });
  it("UT-066: 配列とプリミティブを扱える", () => {
    expect(stableStringify([1, "x", null])).toBe('[1,"x",null]');
    expect(stableStringify(5)).toBe("5");
  });
});

describe("stableStringify 追加", () => {
  it("UT-067: undefined は 'null' に文字列化される", () => {
    expect(stableStringify(undefined)).toBe("null");
    expect(cacheKeyFor({ a: undefined })).toBe("{\"a\":null}");
  });
});
