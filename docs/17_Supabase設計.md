# Supabase 設計

検索履歴・設定・無料枠カウンタの保存先として Supabase を使う場合の設計。未設定の場合は従来どおり localStorage のみで動作し、Supabase は任意の追加機能として位置づける。

## 採用方式

- 認証は Supabase の匿名サインイン（Anonymous Sign-ins）を使う。端末・ブラウザごとに匿名ユーザーが 1 つ作られ、そのユーザー ID がデータの所有者になる。
- アクセス制限は RLS（Row Level Security）で行い、全テーブルで「自分の行だけ読み書きできる」ポリシーを適用する。テーブル定義とポリシーは `supabase/schema.sql` が正。
- クライアントは公開キー（anon key）で接続する。秘密キー（service_role）は使わない。

## テーブル

| テーブル | 内容 | 主キー |
| --- | --- | --- |
| search_history | 検索履歴（出発地・目的地の表示文字列、検索日時） | id（uuid） |
| user_settings | 設定（既定の並び替え、警告件数、停止件数） | user_id |
| usage_counters | 月別の API 利用件数 | user_id と month の複合 |

- 履歴は新しい順に最大 10 件を表示し、追加時に 10 件を超えた古い行を削除する。
- 利用カウンタは検索成功（実 API・非キャッシュ）のたびに当月分を 1 増やす。読み取り後に加算して書き戻す方式で、個人利用の競合は許容する。

## コード配置

| ファイル | 役割 |
| --- | --- |
| `src/lib/supabase.ts` | 接続設定の読み取り、クライアント生成、匿名セッションの確保 |
| `src/features/route-search/lib/user-data.ts` | 履歴・設定・カウンタの読み書き（テーブル操作の集約） |
| `supabase/schema.sql` | テーブルと RLS ポリシーの定義 |

## 動作の切り替え

- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` がそろっていれば Supabase を使う。画面の表示は従来どおりローカル状態で即時に更新し、Supabase への保存は裏側で行う。読み込みに失敗した場合は localStorage の内容で表示を続ける。
- どちらか欠けていれば Supabase は無効で、localStorage のみで動作する。
- `NEXT_PUBLIC_` 変数はビルド時に埋め込まれるため、設定の変更には再ビルドが必要。

## セットアップ

手順は README の「Supabase のセットアップ（任意）」に記載する。要点は、プロジェクト作成（無料枠）、SQL Editor で `supabase/schema.sql` を実行、Authentication で Anonymous Sign-ins を有効化、Project Settings の API キーを `.env.local` へ設定、の 4 つ。
