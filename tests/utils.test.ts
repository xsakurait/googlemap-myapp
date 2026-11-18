import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn（クラス名結合）", () => {
  it("UT-170: 複数のクラス名を空白区切りで結合する", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("UT-171: 条件付きの false や undefined は除外する", () => {
    expect(cn("a", false, undefined, "c")).toBe("a c");
  });

  it("UT-172: 競合する Tailwind クラスは後勝ちでマージする", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
