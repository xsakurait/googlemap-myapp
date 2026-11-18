"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiErrorCode,
  NormalizedRoute,
  OriginInput,
  RoutesApiResponseBody,
  SearchParams,
  SortMode,
  TransportMode,
} from "@/features/route-search/lib/types";
import { SERPAPI_LIMITS } from "@/features/route-search/lib/serpapi-client";
import { sortRoutes, computeBadges } from "@/features/route-search/lib/ranking";
import { ERROR_MESSAGES } from "@/features/route-search/lib/error-messages";
import { formatHm, formatDurationSecondsJa } from "@/features/route-search/lib/time";
import {
  loadUsage,
  serializeUsage,
  checkLimit,
  increment,
  monthKey,
  type UsageState,
  DEFAULT_USAGE_LIMITS,
} from "@/features/route-search/lib/usage";
import { getSupabaseClient, ensureAnonymousSession } from "@/lib/supabase";
import {
  loadUserData,
  addHistory as addRemoteHistory,
  saveSettings as saveRemoteSettings,
  incrementUsage as incrementRemoteUsage,
} from "@/features/route-search/lib/user-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LS_ORIGIN = "tra.originText";
const LS_SERPAPI_USAGE = "tra.usage.serpapi";
const LS_USAGE = "tra.usage";
const LS_HISTORY = "tra.history";
const LS_SETTINGS = "tra.settings";

interface HistoryItem {
  destination: string;
  originLabel: string;
  origin: OriginInput;
  offsetMinutes: number;
  sortMode: SortMode;
  searchedAt: string;
}

interface Settings {
  warnAt: number;
  stopAt: number;
}

type GpsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; latitude: number; longitude: number; accuracy: number }
  | { status: "denied"; message: string };


/** 移動手段の表示名 */
const MODE_LABELS: Record<TransportMode, string> = {
  transit: "電車・バス",
  flight: "飛行機",
  drive: "車",
  walk: "徒歩",
};

const SEGMENT_CLASS = "border-t border-dashed border-slate-200 py-1.5 text-sm";

/** 検索画面の対話部分（クライアントコンポーネント） */
export function RouteSearchApp() {
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [originMode, setOriginMode] = useState<"gps" | "manual">("gps");
  const [originText, setOriginText] = useState("");
  const [destination, setDestination] = useState("");
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("recommend");
  const [mockMode, setMockMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [result, setResult] = useState<RoutesApiResponseBody | null>(null);
  const [usage, setUsage] = useState<UsageState>({ month: "", count: 0 });
  const [serpUsage, setSerpUsage] = useState<UsageState>({ month: "", count: 0 });
  const serpUsageRef = useRef(serpUsage);
  serpUsageRef.current = serpUsage;
  const [modes, setModes] = useState<Record<TransportMode, boolean>>({
    transit: true,
    flight: false,
    drive: false,
    walk: false,
  });
  const [apiConfig, setApiConfig] = useState<{ google: boolean; serpapi: boolean } | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_USAGE_LIMITS);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const usageRef = useRef(usage);
  usageRef.current = usage;
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;
  const remoteRef = useRef<{ client: SupabaseClient; userId: string } | null>(null);

  // 初期化：localStorage 読み込み
  useEffect(() => {
    setOriginText(localStorage.getItem(LS_ORIGIN) ?? "");
    setUsage(loadUsage(localStorage.getItem(LS_USAGE), new Date()));
    setSerpUsage(loadUsage(localStorage.getItem(LS_SERPAPI_USAGE), new Date()));
    void fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: { google: boolean; serpapi: boolean }) => setApiConfig(cfg))
      .catch(() => {});
    try {
      const h = JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]") as HistoryItem[];
      if (Array.isArray(h)) setHistory(h.slice(0, 10));
    } catch {
      setHistory([]);
    }
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS) ?? "null") as Settings | null;
      if (s && typeof s.warnAt === "number" && typeof s.stopAt === "number") setSettings(s);
    } catch {
      /* 既定値のまま */
    }
    // Supabase が設定されていれば、匿名認証でユーザーデータを読み込む（失敗時は localStorage のまま）。
    void (async () => {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const userId = await ensureAnonymousSession(client);
        remoteRef.current = { client, userId };
        const data = await loadUserData(client);
        setHistory(
          data.history.map((h) => ({
            destination: h.destination,
            originLabel: h.origin,
            origin: { type: "address", address: h.origin } as OriginInput,
            offsetMinutes: 0,
            sortMode: "recommend" as SortMode,
            searchedAt: "",
          })),
        );
        if (data.settings) {
          setSettings({ warnAt: data.settings.warnAt, stopAt: data.settings.stopAt });
          setSortMode(data.settings.defaultMode);
        }
        const month = monthKey(new Date());
        const remoteCount = data.usage[month];
        if (remoteCount !== undefined) setUsage({ month, count: remoteCount });
      } catch {
        /* Supabase が使えない場合は localStorage の表示のまま */
      }
    })();
  }, []);

  const requestGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps({ status: "denied", message: "このブラウザは位置情報に対応していません" });
      setOriginMode("manual");
      return;
    }
    setGps({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          status: "ok",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setOriginMode("gps");
      },
      (err) => {
        setGps({
          status: "denied",
          message: `位置情報を取得できませんでした（${err.message}）。手入力に切り替えます`,
        });
        setOriginMode("manual");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  const limitStatus = checkLimit(usage, settings.warnAt, settings.stopAt);
  const stopped = limitStatus === "stop" && !mockMode;

  const currentOrigin = useCallback((): OriginInput | null => {
    if (originMode === "gps" && gps.status === "ok") {
      return { type: "latLng", latitude: gps.latitude, longitude: gps.longitude };
    }
    const text = originText.trim();
    return text ? { type: "address", address: text } : null;
  }, [originMode, gps, originText]);

  const originLabel = useCallback((): string => {
    if (originMode === "gps" && gps.status === "ok") return "現在地";
    return originText.trim();
  }, [originMode, gps, originText]);

  const runSearch = useCallback(
    async (params: SearchParams, label: string, mode: SortMode, useMock: boolean) => {
      setSearching(true);
      setErrorCode(null);
      setErrorDetail("");
      try {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, mock: useMock }),
        });
        const data = (await res.json()) as RoutesApiResponseBody & {
          error?: { code: string; message: string };
        };
        if (!res.ok || data.error) {
          setErrorCode(data.error?.code ?? "UPSTREAM_ERROR");
          setErrorDetail(data.error?.message ?? "");
          setResult(null);
          return;
        }
        setResult(data);
        // 実API・非キャッシュのときだけ、使った取得元の月間カウンターを加算
        if (!data.cached && data.usedSources?.includes("google")) {
          const next = increment(usageRef.current, new Date());
          setUsage(next);
          localStorage.setItem(LS_USAGE, serializeUsage(next));
          const remote = remoteRef.current;
          if (remote) {
            void incrementRemoteUsage(remote.client, remote.userId, next.month).catch(() => {});
          }
        }
        if (!data.cached && (data.serpApiCalls ?? 0) > 0) {
          let next = serpUsageRef.current;
          for (let i = 0; i < (data.serpApiCalls ?? 0); i++) {
            next = increment(next, new Date());
          }
          setSerpUsage(next);
          localStorage.setItem(LS_SERPAPI_USAGE, serializeUsage(next));
        }
        if (params.origin.type === "address") {
          localStorage.setItem(LS_ORIGIN, params.origin.address);
        }
        const item: HistoryItem = {
          destination: params.destination,
          originLabel: label,
          origin: params.origin,
          offsetMinutes: params.offsetMinutes,
          sortMode: mode,
          searchedAt: new Date().toISOString(),
        };
        setHistory((prev) => {
          const next = [item, ...prev].slice(0, 10);
          localStorage.setItem(LS_HISTORY, JSON.stringify(next));
          return next;
        });
        const remote = remoteRef.current;
        if (remote) {
          void addRemoteHistory(remote.client, remote.userId, label, params.destination).catch(
            () => {},
          );
        }
      } catch {
        setErrorCode("UPSTREAM_ERROR");
        setErrorDetail("サーバーへの接続に失敗しました");
        setResult(null);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const selectedModes = useCallback((): TransportMode[] => {
    return (Object.keys(modes) as TransportMode[]).filter((m) => modes[m]);
  }, [modes]);

  const handleSearch = useCallback(() => {
    if (stopped && (modes.drive || modes.walk)) {
      setErrorCode("LIMIT_REACHED");
      return;
    }
    const selected = selectedModes();
    if (selected.length === 0) {
      setErrorCode("INVALID_PARAMS");
      setErrorDetail("移動手段を1つ以上選んでください");
      return;
    }
    const origin = currentOrigin();
    if (!destination.trim()) {
      setErrorCode("INVALID_PARAMS");
      setErrorDetail("目的地を入力してください");
      return;
    }
    if (!origin) {
      setErrorCode("INVALID_PARAMS");
      setErrorDetail("出発地が未取得です。GPSの許可をするか、手入力してください");
      return;
    }
    void runSearch(
      { origin, destination: destination.trim(), offsetMinutes, modes: selected },
      originLabel(),
      sortMode,
      mockMode,
    );
  }, [stopped, currentOrigin, destination, offsetMinutes, originLabel, sortMode, mockMode, runSearch, modes, selectedModes]);

  const sortedRoutes = useMemo(
    () => (result ? sortRoutes(result.routes, sortMode) : []),
    [result, sortMode],
  );
  const badges = useMemo(() => computeBadges(sortedRoutes), [sortedRoutes]);

  const mapsLink = useCallback(
    (route: NormalizedRoute) => {
      const origin = currentOrigin();
      const o =
        origin?.type === "latLng"
          ? `${origin.latitude},${origin.longitude}`
          : encodeURIComponent(origin?.address ?? "");
      const d = encodeURIComponent(destination.trim());
      void route;
      return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=transit`;
    },
    [currentOrigin, destination],
  );

  const saveSettings = (next: Settings) => {
    setSettings(next);
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
    const remote = remoteRef.current;
    if (remote) {
      void saveRemoteSettings(remote.client, remote.userId, {
        defaultMode: sortModeRef.current,
        warnAt: next.warnAt,
        stopAt: next.stopAt,
      }).catch(() => {});
    }
  };

  return (
    <>
      {apiConfig && !apiConfig.serpapi && (
        <Alert className="my-3 border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription className="text-amber-900">
            お知らせ：電車・バス／飛行機の検索には SerpApi の APIキー設定が必要です（.env.local の
            SERPAPI_API_KEY）。キー未設定でも、車・徒歩（Google キー設定時）とモックデータは使えます。
          </AlertDescription>
        </Alert>
      )}

      <Card className="my-3 py-4">
        <CardContent className="space-y-1 px-4">
          <Label className="text-[13px]">出発地</Label>
          <div>
            <Button type="button" variant="link" className="h-auto px-0" onClick={requestGps}>
              📍 現在地から（GPS）
            </Button>
            {gps.status === "loading" && <p className="text-xs text-muted-foreground">取得中…</p>}
            {gps.status === "ok" && (
              <p className="text-xs text-muted-foreground">
                現在地を取得済み（精度 ±{gps.accuracy}m）
                {gps.accuracy > 1000 && " ※精度が低いため、駅がずれる可能性があります"}
              </p>
            )}
            {gps.status === "denied" && (
              <p className="text-xs text-muted-foreground">{gps.message}</p>
            )}
          </div>
          <RadioGroup
            value={originMode}
            onValueChange={(v) => setOriginMode(v as "gps" | "manual")}
            className="gap-2 pt-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="gps" id="origin-gps" />
              <Label htmlFor="origin-gps">現在地（GPS）を使う</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="manual" id="origin-manual" />
              <Label htmlFor="origin-manual">手入力する</Label>
            </div>
          </RadioGroup>
          {originMode === "manual" && (
            <Input
              type="text"
              value={originText}
              onChange={(e) => setOriginText(e.target.value)}
              placeholder="駅名または住所（例：品川駅）"
            />
          )}

          <Label htmlFor="destination" className="pt-2 text-[13px]">
            目的地（必須）
          </Label>
          <Input
            id="destination"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="駅名または住所（例：新宿駅）"
          />

          <div className="flex gap-2.5">
            <div className="flex-1">
              <Label htmlFor="offset" className="pt-2 text-[13px]">
                出発（今から何分後）
              </Label>
              <Input
                id="offset"
                type="number"
                min={0}
                max={180}
                value={offsetMinutes}
                onChange={(e) =>
                  setOffsetMinutes(Math.max(0, Math.min(180, Number(e.target.value) || 0)))
                }
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="sort" className="pt-2 text-[13px]">
                並び替え
              </Label>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger id="sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommend">総合おすすめ</SelectItem>
                  <SelectItem value="fare">安さ優先</SelectItem>
                  <SelectItem value="transfers">乗り換え少なさ優先</SelectItem>
                  <SelectItem value="duration">早さ優先</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Label className="pt-2 text-[13px]">移動手段</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {(Object.keys(MODE_LABELS) as TransportMode[]).map((m) => (
              <div key={m} className="flex items-center gap-2">
                <Checkbox
                  id={`mode-${m}`}
                  checked={modes[m]}
                  onCheckedChange={(v) => setModes((prev) => ({ ...prev, [m]: v === true }))}
                />
                <Label htmlFor={`mode-${m}`}>{MODE_LABELS[m]}</Label>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="mock"
              checked={mockMode}
              onCheckedChange={(v) => setMockMode(v === true)}
            />
            <Label htmlFor="mock">モックデータで試す（APIキー不要・カウンター対象外）</Label>
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-4 w-full bg-blue-600 text-[17px] font-bold hover:bg-blue-700"
            onClick={handleSearch}
            disabled={searching || (stopped && (modes.drive || modes.walk))}
          >
            {searching
              ? "検索中…"
              : stopped && (modes.drive || modes.walk)
                ? "今月の上限に達しました"
                : "検索する"}
          </Button>

          <p className="pt-2 text-xs text-muted-foreground">
            今月のAPI利用：{usage.count} 件（警告 {settings.warnAt} 件／停止 {settings.stopAt} 件）
            {limitStatus === "warn" && " ※無料枠の上限が近づいています"}
            {limitStatus === "stop" && " ※上限に達したため実データ検索を停止中です"}
          </p>
          <p className="text-xs text-muted-foreground">
            SerpApi 今月：{serpUsage.count} 件（警告 {SERPAPI_LIMITS.warnAt} 件／上限{" "}
            {SERPAPI_LIMITS.stopAt} 件）
            {serpUsage.count >= SERPAPI_LIMITS.stopAt && " ※無料枠の上限に達しています"}
          </p>
        </CardContent>
      </Card>

      {errorCode && (
        <Alert variant="destructive" className="my-3">
          <AlertTitle>
            {ERROR_MESSAGES[errorCode as ApiErrorCode] ?? "エラーが発生しました"}
          </AlertTitle>
          {errorDetail && <AlertDescription>{errorDetail}</AlertDescription>}
          {(errorCode === "API_KEY_NOT_SET" || errorCode === "SERPAPI_KEY_NOT_SET") && (
            <AlertDescription>
              手順：Google Cloudでプロジェクト作成 → 課金紐付け → Routes API有効化 → APIキー発行 →
              PC上の .env.local に GOOGLE_MAPS_API_KEY を設定 → アプリ再起動（手順は README のセットアップ）
            </AlertDescription>
          )}
        </Alert>
      )}

      {result?.warnings?.map((w, i) => (
        <Alert key={i} className="my-3 border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription className="text-amber-900">{w}</AlertDescription>
        </Alert>
      ))}

      {result?.source === "mock" && (
        <Alert className="my-3 border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription className="text-amber-900">
            モックデータ表示中です（実データではありません）。
          </AlertDescription>
        </Alert>
      )}
      {result?.cached && (
        <Alert className="my-3 border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription className="text-amber-900">
            キャッシュ結果を表示しています（API消費なし）。
          </AlertDescription>
        </Alert>
      )}

      {sortedRoutes.map((route, idx) => (
        <Card
          key={route.id}
          className={idx === 0 ? "my-3 border-2 border-blue-600 py-4" : "my-3 py-4"}
        >
          <CardContent className="px-4">
            <div>
              {route.mode && (
                <Badge variant="outline" className="mr-1.5">
                  {MODE_LABELS[route.mode]}
                </Badge>
              )}
              {idx === 0 && sortMode === "recommend" && (
                <Badge className="mr-1.5 bg-blue-600">総合おすすめ</Badge>
              )}
              {badges.cheapest.has(route.id) && (
                <Badge variant="secondary" className="mr-1.5">
                  最安
                </Badge>
              )}
              {badges.fastest.has(route.id) && (
                <Badge variant="secondary" className="mr-1.5">
                  最短
                </Badge>
              )}
              {badges.fewestTransfers.has(route.id) && (
                <Badge variant="secondary" className="mr-1.5">
                  乗り換え最少
                </Badge>
              )}
            </div>
            <div>
              <span className={idx === 0 ? "text-[28px] font-extrabold" : "text-xl font-bold"}>
                {formatHm(route.departureTime)}
              </span>
              {" → "}
              {formatHm(route.arrivalTime)}
              {"　"}
              {formatDurationSecondsJa(route.durationSeconds)}
              {"　乗り換え"}
              {route.transfers}回{"　"}
              {route.fareYen !== null ? `${route.fareYen.toLocaleString()}円` : "運賃不明"}
            </div>
            {route.segments.map((seg, i) =>
              seg.kind === "flight" ? (
                <div key={i} className={SEGMENT_CLASS}>
                  ✈️ {seg.lineName ?? "飛行機"}
                  {seg.flightNumber && ` ${seg.flightNumber}`}：{seg.departureStop}{" "}
                  {formatHm(seg.departureTime)}発 → {seg.arrivalStop} {formatHm(seg.arrivalTime)}着
                </div>
              ) : seg.kind === "drive" ? (
                <div key={i} className={SEGMENT_CLASS}>
                  🚗 運転 {formatDurationSecondsJa(seg.durationSeconds)}
                  {typeof seg.distanceMeters === "number" && `（${seg.distanceMeters}m）`}
                </div>
              ) : seg.kind === "transit" ? (
                <div key={i} className={SEGMENT_CLASS}>
                  🚃 {seg.lineName ?? "電車"}：{seg.departureStop} {formatHm(seg.departureTime)}発 →{" "}
                  {seg.arrivalStop} {formatHm(seg.arrivalTime)}着
                  {typeof seg.stopCount === "number" && `（${seg.stopCount}駅）`}
                </div>
              ) : (
                <div key={i} className={SEGMENT_CLASS}>
                  🚶 徒歩 {formatDurationSecondsJa(seg.durationSeconds)}
                  {typeof seg.distanceMeters === "number" && `（${seg.distanceMeters}m）`}
                </div>
              ),
            )}
            <div>
              <a
                className="text-sm text-blue-600 hover:underline"
                href={mapsLink(route)}
                target="_blank"
                rel="noreferrer"
              >
                Googleマップで開く
              </a>
            </div>
          </CardContent>
        </Card>
      ))}

      {result && sortedRoutes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ※「最安」は、APIが返した候補（最大4件）のうち運賃が取得できたものの中での最安です。
          IC／切符の区別、特急・グリーン料金、定期券利用時の実質最安は対象外です。運賃が取得できないルートは「運賃不明」として分けて表示しています。
        </p>
      )}

      {history.length > 0 && (
        <Card className="my-3 py-4">
          <CardContent className="px-4">
            <CardTitle className="text-base">検索履歴</CardTitle>
            {history.map((h, i) => (
              <Button
                key={i}
                type="button"
                variant="link"
                className="h-auto w-full justify-start px-0 py-1"
                onClick={() => {
                  setDestination(h.destination);
                  setOffsetMinutes(h.offsetMinutes);
                  setSortMode(h.sortMode);
                  if (h.origin.type === "address") {
                    setOriginMode("manual");
                    setOriginText(h.origin.address);
                  } else {
                    setOriginMode("gps");
                  }
                  void runSearch(
                    {
                      origin: h.origin,
                      destination: h.destination,
                      offsetMinutes: h.offsetMinutes,
                      modes: selectedModes(),
                    },
                    h.originLabel,
                    h.sortMode,
                    mockMode,
                  );
                }}
              >
                {h.originLabel} → {h.destination}（{h.offsetMinutes}分後）
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <details className="mt-3.5">
        <summary className="cursor-pointer text-sm font-semibold">設定（無料枠ガード）</summary>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <Label htmlFor="warnAt" className="pt-2 text-[13px]">
              警告件数
            </Label>
            <Input
              id="warnAt"
              type="number"
              value={settings.warnAt}
              onChange={(e) => saveSettings({ ...settings, warnAt: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="stopAt" className="pt-2 text-[13px]">
              停止件数
            </Label>
            <Input
              id="stopAt"
              type="number"
              value={settings.stopAt}
              onChange={(e) => saveSettings({ ...settings, stopAt: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          初期値：警告 8,000件／停止 10,000件（Routes API Essentials の無料枠 月10,000件に合わせた値）。
        </p>
      </details>
    </>
  );
}
