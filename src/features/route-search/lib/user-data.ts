import type { SupabaseClient } from "@supabase/supabase-js";
import type { SortMode } from "./types";

/** 検索履歴の 1 件分。 */
export interface HistoryEntry {
  origin: string;
  destination: string;
}

/** ユーザー設定。 */
export interface UserSettings {
  defaultMode: SortMode;
  warnAt: number;
  stopAt: number;
}

/** Supabase から読み込んだユーザーデータ一式。 */
export interface UserData {
  history: HistoryEntry[];
  settings: UserSettings | null;
  usage: Record<string, number>;
}

/** 履歴の保持件数（表示と保存の上限）。 */
export const HISTORY_LIMIT = 10;

/**
 * 検索履歴を新しい順に読み込む。
 * @param client Supabase クライアント
 * @returns 履歴（最大 HISTORY_LIMIT 件）
 */
export async function loadHistory(
  client: SupabaseClient,
): Promise<HistoryEntry[]> {
  const { data, error } = await client
    .from("search_history")
    .select("origin_text, destination_text")
    .order("searched_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`履歴の読み込みに失敗しました: ${error.message}`);
  return (data ?? []).map((row) => ({
    origin: row.origin_text as string,
    destination: row.destination_text as string,
  }));
}

/**
 * ユーザー設定を読み込む。
 * @param client Supabase クライアント
 * @returns 設定、未保存なら null
 */
export async function loadSettings(
  client: SupabaseClient,
): Promise<UserSettings | null> {
  const { data, error } = await client
    .from("user_settings")
    .select("default_mode, warn_at, stop_at")
    .maybeSingle();
  if (error) throw new Error(`設定の読み込みに失敗しました: ${error.message}`);
  if (!data) return null;
  return {
    defaultMode: data.default_mode as SortMode,
    warnAt: data.warn_at as number,
    stopAt: data.stop_at as number,
  };
}

/**
 * 月別の利用件数を読み込む。
 * @param client Supabase クライアント
 * @returns 年月をキーにした件数の対応表
 */
export async function loadUsage(
  client: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("usage_counters")
    .select("month, count");
  if (error) throw new Error(`利用件数の読み込みに失敗しました: ${error.message}`);
  const usage: Record<string, number> = {};
  for (const row of data ?? []) {
    usage[row.month as string] = row.count as number;
  }
  return usage;
}

/**
 * ユーザーデータ一式をまとめて読み込む。
 * @param client Supabase クライアント
 * @returns 履歴・設定・利用件数
 */
export async function loadUserData(client: SupabaseClient): Promise<UserData> {
  const [history, settings, usage] = await Promise.all([
    loadHistory(client),
    loadSettings(client),
    loadUsage(client),
  ]);
  return { history, settings, usage };
}

/**
 * 検索履歴を 1 件追加し、保持件数を超えた古い履歴を削除する。
 * @param client Supabase クライアント
 * @param userId 匿名ユーザーの ID
 * @param origin 出発地の表示文字列
 * @param destination 目的地の表示文字列
 */
export async function addHistory(
  client: SupabaseClient,
  userId: string,
  origin: string,
  destination: string,
): Promise<void> {
  const { error } = await client.from("search_history").insert({
    user_id: userId,
    origin_text: origin,
    destination_text: destination,
  });
  if (error) throw new Error(`履歴の追加に失敗しました: ${error.message}`);
  const { data, error: selectError } = await client
    .from("search_history")
    .select("id")
    .order("searched_at", { ascending: false })
    .range(HISTORY_LIMIT, 999);
  if (selectError) {
    throw new Error(`履歴の整理に失敗しました: ${selectError.message}`);
  }
  const extraIds = (data ?? []).map((row) => row.id as string);
  if (extraIds.length === 0) return;
  const { error: deleteError } = await client
    .from("search_history")
    .delete()
    .in("id", extraIds);
  if (deleteError) {
    throw new Error(`履歴の削除に失敗しました: ${deleteError.message}`);
  }
}

/**
 * ユーザー設定を保存する（無ければ作成、あれば更新）。
 * @param client Supabase クライアント
 * @param userId 匿名ユーザーの ID
 * @param settings 保存する設定
 */
export async function saveSettings(
  client: SupabaseClient,
  userId: string,
  settings: UserSettings,
): Promise<void> {
  const { error } = await client.from("user_settings").upsert({
    user_id: userId,
    default_mode: settings.defaultMode,
    warn_at: settings.warnAt,
    stop_at: settings.stopAt,
  });
  if (error) throw new Error(`設定の保存に失敗しました: ${error.message}`);
}

/**
 * 指定月の利用件数を 1 増やし、新しい件数を返す。
 * @param client Supabase クライアント
 * @param userId 匿名ユーザーの ID
 * @param month 年月キー（YYYY-MM）
 * @returns 加算後の件数
 */
export async function incrementUsage(
  client: SupabaseClient,
  userId: string,
  month: string,
): Promise<number> {
  const { data, error } = await client
    .from("usage_counters")
    .select("count")
    .eq("month", month)
    .maybeSingle();
  if (error) throw new Error(`利用件数の確認に失敗しました: ${error.message}`);
  const next = ((data?.count as number | undefined) ?? 0) + 1;
  const { error: upsertError } = await client.from("usage_counters").upsert({
    user_id: userId,
    month,
    count: next,
  });
  if (upsertError) {
    throw new Error(`利用件数の保存に失敗しました: ${upsertError.message}`);
  }
  return next;
}
