import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readSerpApiKey,
  parseClockTime,
  parseFlightTime,
  parseDirectionsResponse,
  parseFlightsResponse,
  fetchTransitRoutes,
  fetchFlightRoutes,
} from "@/features/route-search/lib/serpapi-client";
import { ApiError } from "@/features/route-search/lib/types";

const DIRECTIONS_FIXTURE = {
  directions: [
    {
      trips: [
        {
          duration: 1500,
          fare: { price: 230, currency: "JPY" },
          details: [
            { type: "walk", duration: 300 },
            {
              type: "transit",
              duration: 1200,
              line: "JR山手線",
              transit_type: "TRAIN",
              departure_station: { name: "品川" },
              arrival_station: { name: "新宿" },
              departure_time: "8:05 AM",
              arrival_time: "8:25 AM",
              num_stops: 8,
            },
          ],
        },
      ],
    },
  ],
};

const FLIGHTS_FIXTURE = {
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

describe("readSerpApiKey", () => {
  it("UT-150: 設定されていれば値を返し、未設定・空白は null", () => {
    expect(readSerpApiKey({ SERPAPI_API_KEY: "abc" } as NodeJS.ProcessEnv)).toBe("abc");
    expect(readSerpApiKey({} as NodeJS.ProcessEnv)).toBeNull();
    expect(readSerpApiKey({ SERPAPI_API_KEY: "  " } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("parseClockTime / parseFlightTime", () => {
  const base = new Date(2026, 10, 19, 0, 0, 0);
  it("UT-151: AM/PM を解釈する", () => {
    expect(parseClockTime("8:05 AM", base)).toBe("2026-11-19T08:05:00+09:00");
    expect(parseClockTime("12:00 PM", base)).toBe("2026-11-19T12:00:00+09:00");
    expect(parseClockTime("12:00 AM", base)).toBe("2026-11-19T00:00:00+09:00");
    expect(parseClockTime("13:40", base)).toBe("2026-11-19T13:40:00+09:00");
  });
  it("UT-152: 解釈できない値は null", () => {
    expect(parseClockTime("abc", base)).toBeNull();
    expect(parseClockTime(123, base)).toBeNull();
    expect(parseFlightTime("2026-11-19 08:05")).toBe("2026-11-19T08:05:00+09:00");
    expect(parseFlightTime("x")).toBeNull();
    expect(parseFlightTime(null)).toBeNull();
  });
});

describe("parseDirectionsResponse", () => {
  it("UT-153: trips と details を正規化する（運賃・区間・乗り換え）", () => {
    const routes = parseDirectionsResponse(DIRECTIONS_FIXTURE, new Date(2026, 10, 19));
    expect(routes).toHaveLength(1);
    expect(routes[0].mode).toBe("transit");
    expect(routes[0].fareYen).toBe(230);
    expect(routes[0].durationSeconds).toBe(1500);
    expect(routes[0].transfers).toBe(0);
    expect(routes[0].segments).toHaveLength(2);
    expect(routes[0].segments[1].lineName).toBe("JR山手線");
    expect(routes[0].segments[1].departureStop).toBe("品川");
    expect(routes[0].departureTime).toBe("2026-11-19T08:05:00+09:00");
  });
  it("UT-154: directions が無ければ空配列", () => {
    expect(parseDirectionsResponse({}, new Date())).toEqual([]);
  });
});

describe("parseFlightsResponse", () => {
  it("UT-155: best_flights を正規化する", () => {
    const routes = parseFlightsResponse(FLIGHTS_FIXTURE);
    expect(routes).toHaveLength(1);
    expect(routes[0].mode).toBe("flight");
    expect(routes[0].fareYen).toBe(12800);
    expect(routes[0].durationSeconds).toBe(125 * 60);
    expect(routes[0].segments[0].flightNumber).toBe("NH 241");
    expect(routes[0].departureTime).toBe("2026-11-19T08:05:00+09:00");
  });
  it("UT-156: flights が無ければ空配列", () => {
    expect(parseFlightsResponse({})).toEqual([]);
  });
});

describe("fetch wrappers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("UT-157: fetchTransitRoutes は directions を取得する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(DIRECTIONS_FIXTURE), { status: 200 })),
    );
    const routes = await fetchTransitRoutes("key", "品川駅", "新宿駅", new Date(2026, 10, 19));
    expect(routes).toHaveLength(1);
  });
  it("UT-158: fetchFlightRoutes は flights を取得する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FLIGHTS_FIXTURE), { status: 200 })),
    );
    const routes = await fetchFlightRoutes("key", "HND", "FUK", new Date(2026, 10, 19));
    expect(routes).toHaveLength(1);
  });
  it("UT-159: HTTP エラーは ApiError 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(fetchTransitRoutes("key", "a", "b", new Date())).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      status: 502,
    });
  });
  it("UT-160: 接続失敗は ApiError 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    await expect(fetchFlightRoutes("key", "HND", "FUK", new Date())).rejects.toBeInstanceOf(ApiError);
  });
  it("UT-161: 応答 JSON の error は ApiError 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Invalid API key" }), { status: 200 })),
    );
    await expect(fetchTransitRoutes("key", "a", "b", new Date())).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});

describe("parse variants（欠けたフィールドへの耐性）", () => {
  it("UT-162: directions の欠損パターンを処理する", () => {
    const json = {
      directions: [
        "not-a-record",
        { trips: "nope" },
        {
          trips: [
            { details: [] },
            {
              // duration と fare が無い trip: 合計時間は details の合算、運賃は null
              details: [
                { type: "walk", duration: 60, distance: 80 },
                {
                  type: "transit",
                  duration: 600,
                  departure_station_name: "駅A",
                  arrival_station_name: "駅B",
                  stops: 3,
                },
                "junk",
              ],
            },
          ],
        },
      ],
    };
    const routes = parseDirectionsResponse(json, new Date(2026, 10, 19));
    expect(routes).toHaveLength(1);
    expect(routes[0].fareYen).toBeNull();
    expect(routes[0].durationSeconds).toBe(660);
    expect(routes[0].segments[0].distanceMeters).toBe(80);
    expect(routes[0].segments[1].departureStop).toBe("駅A");
    expect(routes[0].segments[1].stopCount).toBe(3);
    expect(routes[0].segments[1].lineName).toBeUndefined();
    expect(routes[0].departureTime).toBeNull();
  });

  it("UT-163: flights の欠損パターンを処理する", () => {
    const json = {
      other_flights: [
        "junk",
        { flights: [] },
        {
          flights: [
            "junk",
            {
              departure_airport: { id: "HND", time: "bad" },
              arrival_airport: { name: "Fukuoka" },
              duration: 100,
            },
          ],
        },
      ],
    };
    const routes = parseFlightsResponse(json);
    expect(routes).toHaveLength(1);
    expect(routes[0].durationSeconds).toBe(100 * 60);
    expect(routes[0].fareYen).toBeNull();
    expect(routes[0].segments[0].departureStop).toBe("HND");
    expect(routes[0].segments[0].departureTime).toBeUndefined();
    expect(routes[0].segments[0].lineName).toBeUndefined();
  });
});

describe("parseFlightsResponse variants 2", () => {
  it("UT-164: 空港情報なし・total_duration 0・到着は id のみのケース", () => {
    const json = {
      best_flights: [
        { total_duration: 0, price: 5000, flights: [{ duration: 90 }] },
        {
          flights: [
            {
              departure_airport: { name: "Tokyo Haneda" },
              arrival_airport: { id: "FUK" },
              duration: 10,
              airline: "ANA",
              flight_number: "NH 1",
            },
          ],
        },
      ],
    };
    const routes = parseFlightsResponse(json);
    expect(routes).toHaveLength(2);
    expect(routes[0].durationSeconds).toBe(90 * 60);
    expect(routes[0].segments[0].departureStop).toBeUndefined();
    expect(routes[0].segments[0].arrivalStop).toBeUndefined();
    expect(routes[0].departureTime).toBeNull();
    expect(routes[1].segments[0].arrivalStop).toBe("FUK");
  });
});

describe("parse variants 3（残りの分岐）", () => {
  it("UT-165: PM の時刻・details の欠損パターンを処理する", () => {
    expect(parseClockTime("1:05 PM", new Date(2026, 10, 19))).toBe("2026-11-19T13:05:00+09:00");
    const json = {
      directions: [
        {
          trips: [
            "junk-trip",
            {},
            {
              details: [
                { type: "walk" },
                { travel_mode: "transit", duration: 10 },
                { duration: 20, departure_station: {}, arrival_station: {} },
              ],
            },
          ],
        },
      ],
    };
    const routes = parseDirectionsResponse(json, new Date(2026, 10, 19));
    expect(routes).toHaveLength(1);
    expect(routes[0].segments).toHaveLength(3);
    expect(routes[0].segments[0].durationSeconds).toBe(0);
    expect(routes[0].segments[2].departureStop).toBeUndefined();
  });

  it("UT-166: flights の欠損パターンを処理する", () => {
    const json = {
      best_flights: [
        { flights: "nope" },
        {},
        { flights: [{ airline: "ANA" }] },
      ],
    };
    const routes = parseFlightsResponse(json);
    expect(routes).toHaveLength(1);
    expect(routes[0].segments[0].durationSeconds).toBe(0);
  });

  it("UT-167: JSON がオブジェクトでない応答は ApiError 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("123", { status: 200 })),
    );
    await expect(fetchTransitRoutes("key", "a", "b", new Date())).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      status: 502,
    });
  });
});

describe("parseFlightsResponse variants 3", () => {
  it("UT-168: 空港レコードはあるが name も id も無いケース", () => {
    const routes = parseFlightsResponse({
      best_flights: [
        { flights: [{ departure_airport: {}, arrival_airport: {}, duration: 30 }] },
      ],
    });
    expect(routes).toHaveLength(1);
    expect(routes[0].segments[0].departureStop).toBeUndefined();
    expect(routes[0].segments[0].arrivalStop).toBeUndefined();
  });
});
