"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiErrorCode,
  NormalizedRoute,
  OriginInput,
  RoutesApiResponseBody,
  SearchParams,
  SortMode,
} from "@/features/route-search/lib/types";
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

const LS_ORIGIN = "tra.originText";
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


const CARD_CLASS = "my-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const CARD_TOP_CLASS = "my-3 rounded-xl border-2 border-blue-600 bg-white p-4 shadow-sm";
const LABEL_CLASS = "mb-1 mt-2.5 block text-[13px] font-semibold";
const INPUT_CLASS = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base";
const NOTE_CLASS = "text-xs text-slate-500";
const BADGE_CLASS = "mr-1.5 inline-block rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white";
const BADGE_SUB_CLASS = "mr-1.5 inline-block rounded-full bg-slate-500 px-2.5 py-0.5 text-xs font-bold text-white";
const SEGMENT_CLASS = "border-t border-dashed border-slate-200 py-1.5 text-sm";
const LINK_CLASS = "py-1 text-left text-sm text-blue-600 hover:underline";

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
        // 実API・非キャッシュのときだけ月間カウンターを加算
        if (data.source === "google" && !data.cached) {
          const next = increment(usageRef.current, new Date());
          setUsage(next);
          localStorage.setItem(LS_USAGE, serializeUsage(next));
          const remote = remoteRef.current;
          if (remote) {
            void incrementRemoteUsage(remote.client, remote.userId, next.month).catch(() => {});
          }
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

  const handleSearch = useCallback(() => {
    if (stopped) {
      setErrorCode("LIMIT_REACHED");
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
      { origin, destination: destination.trim(), offsetMinutes },
      originLabel(),
      sortMode,
      mockMode,
    );
  }, [stopped, currentOrigin, destination, offsetMinutes, originLabel, sortMode, mockMode, runSearch]);

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

      <div className={CARD_CLASS}>
        <label className={LABEL_CLASS}>出発地</label>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <button type="button" className={LINK_CLASS} onClick={requestGps}>
              📍 現在地から（GPS）
            </button>
            {gps.status === "loading" && <div className={NOTE_CLASS}>取得中…</div>}
            {gps.status === "ok" && (
              <div className={NOTE_CLASS}>
                現在地を取得済み（精度 ±{gps.accuracy}m）
                {gps.accuracy > 1000 && " ※精度が低いため、駅がずれる可能性があります"}
              </div>
            )}
            {gps.status === "denied" && <div className={NOTE_CLASS}>{gps.message}</div>}
          </div>
        </div>
        <label className={LABEL_CLASS}>
          <input
            type="radio"
            name="originMode"
            checked={originMode === "gps"}
            onChange={() => setOriginMode("gps")}
            className="mr-1.5 w-4 shrink-0"
          />
          現在地（GPS）を使う
        </label>
        <label className={LABEL_CLASS}>
          <input
            type="radio"
            name="originMode"
            checked={originMode === "manual"}
            onChange={() => setOriginMode("manual")}
            className="mr-1.5 w-4 shrink-0"
          />
          手入力する
        </label>
        {originMode === "manual" && (
          <input
            className={INPUT_CLASS}
            type="text"
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder="駅名または住所（例：品川駅）"
          />
        )}

        <label className={LABEL_CLASS} htmlFor="destination">目的地（必須）</label>
        <input
          className={INPUT_CLASS}
          id="destination"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="駅名または住所（例：新宿駅）"
        />

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={LABEL_CLASS} htmlFor="offset">出発（今から何分後）</label>
            <input
              className={INPUT_CLASS}
              id="offset"
              type="number"
              min={0}
              max={180}
              value={offsetMinutes}
              onChange={(e) => setOffsetMinutes(Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
            />
          </div>
          <div className="flex-1">
            <label className={LABEL_CLASS} htmlFor="sort">並び替え</label>
            <select
              className={INPUT_CLASS}
              id="sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="recommend">総合おすすめ</option>
              <option value="fare">安さ優先</option>
              <option value="transfers">乗り換え少なさ優先</option>
              <option value="duration">早さ優先</option>
            </select>
          </div>
        </div>

        <label className={LABEL_CLASS}>
          <input
            type="checkbox"
            checked={mockMode}
            onChange={(e) => setMockMode(e.target.checked)}
            className="mr-1.5 w-4 shrink-0"
          />
          モックデータで試す（APIキー不要・カウンター対象外）
        </label>

        <button type="button" className="mt-3.5 w-full rounded-lg bg-blue-600 py-3 text-[17px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" onClick={handleSearch} disabled={searching || stopped}>
          {searching ? "検索中…" : stopped ? "今月の上限に達しました" : "検索する"}
        </button>

        <p className={NOTE_CLASS}>
          今月のAPI利用：{usage.count} 件（警告 {settings.warnAt} 件／停止 {settings.stopAt} 件）
          {limitStatus === "warn" && " ※無料枠の上限が近づいています"}
          {limitStatus === "stop" && " ※上限に達したため実データ検索を停止中です"}
        </p>
      </div>

      {errorCode && (
        <div className="my-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <strong>{ERROR_MESSAGES[errorCode as ApiErrorCode] ?? "エラーが発生しました"}</strong>
          {errorDetail && <div>{errorDetail}</div>}
          {errorCode === "API_KEY_NOT_SET" && (
            <div>
              手順：Google Cloudでプロジェクト作成 → 課金紐付け → Routes API有効化 → APIキー発行 →
              PC上の .env.local に GOOGLE_MAPS_API_KEY を設定 → アプリ再起動（手順は README のセットアップ）
            </div>
          )}
        </div>
      )}

      {result?.source === "mock" && (
        <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">モックデータ表示中です（実データではありません）。</div>
      )}
      {result?.cached && <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">キャッシュ結果を表示しています（API消費なし）。</div>}

      {sortedRoutes.map((route, idx) => (
        <div key={route.id} className={idx === 0 ? CARD_TOP_CLASS : CARD_CLASS}>
          <div>
            {idx === 0 && sortMode === "recommend" && <span className={BADGE_CLASS}>総合おすすめ</span>}
            {badges.cheapest.has(route.id) && <span className={BADGE_SUB_CLASS}>最安</span>}
            {badges.fastest.has(route.id) && <span className={BADGE_SUB_CLASS}>最短</span>}
            {badges.fewestTransfers.has(route.id) && <span className={BADGE_SUB_CLASS}>乗り換え最少</span>}
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
            seg.kind === "transit" ? (
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
            <a className="text-sm text-blue-600 hover:underline" href={mapsLink(route)} target="_blank" rel="noreferrer">
              Googleマップで開く
            </a>
          </div>
        </div>
      ))}

      {result && sortedRoutes.length > 0 && (
        <p className={NOTE_CLASS}>
          ※「最安」は、APIが返した候補（最大4件）のうち運賃が取得できたものの中での最安です。
          IC／切符の区別、特急・グリーン料金、定期券利用時の実質最安は対象外です。運賃が取得できないルートは「運賃不明」として分けて表示しています。
        </p>
      )}

      {history.length > 0 && (
        <div className={CARD_CLASS}>
          <strong>検索履歴</strong>
          {history.map((h, i) => (
            <button
              key={i}
              type="button"
              className="block w-full py-1 text-left text-sm text-blue-600 hover:underline"
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
                  { origin: h.origin, destination: h.destination, offsetMinutes: h.offsetMinutes },
                  h.originLabel,
                  h.sortMode,
                  mockMode,
                );
              }}
            >
              {h.originLabel} → {h.destination}（{h.offsetMinutes}分後）
            </button>
          ))}
        </div>
      )}

      <details className="mt-3.5">
        <summary className="cursor-pointer text-sm font-semibold">設定（無料枠ガード）</summary>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={LABEL_CLASS} htmlFor="warnAt">警告件数</label>
            <input
              className={INPUT_CLASS}
              id="warnAt"
              type="number"
              value={settings.warnAt}
              onChange={(e) => saveSettings({ ...settings, warnAt: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="flex-1">
            <label className={LABEL_CLASS} htmlFor="stopAt">停止件数</label>
            <input
              className={INPUT_CLASS}
              id="stopAt"
              type="number"
              value={settings.stopAt}
              onChange={(e) => saveSettings({ ...settings, stopAt: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <p className={NOTE_CLASS}>初期値：警告 8,000件／停止 10,000件（Routes API Essentials の無料枠 月10,000件に合わせた値）。</p>
      </details>
    </>
  );
}
