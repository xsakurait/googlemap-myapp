import { ApiError, type NormalizedRoute } from "@/features/route-search/lib/types";
import { parseSearchParams, fetchRoutes } from "@/features/route-search/lib/google-client";
import { normalizeRoutes } from "@/features/route-search/lib/routes-normalize";
import { MOCK_GOOGLE_RESPONSE } from "@/features/route-search/lib/mock-data";
import { createCache, cacheKeyFor } from "@/lib/cache";
import { computeDepartureIso } from "@/features/route-search/lib/time";

/** サーバー側キャッシュ（同一条件60秒）。プロセス内メモリのみ */
const routeCache = createCache<NormalizedRoute[]>(60_000);

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * POST /api/routes
 * - APIキーはサーバー側環境変数 GOOGLE_MAPS_API_KEY のみ
 * - キー未設定時: mock=true ならモック応答、それ以外は 503 API_KEY_NOT_SET
 * - 検索1回 = Routes API 1リクエスト（代替ルートは同一リクエスト内）
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_PARAMS", "リクエストボディがJSONではありません", 400);
  }

  let params;
  try {
    params = parseSearchParams(body);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.code, e.message, e.status);
    throw e;
  }

  const departureTime = computeDepartureIso(new Date(), params.offsetMinutes);
  const isMock = (body as Record<string, unknown>)?.mock === true;

  if (isMock) {
    return Response.json({
      routes: normalizeRoutes(MOCK_GOOGLE_RESPONSE),
      source: "mock",
      cached: false,
      departureTime,
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return errorResponse(
      "API_KEY_NOT_SET",
      "APIキーが未設定です。PC上の .env.local に GOOGLE_MAPS_API_KEY を設定してください（手順は docs/06_セットアップ手順.md）",
      503,
    );
  }

  const key = cacheKeyFor(params);
  const hit = routeCache.get(key);
  if (hit) {
    return Response.json({ routes: hit, source: "google", cached: true, departureTime });
  }

  try {
    const routes = await fetchRoutes(params, { apiKey });
    routeCache.set(key, routes);
    return Response.json({ routes, source: "google", cached: false, departureTime });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.code, e.message, e.status);
    return errorResponse("UPSTREAM_ERROR", "予期しないエラーが発生しました", 502);
  }
}
