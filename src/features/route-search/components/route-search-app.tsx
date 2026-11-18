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
  type UsageState,
  DEFAULT_USAGE_LIMITS,
} from "@/features/route-search/lib/usage";

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
  };

  return (
    <>

      <div className="card">
        <label>出発地</label>
        <div className="row">
          <div>
            <button type="button" className="link" onClick={requestGps}>
              📍 現在地から（GPS）
            </button>
            {gps.status === "loading" && <div className="note">取得中…</div>}
            {gps.status === "ok" && (
              <div className="note">
                現在地を取得済み（精度 ±{gps.accuracy}m）
                {gps.accuracy > 1000 && " ※精度が低いため、駅がずれる可能性があります"}
              </div>
            )}
            {gps.status === "denied" && <div className="note">{gps.message}</div>}
          </div>
        </div>
        <label>
          <input
            type="radio"
            name="originMode"
            checked={originMode === "gps"}
            onChange={() => setOriginMode("gps")}
            style={{ width: "auto", marginRight: 6 }}
          />
          現在地（GPS）を使う
        </label>
        <label>
          <input
            type="radio"
            name="originMode"
            checked={originMode === "manual"}
            onChange={() => setOriginMode("manual")}
            style={{ width: "auto", marginRight: 6 }}
          />
          手入力する
        </label>
        {originMode === "manual" && (
          <input
            type="text"
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder="駅名または住所（例：品川駅）"
          />
        )}

        <label htmlFor="destination">目的地（必須）</label>
        <input
          id="destination"
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="駅名または住所（例：新宿駅）"
        />

        <div className="row">
          <div>
            <label htmlFor="offset">出発（今から何分後）</label>
            <input
              id="offset"
              type="number"
              min={0}
              max={180}
              value={offsetMinutes}
              onChange={(e) => setOffsetMinutes(Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
            />
          </div>
          <div>
            <label htmlFor="sort">並び替え</label>
            <select
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

        <label>
          <input
            type="checkbox"
            checked={mockMode}
            onChange={(e) => setMockMode(e.target.checked)}
            style={{ width: "auto", marginRight: 6 }}
          />
          モックデータで試す（APIキー不要・カウンター対象外）
        </label>

        <button type="button" className="primary" onClick={handleSearch} disabled={searching || stopped}>
          {searching ? "検索中…" : stopped ? "今月の上限に達しました" : "検索する"}
        </button>

        <p className="note">
          今月のAPI利用：{usage.count} 件（警告 {settings.warnAt} 件／停止 {settings.stopAt} 件）
          {limitStatus === "warn" && " ※無料枠の上限が近づいています"}
          {limitStatus === "stop" && " ※上限に達したため実データ検索を停止中です"}
        </p>
      </div>

      {errorCode && (
        <div className="error">
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
        <div className="warnbox">モックデータ表示中です（実データではありません）。</div>
      )}
      {result?.cached && <div className="warnbox">キャッシュ結果を表示しています（API消費なし）。</div>}

      {sortedRoutes.map((route, idx) => (
        <div key={route.id} className={idx === 0 ? "card top" : "card"}>
          <div>
            {idx === 0 && sortMode === "recommend" && <span className="badge">総合おすすめ</span>}
            {badges.cheapest.has(route.id) && <span className="badge sub">最安</span>}
            {badges.fastest.has(route.id) && <span className="badge sub">最短</span>}
            {badges.fewestTransfers.has(route.id) && <span className="badge sub">乗り換え最少</span>}
          </div>
          <div>
            <span className={idx === 0 ? "depart" : undefined} style={idx === 0 ? undefined : { fontSize: 20, fontWeight: 700 }}>
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
              <div key={i} className="segment">
                🚃 {seg.lineName ?? "電車"}：{seg.departureStop} {formatHm(seg.departureTime)}発 →{" "}
                {seg.arrivalStop} {formatHm(seg.arrivalTime)}着
                {typeof seg.stopCount === "number" && `（${seg.stopCount}駅）`}
              </div>
            ) : (
              <div key={i} className="segment">
                🚶 徒歩 {formatDurationSecondsJa(seg.durationSeconds)}
                {typeof seg.distanceMeters === "number" && `（${seg.distanceMeters}m）`}
              </div>
            ),
          )}
          <div>
            <a href={mapsLink(route)} target="_blank" rel="noreferrer">
              Googleマップで開く
            </a>
          </div>
        </div>
      ))}

      {result && sortedRoutes.length > 0 && (
        <p className="note">
          ※「最安」は、APIが返した候補（最大4件）のうち運賃が取得できたものの中での最安です。
          IC／切符の区別、特急・グリーン料金、定期券利用時の実質最安は対象外です。運賃が取得できないルートは「運賃不明」として分けて表示しています。
        </p>
      )}

      {history.length > 0 && (
        <div className="card">
          <strong>検索履歴</strong>
          {history.map((h, i) => (
            <button
              key={i}
              type="button"
              className="link history-item"
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

      <details>
        <summary>設定（無料枠ガード）</summary>
        <div className="row">
          <div>
            <label htmlFor="warnAt">警告件数</label>
            <input
              id="warnAt"
              type="number"
              value={settings.warnAt}
              onChange={(e) => saveSettings({ ...settings, warnAt: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label htmlFor="stopAt">停止件数</label>
            <input
              id="stopAt"
              type="number"
              value={settings.stopAt}
              onChange={(e) => saveSettings({ ...settings, stopAt: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <p className="note">初期値：警告 8,000件／停止 10,000件（Routes API Essentials の無料枠 月10,000件に合わせた値）。</p>
      </details>
    </>
  );
}
