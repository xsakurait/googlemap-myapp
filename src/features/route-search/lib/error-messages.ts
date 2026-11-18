import type { ApiErrorCode } from "./types";

/** エラーコードに対応する画面表示メッセージ（定義はここに一元化する） */
export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  API_KEY_NOT_SET:
    "APIキーが未設定です。PC上の .env.local に GOOGLE_MAPS_API_KEY を設定してください（手順は README のセットアップ）。下の「モックデータで試す」で画面の確認はできます。",
  NOT_FOUND: "条件に合うルートが見つかりませんでした。出発地・目的地を確認してください。",
  UPSTREAM_ERROR: "Google Routes API でエラーが発生しました。しばらく待って再試行してください。",
  INVALID_PARAMS: "入力内容に不備があります。目的地と出発地を確認してください。",
  LIMIT_REACHED: "今月の無料枠ガード（上限）に達したため検索を停止しています。",
  SERPAPI_KEY_NOT_SET:
    "SerpApi の APIキーが未設定です。PC上の .env.local に SERPAPI_API_KEY を設定してください（手順は README のセットアップ）。車・徒歩の検索とモックデータでの確認はキーがなくてもできます。",
};
