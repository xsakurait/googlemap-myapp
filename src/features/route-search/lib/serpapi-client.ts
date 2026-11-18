/** SerpApi クライアント: 電車・バス（Google Maps Directions）と飛行機（Google Flights）を取得する */

import { ApiError, type NormalizedRoute, type RouteSegment } from "./types";

export const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

/** SerpApi の無料枠（Free プラン 月250件）のガード値 */
export const SERPAPI_LIMITS = { warnAt: 200, stopAt: 250 } as const;

/** 環境変数から SerpApi キーを読む（未設定なら null） */
export function readSerpApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.SERPAPI_API_KEY;
  return key && key.trim() !== "" ? key : null;
}

/** "8:05 AM" のような時刻文字列を、出発日と組み合わせて ISO 文字列にする。解釈できなければ null */
export function parseClockTime(value: unknown, baseDate: Date): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(baseDate);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${ymd}T${hh}:${mm}:00+09:00`;
}

/** "2026-11-19 08:05" 形式（Google Flights の時刻）を ISO 文字列にする。解釈できなければ null */
export function parseFlightTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`;
}

type JsonRecord = Record<string, unknown>;

/** 値がオブジェクトなら返す */
function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

/** 数値として読む（読めなければ null） */
function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 文字列として読む（読めなければ null） */
function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** SerpApi へ GET して JSON を返す。失敗時は ApiError（502） */
async function fetchSerpApi(params: URLSearchParams): Promise<JsonRecord> {
  let res: Response;
  try {
    res = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
  } catch {
    throw new ApiError("UPSTREAM_ERROR", "SerpApi へ接続できませんでした", 502);
  }
  if (!res.ok) {
    throw new ApiError("UPSTREAM_ERROR", `SerpApi がエラーを返しました (HTTP ${res.status})`, 502);
  }
  const json: unknown = await res.json();
  const record = asRecord(json);
  if (!record) throw new ApiError("UPSTREAM_ERROR", "SerpApi の応答形式が不正です", 502);
  if (asString(record.error)) {
    throw new ApiError("UPSTREAM_ERROR", `SerpApi エラー: ${asString(record.error)}`, 502);
  }
  return record;
}

/** 電車・バスのルートを取得する（Google Maps Directions エンジン） */
export async function fetchTransitRoutes(
  apiKey: string,
  originText: string,
  destinationText: string,
  departureDate: Date,
): Promise<NormalizedRoute[]> {
  const params = new URLSearchParams({
    engine: "google_maps_directions",
    start_addr: originText,
    end_addr: destinationText,
    travel_mode: "3",
    hl: "ja",
    api_key: apiKey,
  });
  const json = await fetchSerpApi(params);
  return parseDirectionsResponse(json, departureDate);
}

/** Directions の応答を正規化する */
export function parseDirectionsResponse(json: JsonRecord, departureDate: Date): NormalizedRoute[] {
  const directions = Array.isArray(json.directions) ? json.directions : [];
  const routes: NormalizedRoute[] = [];
  directions.forEach((directionRaw, di) => {
    const direction = asRecord(directionRaw);
    if (!direction) return;
    const trips = Array.isArray(direction.trips) ? direction.trips : [];
    trips.forEach((tripRaw, ti) => {
      const trip = asRecord(tripRaw);
      if (!trip) return;
      const details = Array.isArray(trip.details) ? trip.details : [];
      const segments: RouteSegment[] = [];
      let totalSeconds = 0;
      for (const detailRaw of details) {
        const detail = asRecord(detailRaw);
        if (!detail) continue;
        const duration = asNumber(detail.duration) ?? 0;
        totalSeconds += duration;
        const typeText = (asString(detail.type) ?? asString(detail.travel_mode) ?? "").toLowerCase();
        if (typeText.includes("walk")) {
          segments.push({
            kind: "walk",
            durationSeconds: duration,
            distanceMeters: asNumber(detail.distance) ?? undefined,
          });
          continue;
        }
        const depStation = asRecord(detail.departure_station);
        const arrStation = asRecord(detail.arrival_station);
        segments.push({
          kind: "transit",
          lineName:
            asString(detail.line) ?? asString(detail.transit_line) ?? asString(detail.name) ?? undefined,
          vehicleType: asString(detail.transit_type) ?? undefined,
          departureStop:
            asString(detail.departure_station_name) ?? (depStation ? asString(depStation.name) ?? undefined : undefined),
          arrivalStop:
            asString(detail.arrival_station_name) ?? (arrStation ? asString(arrStation.name) ?? undefined : undefined),
          departureTime: parseClockTime(detail.departure_time, departureDate) ?? undefined,
          arrivalTime: parseClockTime(detail.arrival_time, departureDate) ?? undefined,
          stopCount: asNumber(detail.num_stops) ?? asNumber(detail.stops) ?? undefined,
          durationSeconds: duration,
        });
      }
      if (segments.length === 0) return;
      const fare = asRecord(trip.fare);
      const farePrice = fare ? asNumber(fare.price) : asNumber(trip.price);
      const transitCount = segments.filter((s) => s.kind === "transit").length;
      routes.push({
        id: `serpapi-transit-${di}-${ti}`,
        fareYen: farePrice,
        durationSeconds: asNumber(trip.duration) ?? totalSeconds,
        distanceMeters: null,
        departureTime: segments.find((s) => s.departureTime)?.departureTime ?? null,
        arrivalTime: [...segments].reverse().find((s) => s.arrivalTime)?.arrivalTime ?? null,
        transfers: Math.max(0, transitCount - 1),
        segments,
        mode: "transit",
      });
    });
  });
  return routes;
}

/** 飛行機のルートを取得する（Google Flights エンジン） */
export async function fetchFlightRoutes(
  apiKey: string,
  fromCode: string,
  toCode: string,
  departureDate: Date,
): Promise<NormalizedRoute[]> {
  const date = departureDate.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: fromCode,
    arrival_id: toCode,
    outbound_date: date,
    type: "2",
    currency: "JPY",
    hl: "ja",
    api_key: apiKey,
  });
  const json = await fetchSerpApi(params);
  return parseFlightsResponse(json);
}

/** Flights の応答を正規化する */
export function parseFlightsResponse(json: JsonRecord): NormalizedRoute[] {
  const groups = [
    ...(Array.isArray(json.best_flights) ? json.best_flights : []),
    ...(Array.isArray(json.other_flights) ? json.other_flights : []),
  ];
  const routes: NormalizedRoute[] = [];
  groups.forEach((groupRaw, gi) => {
    const group = asRecord(groupRaw);
    if (!group) return;
    const legs = Array.isArray(group.flights) ? group.flights : [];
    const segments: RouteSegment[] = [];
    let legSeconds = 0;
    for (const legRaw of legs) {
      const leg = asRecord(legRaw);
      if (!leg) continue;
      const dep = asRecord(leg.departure_airport);
      const arr = asRecord(leg.arrival_airport);
      const duration = (asNumber(leg.duration) ?? 0) * 60;
      legSeconds += duration;
      segments.push({
        kind: "flight",
        lineName: asString(leg.airline) ?? undefined,
        flightNumber: asString(leg.flight_number) ?? undefined,
        departureStop: dep ? (asString(dep.name) ?? asString(dep.id) ?? undefined) : undefined,
        arrivalStop: arr ? (asString(arr.name) ?? asString(arr.id) ?? undefined) : undefined,
        departureTime: parseFlightTime(dep?.time) ?? undefined,
        arrivalTime: parseFlightTime(arr?.time) ?? undefined,
        durationSeconds: duration,
      });
    }
    if (segments.length === 0) return;
    routes.push({
      id: `serpapi-flight-${gi}`,
      fareYen: asNumber(group.price),
      durationSeconds: (asNumber(group.total_duration) ?? 0) * 60 || legSeconds,
      distanceMeters: null,
      departureTime: segments[0].departureTime ?? null,
      arrivalTime: segments[segments.length - 1].arrivalTime ?? null,
      transfers: segments.length - 1,
      segments,
      mode: "flight",
    });
  });
  return routes;
}
