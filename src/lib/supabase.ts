import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Supabase の接続設定（URL と公開キー）。 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * 環境変数から Supabase の接続設定を読む。
 * @param env 環境変数の集合（既定は process.env）
 * @returns 両方そろっていれば設定、欠けていれば null
 */
export function readSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Supabase クライアントを生成する。
 * @param env 環境変数の集合（既定は process.env）
 * @returns 設定がそろっていればクライアント、無ければ null
 */
export function createSupabaseClient(
  env: Record<string, string | undefined> = process.env,
): SupabaseClient | null {
  const config = readSupabaseEnv(env);
  if (!config) return null;
  return createClient(config.url, config.anonKey);
}

let cachedClient: SupabaseClient | null | undefined;

/**
 * アプリ全体で共有する Supabase クライアントを返す（初回だけ生成）。
 * @returns クライアント、未設定なら null
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient === undefined) {
    cachedClient = createSupabaseClient();
  }
  return cachedClient;
}

/**
 * 匿名セッションを確保し、ユーザー ID を返す。
 * @param client Supabase クライアント
 * @returns 匿名ユーザーの ID
 */
export async function ensureAnonymousSession(
  client: SupabaseClient,
): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signInData, error } = await client.auth.signInAnonymously();
  if (error || !signInData.user) {
    throw new Error("匿名サインインに失敗しました");
  }
  return signInData.user.id;
}
