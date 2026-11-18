import { describe, it, expect, vi } from "vitest";
import {
  FIELD_MASK,
  ROUTES_ENDPOINT,
  buildRequestBody,
  parseSearchParams,
  fetchRoutes,
} from "@/lib/google-client";
import { ApiError, type SearchParams } from "@/lib/types";
import { MOCK_GOOGLE_RESPONSE } from "@/lib/mock-data";

const latLngParams: SearchParams = {
  origin: { type: "latLng", latitude: 35.6284, longitude: 139.7386 },
  destination: "新宿駅",
  offsetMinutes: 10,
};

function okFetch(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch;
}

describe("FIELD_MASK", () => {
  it("UT-090: transitFare と transitDetails を含む（Essentials範囲の根拠は設計書05）", () => {
    expect(FIELD_MASK).toContain("routes.travelAdvisories.transitFare");
    expect(FIELD_MASK).toContain("routes.legs.steps.transitDetails");
    expect(ROUTES_ENDPOINT).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  });
});

describe("buildRequestBody", () => {
  it("UT-091: latLng出発地は location.latLng で送る", () => {
    const body = buildRequestBody(latLngParams, new Date("2026-11-17T01:00:00Z"));
    expect(body.origin).toEqual({ location: { latLng: { latitude: 35.6284, longitude: 139.7386 } } });
    expect(body.destination).toEqual({ address: "新宿駅" });
    expect(body.travelMode).toBe("TRANSIT");
    expect(body.computeAlternativeRoutes).toBe(true);
    expect(body.languageCode).toBe("ja-JP");
    expect(body.units).toBe("METRIC");
    expect(body.departureTime).toBe("2026-11-17T01:10:00.000Z");
  });
  it("UT-092: address出発地は address で送る", () => {
    const body = buildRequestBody(
      { origin: { type: "address", address: "品川駅" }, destination: "新宿駅", offsetMinutes: 0 },
      new Date("2026-11-17T01:00:00Z"),
    );
    expect(body.origin).toEqual({ address: "品川駅" });
  });
});

describe("parseSearchParams", () => {
  it("UT-093: 正常なボディを変換する（latLng形式）", () => {
    const p = parseSearchParams({
      origin: { type: "latLng", latitude: 35.6, longitude: 139.7 },
      destination: " 新宿駅 ",
      offsetMinutes: 5,
    });
    expect(p).toEqual({
      origin: { type: "latLng", latitude: 35.6, longitude: 139.7 },
      destination: "新宿駅",
      offsetMinutes: 5,
    });
  });
  it("UT-094: origin は文字列・latLng入れ子・address形式も受ける", () => {
    expect(parseSearchParams({ origin: "品川駅", destination: "新宿" }).origin).toEqual({ type: "address", address: "品川駅" });
    expect(
      parseSearchParams({ origin: { latLng: { latitude: 35.6, longitude: 139.7 } }, destination: "新宿" }).origin,
    ).toEqual({ type: "latLng", latitude: 35.6, longitude: 139.7 });
    expect(parseSearchParams({ origin: { address: "品川駅" }, destination: "新宿" }).origin).toEqual({
      type: "address",
      address: "品川駅",
    });
  });
  it("UT-095: 目的地なし・出発地なしは INVALID_PARAMS（異常系）", () => {
    expect(() => parseSearchParams({ origin: "品川" })).toThrowError(ApiError);
    try {
      parseSearchParams({ destination: "新宿" });
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe("INVALID_PARAMS");
      expect((e as ApiError).status).toBe(400);
    }
  });
  it("UT-096: オフセット範囲外・非整数は INVALID_PARAMS（境界値）", () => {
    for (const bad of [-1, 181, 1.5, "10"]) {
      expect(() =>
        parseSearchParams({ origin: "品川", destination: "新宿", offsetMinutes: bad }),
      ).toThrowError(ApiError);
    }
    expect(parseSearchParams({ origin: "品川", destination: "新宿", offsetMinutes: 180 }).offsetMinutes).toBe(180);
    expect(parseSearchParams({ origin: "品川", destination: "新宿" }).offsetMinutes).toBe(0);
  });
  it("UT-097: 緯度経度の範囲外は出発地なし扱いで INVALID_PARAMS", () => {
    expect(() =>
      parseSearchParams({ origin: { type: "latLng", latitude: 123, longitude: 139 }, destination: "新宿" }),
    ).toThrowError(ApiError);
  });
  it("UT-098: ボディがオブジェクトでない場合は INVALID_PARAMS", () => {
    expect(() => parseSearchParams(null)).toThrowError(ApiError);
    expect(() => parseSearchParams("x")).toThrowError(ApiError);
  });
});

describe("fetchRoutes", () => {
  it("UT-099: 成功時は正規化済みルートを返し、ヘッダーにキーとマスクを付ける", async () => {
    const fetchFn = okFetch(MOCK_GOOGLE_RESPONSE);
    const routes = await fetchRoutes(latLngParams, { apiKey: "test-key", fetchFn });
    expect(routes).toHaveLength(3);
    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(ROUTES_ENDPOINT);
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe(FIELD_MASK);
  });
  it("UT-100: APIキー未設定は API_KEY_NOT_SET", async () => {
    const saved = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    try {
      await expect(fetchRoutes(latLngParams, { fetchFn: okFetch({}) })).rejects.toMatchObject({
        code: "API_KEY_NOT_SET",
        status: 503,
      });
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_API_KEY = saved;
    }
  });
  it("UT-101: 上流がHTTPエラーを返したら UPSTREAM_ERROR", async () => {
    const fetchFn = vi.fn(async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchRoutes(latLngParams, { apiKey: "k", fetchFn })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      status: 502,
    });
  });
  it("UT-102: 通信例外は UPSTREAM_ERROR（異常系）", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(fetchRoutes(latLngParams, { apiKey: "k", fetchFn })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
  it("UT-103: ルート0件は NOT_FOUND", async () => {
    await expect(
      fetchRoutes(latLngParams, { apiKey: "k", fetchFn: okFetch({ routes: [] }) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
  it("UT-104: パラメータ不正は INVALID_PARAMS", async () => {
    await expect(
      fetchRoutes({ ...latLngParams, destination: " " }, { apiKey: "k", fetchFn: okFetch({}) }),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(
      fetchRoutes({ ...latLngParams, offsetMinutes: 999 }, { apiKey: "k", fetchFn: okFetch({}) }),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });
});
