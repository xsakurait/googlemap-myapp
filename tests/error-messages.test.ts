import { describe, it, expect } from "vitest";
import { ERROR_MESSAGES } from "@/features/route-search/lib/error-messages";
import type { ApiErrorCode } from "@/features/route-search/lib/types";

// エラーコードの全値（types.ts の ApiErrorCode と一致させること）
const ALL_CODES: ApiErrorCode[] = [
  "API_KEY_NOT_SET",
  "UPSTREAM_ERROR",
  "NOT_FOUND",
  "INVALID_PARAMS",
  "LIMIT_REACHED",
];

describe("ERROR_MESSAGES", () => {
  it("すべてのエラーコードに空でないメッセージがある", () => {
    for (const code of ALL_CODES) {
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
    }
  });

  it("定義されているキーがエラーコードの全値と一致する", () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
  });
});
