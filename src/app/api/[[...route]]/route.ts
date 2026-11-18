import { Hono } from "hono";
import { handle } from "hono/vercel";
import {
  ApiError,
  type NormalizedRoute,
  type RoutesApiResponseBody,
  type TransportMode,
} from "@/features/route-search/lib/types";
import { parseSearchParams, fetchRoutes } from "@/features/route-search/lib/google-client";
import { normalizeRoutes } from "@/features/route-search/lib/routes-normalize";
import { MOCK_GOOGLE_RESPONSE } from "@/features/route-search/lib/mock-data";
import {
  readSerpApiKey,
  fetchTransitRoutes,
  fetchFlightRoutes,
} from "@/features/route-search/lib/serpapi-client";
import { resolveAirportCode } from "@/features/route-search/lib/airports";
import { createCache, cacheKeyFor } from "@/lib/cache";
import { computeDepartureIso } from "@/features/route-search/lib/time";

/** サーバー側キャッシュ（同一条件60秒）。プロセス内メモリのみ */
const routeCache = createCache<RoutesApiResponseBody>(60_000);

/** エラー応答（JSON）を組み立てる */
function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** API アプリケーション（Hono）。/api 配下のルーティングを担う */
const app = new Hono().basePath("/api");

// 想定外の例外は握りつぶさず、そのまま伝播させる（従来の Route Handler と同じ契約）
app.onError((err) => {
  throw err;
});

/** GET /api/config: どの API キーが設定済みかを返す（キー自体は返さない） */
app.get("/config", (c) => {
  return c.json({
    google: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    serpapi: Boolean(readSerpApiKey()),
  });
});

/**
 * POST /api/routes
 * - 移動手段（modes）ごとに取得元を使い分ける: 電車・バス／飛行機は SerpApi、車／徒歩は Google Routes API
 * - キーはサーバー側環境変数のみ。未設定の手段は、他に手段があれば警告として返し、単独なら 503
 */
app.post("/routes", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
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
  const departureDate = new Date(departureTime);
  const isMock = (body as Record<string, unknown>)?.mock === true;

  if (isMock) {
    return c.json({
      routes: normalizeRoutes(MOCK_GOOGLE_RESPONSE, "transit"),
      source: "mock",
      cached: false,
      departureTime,
      usedSources: [],
      serpApiCalls: 0,
      warnings: [],
    } satisfies RoutesApiResponseBody);
  }

  const modes: TransportMode[] = params.modes ?? ["transit"];
  const key = cacheKeyFor({ ...params, modes });
  const hit = routeCache.get(key);
  if (hit) {
    return c.json({ ...hit, cached: true });
  }

  const warnings: string[] = [];
  const usedSources = new Set<"google" | "serpapi">();
  let serpApiCalls = 0;
  const routes: NormalizedRoute[] = [];
  const errorBox: { first: ApiError | null } = { first: null };
  const noteError = (e: unknown) => {
    if (errorBox.first) return;
    errorBox.first =
      e instanceof ApiError
        ? e
        : new ApiError("UPSTREAM_ERROR", "予期しないエラーが発生しました", 502);
  };

  const originText =
    params.origin.type === "address"
      ? params.origin.address
      : `${params.origin.latitude},${params.origin.longitude}`;
  const wantsSerpApi = modes.includes("transit") || modes.includes("flight");
  const serpApiKey = readSerpApiKey();

  if (wantsSerpApi) {
    if (!serpApiKey) {
      noteError(
        new ApiError(
          "SERPAPI_KEY_NOT_SET",
          "SerpApi の APIキーが未設定です。PC上の .env.local に SERPAPI_API_KEY を設定してください（手順は README のセットアップ）",
          503,
        ),
      );
      warnings.push("電車・バス／飛行機は SerpApi の APIキー未設定のため検索できませんでした");
    } else {
      if (modes.includes("transit")) {
        try {
          routes.push(
            ...(await fetchTransitRoutes(serpApiKey, originText, params.destination, departureDate)),
          );
          usedSources.add("serpapi");
          serpApiCalls += 1;
        } catch (e) {
          noteError(e);
          warnings.push("電車・バスの取得に失敗しました");
        }
      }
      if (modes.includes("flight")) {
        const fromCode = resolveAirportCode(originText);
        const toCode = resolveAirportCode(params.destination);
        if (!fromCode || !toCode) {
          warnings.push("飛行機は空港が特定できる地名（例：東京、大阪、福岡）でのみ検索できます");
        } else {
          try {
            routes.push(...(await fetchFlightRoutes(serpApiKey, fromCode, toCode, departureDate)));
            usedSources.add("serpapi");
            serpApiCalls += 1;
          } catch (e) {
            noteError(e);
            warnings.push("飛行機の取得に失敗しました");
          }
        }
      }
    }
  }

  const googleModes = modes.filter((m) => m === "drive" || m === "walk");
  if (googleModes.length > 0) {
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleKey) {
      noteError(
        new ApiError(
          "API_KEY_NOT_SET",
          "APIキーが未設定です。PC上の .env.local に GOOGLE_MAPS_API_KEY を設定してください（手順は README のセットアップ）",
          503,
        ),
      );
      warnings.push("車／徒歩は Google の APIキー未設定のため検索できませんでした");
    } else {
      for (const mode of googleModes) {
        try {
          routes.push(
            ...(await fetchRoutes(params, {
              apiKey: googleKey,
              travelMode: mode === "drive" ? "DRIVE" : "WALK",
            })),
          );
          usedSources.add("google");
        } catch (e) {
          noteError(e);
          if (!(e instanceof ApiError) || e.code !== "NOT_FOUND") {
            warnings.push(mode === "drive" ? "車の取得に失敗しました" : "徒歩の取得に失敗しました");
          }
        }
      }
    }
  }

  if (routes.length === 0) {
    if (errorBox.first) {
      return errorResponse(errorBox.first.code, errorBox.first.message, errorBox.first.status);
    }
    return errorResponse("NOT_FOUND", "条件に合うルートが見つかりませんでした", 404);
  }

  const source =
    usedSources.size > 1 ? "mixed" : usedSources.has("serpapi") ? "serpapi" : "google";
  const responseBody: RoutesApiResponseBody = {
    routes,
    source,
    cached: false,
    departureTime,
    usedSources: [...usedSources],
    serpApiCalls,
    warnings,
  };
  routeCache.set(key, responseBody);
  return c.json(responseBody);
});

/** GET /api 配下（Hono アプリへの委譲） */
export const GET = handle(app);

/** POST /api 配下（Hono アプリへの委譲） */
export const POST = handle(app);
