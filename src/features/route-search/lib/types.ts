/** アプリ全体で使う型定義 */

export type SortMode = "recommend" | "fare" | "transfers" | "duration";

/** 移動手段（チェックボックスで複数選択する） */
export type TransportMode = "transit" | "flight" | "drive" | "walk";

export type OriginInput =
  | { type: "latLng"; latitude: number; longitude: number }
  | { type: "address"; address: string };

export interface SearchParams {
  origin: OriginInput;
  destination: string;
  /** 今から何分後に出発するか（0〜180） */
  offsetMinutes: number;
  /** 検索する移動手段。未指定のときは電車・バスのみ */
  modes?: TransportMode[];
}

export interface RouteSegment {
  kind: "transit" | "walk" | "flight" | "drive";
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
  /** 便名（flightのみ） */
  flightNumber?: string;
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
  /** この候補の移動手段 */
  mode?: TransportMode;
  /** 総合おすすめ用スコア（小さいほど上位）。scoreRoutes が付与 */
  score?: number;
}

export type ApiErrorCode =
  | "API_KEY_NOT_SET"
  | "SERPAPI_KEY_NOT_SET"
  | "UPSTREAM_ERROR"
  | "NOT_FOUND"
  | "INVALID_PARAMS"
  | "LIMIT_REACHED";

/** APIエラーを表す例外（エラーコードとHTTPステータスを持つ） */
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
  source: "google" | "mock" | "serpapi" | "mixed";
  cached: boolean;
  departureTime: string;
  /** 実際に使った取得元（利用カウンター加算用） */
  usedSources?: ("google" | "serpapi")[];
  /** SerpApi の消費件数（エンジン呼び出し回数） */
  serpApiCalls?: number;
  /** 検索できなかった手段などの注意 */
  warnings?: string[];
}
