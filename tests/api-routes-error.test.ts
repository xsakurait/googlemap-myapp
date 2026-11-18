import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// google-client をモックし、ApiError 以外の例外が伝播する経路を検証する
vi.mock("@/features/route-search/lib/google-client", () => ({
  parseSearchParams: vi.fn(),
  fetchRoutes: vi.fn(),
}));

import { POST } from "@/app/api/[[...route]]/route";
import { parseSearchParams, fetchRoutes } from "@/features/route-search/lib/google-client";

const parseMock = vi.mocked(parseSearchParams);
const fetchMock = vi.mocked(fetchRoutes);

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: "品川駅", destination: "新宿駅", offsetMinutes: 0 }),
  });
}

describe("POST /api/routes 異常系（モック）", () => {
  const savedKey = process.env.GOOGLE_MAPS_API_KEY;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedKey;
  });

  it("UT-120: parseSearchParams の ApiError 以外の例外はそのまま伝播する", async () => {
    parseMock.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(POST(makeRequest())).rejects.toThrow("boom");
  });

  it("UT-121: fetchRoutes の ApiError 以外の例外は 502 UPSTREAM_ERROR になる", async () => {
    parseMock.mockReturnValue({
      origin: { type: "address", address: "品川駅" },
      destination: "新宿駅",
      offsetMinutes: 0,
    });
    fetchMock.mockRejectedValue(new Error("net down"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
  });
});
