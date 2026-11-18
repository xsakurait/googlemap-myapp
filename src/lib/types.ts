/** アプリ全体で使う型定義 */

export type SortMode = "recommend" | "fare" | "transfers" | "duration";

export type OriginInput =
  | { type: "latLng"; latitude: number; longitude: number }
  | { type: "address"; address: string };

export interface SearchParams {
  origin: OriginInput;
  destination: string;
  /** 今から何分後に出発するか（0〜180） */
  offsetMinutes: number;
}

export interface RouteSegment {
  kind: "transit" | "walk";
  /** 路線名（transitのみ） */
  lineName?: string;
  /** 車両種別コード 例: SUBWAY / TRAIN（transitのみ） */
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  /** ISO 8601 */
  departureTime?: string;
  /** ISO 8601 */
  arrivalTime?: string;
  /** 停車駅数（transitのみ） */
  stopCount?: number;
  durationSeconds: number;
  distanceMeters?: number;
}

export interface NormalizedRoute {
  id: string;
  /** 運賃（円）。取得できなかった場合は null */
  fareYen: number | null;
  currencyCode?: string;
  durationSeconds: number;
  distanceMeters: number | null;
  /** ISO 8601（legs の startTime） */
  departureTime: string | null;
  /** ISO 8601（legs の endTime） */
  arrivalTime: string | null;
  /** 乗り換え回数 = TRANSITステップ数 - 1（下限0） */
  transfers: number;
  segments: RouteSegment[];
  /** 総合おすすめ用スコア（小さいほど上位）。scoreRoutes が付与 */
  score?: number;
}

export type ApiErrorCode =
  | "API_KEY_NOT_SET"
  | "UPSTREAM_ERROR"
  | "NOT_FOUND"
  | "INVALID_PARAMS"
  | "LIMIT_REACHED";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface RoutesApiResponseBody {
  routes: NormalizedRoute[];
  source: "google" | "mock";
  cached: boolean;
  departureTime: string;
}
