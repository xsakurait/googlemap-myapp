import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "@/app/api/[[...route]]/route";
import { MOCK_GOOGLE_RESPONSE } from "@/features/route-search/lib/mock-data";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DIRECTIONS = {
  directions: [
    {
      trips: [
        {
          duration: 1500,
          fare: { price: 230 },
          details: [
            {
              type: "transit",
              duration: 1500,
              line: "JR山手線",
              departure_station: { name: "品川" },
              arrival_station: { name: "新宿" },
              departure_time: "8:05 AM",
              arrival_time: "8:30 AM",
            },
          ],
        },
      ],
    },
  ],
};

const FLIGHTS = {
  best_flights: [
    {
      flights: [
        {
          departure_airport: { name: "Tokyo Haneda", id: "HND", time: "2026-11-19 08:05" },
          arrival_airport: { name: "Fukuoka", id: "FUK", time: "2026-11-19 10:10" },
          duration: 125,
          airline: "ANA",
          flight_number: "NH 241",
        },
      ],
      total_duration: 125,
      price: 12800,
    },
  ],
};

describe("POST /api/routes（移動手段の振り分け）", () => {
  const savedGoogle = process.env.GOOGLE_MAPS_API_KEY;
  const savedSerp = process.env.SERPAPI_API_KEY;
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedGoogle === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedGoogle;
    if (savedSerp === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = savedSerp;
  });

  it("UT-130: 電車・バスは SerpApi から取得し source=serpapi・serpApiCalls=1", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(DIRECTIONS), { status: 200 })),
    );
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "新宿駅（振り分け確認）", modes: ["transit"] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("serpapi");
    expect(json.serpApiCalls).toBe(1);
    expect(json.routes[0].mode).toBe("transit");
  });

  it("UT-131: 飛行機は空港が解決できれば取得する", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FLIGHTS), { status: 200 })),
    );
    const res = await POST(
      makeRequest({ origin: "東京", destination: "福岡", modes: ["flight"] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.routes[0].mode).toBe("flight");
    expect(json.routes[0].fareYen).toBe(12800);
  });

  it("UT-132: 電車・バス＋車は mixed になる", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("serpapi.com")
          ? new Response(JSON.stringify(DIRECTIONS), { status: 200 })
          : new Response(JSON.stringify(MOCK_GOOGLE_RESPONSE), { status: 200 }),
      ),
    );
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "新橋駅（混合確認）", modes: ["transit", "drive"] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("mixed");
    expect(json.usedSources).toEqual(expect.arrayContaining(["google", "serpapi"]));
  });

  it("UT-133: 飛行機のみで空港が解決できない場合は 404 NOT_FOUND", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "新宿駅", modes: ["flight"] }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("UT-135: modes が空・不正なら 400 INVALID_PARAMS", async () => {
    const res1 = await POST(makeRequest({ origin: "品川駅", destination: "新宿駅", modes: [] }));
    expect(res1.status).toBe(400);
    const res2 = await POST(makeRequest({ origin: "品川駅", destination: "新宿駅", modes: ["bogus"] }));
    expect(res2.status).toBe(400);
    const res3 = await POST(makeRequest({ origin: "品川駅", destination: "新宿駅", modes: "transit" }));
    expect(res3.status).toBe(400);
  });

  it("UT-136: SerpApi 上流エラー（単独手段）は 502 UPSTREAM_ERROR", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "大宮駅（上流確認）", modes: ["transit"] }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
  });
});

describe("GET /api/config", () => {
  it("UT-134: キー設定の有無だけを返す", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    const res = await GET(new Request("http://localhost:3000/api/config"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ google: false, serpapi: false });
  });
});

describe("POST /api/routes（警告とキー未設定）", () => {
  const savedGoogle = process.env.GOOGLE_MAPS_API_KEY;
  const savedSerp = process.env.SERPAPI_API_KEY;
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedGoogle === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedGoogle;
    if (savedSerp === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = savedSerp;
  });

  it("UT-137: 飛行機の取得失敗は警告になり、電車・バスの結果は返る", async () => {
    process.env.SERPAPI_API_KEY = "test-serp-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("google_flights")
          ? new Response("x", { status: 500 })
          : new Response(JSON.stringify(DIRECTIONS), { status: 200 }),
      ),
    );
    const res = await POST(
      makeRequest({ origin: "東京", destination: "福岡（警告確認）", modes: ["transit", "flight"] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warnings).toContain("飛行機の取得に失敗しました");
    expect(json.routes.length).toBeGreaterThan(0);
  });

  it("UT-138: 車のみで Google キー未設定なら 503 API_KEY_NOT_SET", async () => {
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "新宿駅", modes: ["drive"] }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("API_KEY_NOT_SET");
  });

  it("UT-139: 徒歩は Google から取得し mode=walk が付く", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MOCK_GOOGLE_RESPONSE), { status: 200 })),
    );
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "大崎駅（徒歩確認）", modes: ["walk"] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("google");
    expect(json.routes[0].mode).toBe("walk");
  });
});

describe("POST /api/routes（エラー優先順位）", () => {
  const savedGoogle = process.env.GOOGLE_MAPS_API_KEY;
  const savedSerp = process.env.SERPAPI_API_KEY;
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedGoogle === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedGoogle;
    if (savedSerp === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = savedSerp;
  });

  it("UT-140: 両方のキーが未設定なら最初のエラー（SerpApi）を返す", async () => {
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "新宿駅", modes: ["transit", "drive"] }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("SERPAPI_KEY_NOT_SET");
  });

  it("UT-141: 徒歩の上流エラーは 502 UPSTREAM_ERROR", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const res = await POST(
      makeRequest({ origin: "品川駅", destination: "大崎駅（徒歩エラー確認）", modes: ["walk"] }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
  });
});
