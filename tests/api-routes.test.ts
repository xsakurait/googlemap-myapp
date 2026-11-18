import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/[[...route]]/route";
import { MOCK_GOOGLE_RESPONSE } from "@/features/route-search/lib/mock-data";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  origin: { type: "latLng", latitude: 35.6284, longitude: 139.7386 },
  destination: "新宿駅",
  offsetMinutes: 0,
};

describe("POST /api/routes", () => {
  const savedKey = process.env.GOOGLE_MAPS_API_KEY;
  const savedSerpKey = process.env.SERPAPI_API_KEY;
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedKey;
    if (savedSerpKey === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = savedSerpKey;
  });

  it("UT-110: mock=true はキー未設定でもモック応答を返す（source: mock）", async () => {
    const res = await POST(makeRequest({ ...validBody, destination: "モック確認先", mock: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("mock");
    expect(json.cached).toBe(false);
    expect(json.routes).toHaveLength(3);
    expect(json.departureTime).toBeTypeOf("string");
  });

  it("UT-111: キー未設定・mockなしは 503（初期手段は電車・バスのため SERPAPI_KEY_NOT_SET）", async () => {
    const res = await POST(makeRequest({ ...validBody, destination: "キー未設定確認先" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("SERPAPI_KEY_NOT_SET");
  });

  it("UT-112: 目的地なしは 400 INVALID_PARAMS", async () => {
    const res = await POST(makeRequest({ origin: "品川駅" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  it("UT-113: JSONでないボディは 400 INVALID_PARAMS（異常系）", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  it("UT-114: キーありは実API（モックfetch）を1回呼び、2回目はキャッシュ", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(MOCK_GOOGLE_RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = { ...validBody, destination: "キャッシュ確認先", modes: ["drive"] };
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.source).toBe("google");
    expect(json1.cached).toBe(false);
    expect(json1.routes).toHaveLength(3);
    const res2 = await POST(makeRequest(body));
    const json2 = await res2.json();
    expect(json2.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("UT-115: 上流がルート0件なら 404 NOT_FOUND", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 })),
    );
    const res = await POST(makeRequest({ ...validBody, destination: "存在しない場所XYZ", modes: ["drive"] }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("UT-116: 上流HTTPエラーは 502 UPSTREAM_ERROR", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 403 })),
    );
    const res = await POST(makeRequest({ ...validBody, destination: "上流エラー確認先", modes: ["drive"] }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
  });
});
