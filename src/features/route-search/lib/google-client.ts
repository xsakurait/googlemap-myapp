import { ApiError, type NormalizedRoute, type OriginInput, type SearchParams } from "./types";
import { computeDepartureIso } from "./time";
import { normalizeRoutes } from "./routes-normalize";

export const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * フィールドマスク（必要最小限）。
 * SKU判定は「どのフィールドを要求したか」ではなく「Pro/Enterprise機能を使ったか」で決まる。
 * 本アプリは中間地点・optimizeWaypointOrder・TRAFFIC_AWARE系・location modifiers・
 * 二輪・通行料計算のいずれも使わないため、transitDetails / transitFare を含めても
 * Essentials SKU（無料枠 月10,000件）の範囲になる（2026-11-17 Google公式SKU詳細で確認）。
 */
export const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.travelAdvisories.transitFare",
  "routes.localizedValues",
  "routes.legs.startTime",
  "routes.legs.endTime",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.localizedValues",
  "routes.legs.steps.transitDetails",
].join(",");

/** リクエストボディ（内部APIのJSON）を SearchParams に検証・変換する */
export function parseSearchParams(body: unknown): SearchParams {
  if (!body || typeof body !== "object") {
    throw new ApiError("INVALID_PARAMS", "リクエストボディが不正です", 400);
  }
  const b = body as Record<string, unknown>;
  const destination = typeof b.destination === "string" ? b.destination.trim() : "";
  if (!destination) {
    throw new ApiError("INVALID_PARAMS", "目的地は必須です", 400);
  }
  let offsetMinutes = 0;
  if (b.offsetMinutes !== undefined) {
    if (typeof b.offsetMinutes !== "number" || !Number.isInteger(b.offsetMinutes) || b.offsetMinutes < 0 || b.offsetMinutes > 180) {
      throw new ApiError("INVALID_PARAMS", "出発オフセットは0〜180分の整数で指定してください", 400);
    }
    offsetMinutes = b.offsetMinutes;
  }
  const origin = parseOrigin(b.origin);
  if (!origin) {
    throw new ApiError("INVALID_PARAMS", "出発地（緯度経度または住所）が必要です", 400);
  }
  return { origin, destination, offsetMinutes };
}

function parseOrigin(raw: unknown): OriginInput | null {
  if (typeof raw === "string") {
    const address = raw.trim();
    return address ? { type: "address", address } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "latLng" || o.latLng !== undefined) {
    const ll = (o.type === "latLng" ? o : o.latLng) as Record<string, unknown>;
    const latitude = ll.latitude;
    const longitude = ll.longitude;
    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    ) {
      return { type: "latLng", latitude, longitude };
    }
    return null;
  }
  if (o.type === "address" && typeof o.address === "string" && o.address.trim()) {
    return { type: "address", address: o.address.trim() };
  }
  if (typeof o.address === "string" && o.address.trim()) {
    return { type: "address", address: o.address.trim() };
  }
  return null;
}

function waypoint(origin: OriginInput): Record<string, unknown> {
  if (origin.type === "latLng") {
    return { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } };
  }
  return { address: origin.address };
}

/** Google Routes API へ送るリクエストボディを組み立てる */
export function buildRequestBody(params: SearchParams, now: Date = new Date()): Record<string, unknown> {
  return {
    origin: waypoint(params.origin),
    destination: { address: params.destination },
    travelMode: "TRANSIT",
    computeAlternativeRoutes: true,
    languageCode: "ja-JP",
    units: "METRIC",
    departureTime: computeDepartureIso(now, params.offsetMinutes),
  };
}

export interface FetchRoutesOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  now?: Date;
}

/**
 * Routes API を1回だけ呼び、正規化済みルートを返す。
 * 失敗時は code を持つ ApiError を throw する。
 */
export async function fetchRoutes(
  params: SearchParams,
  opts: FetchRoutesOptions = {},
): Promise<NormalizedRoute[]> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new ApiError("API_KEY_NOT_SET", "APIキーが未設定です。.env.local に GOOGLE_MAPS_API_KEY を設定してください", 503);
  }
  if (!params.destination.trim()) {
    throw new ApiError("INVALID_PARAMS", "目的地は必須です", 400);
  }
  if (!Number.isInteger(params.offsetMinutes) || params.offsetMinutes < 0 || params.offsetMinutes > 180) {
    throw new ApiError("INVALID_PARAMS", "出発オフセットは0〜180分の整数で指定してください", 400);
  }
  const fetchFn = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(buildRequestBody(params, opts.now)),
    });
  } catch {
    throw new ApiError("UPSTREAM_ERROR", "Google Routes API への接続に失敗しました", 502);
  }
  if (!res.ok) {
    throw new ApiError("UPSTREAM_ERROR", `Google Routes API がエラーを返しました（HTTP ${res.status}）`, 502);
  }
  const json: unknown = await res.json();
  const routes = normalizeRoutes(json);
  if (routes.length === 0) {
    throw new ApiError("NOT_FOUND", "条件に合うルートが見つかりませんでした", 404);
  }
  return routes;
}
