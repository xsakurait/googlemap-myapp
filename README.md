# 電車ルート検索アプリ（Next.js）

現在地（GPS）から目的地まで、今から乗れる次の便を「最安・最短・乗り換え最少」の総合おすすめ順で表示する個人用 Web アプリです。Google Routes API（TRANSIT）のみを使い、無料枠（Essentials SKU：月 10,000 件）の範囲内で動くよう設計しています。

## 作ろうとした理由

- Google マップの通常の検索では、候補を運賃・所要時間・乗り換え回数の自分の重み付けで並べ替えることや、無料枠の利用状況を見ながら使うことができません。
- 出発は現在時刻が既定、現在地から、目的地だけを入力して素早く検索する、という自分の使い方に寄せた形で、無料の範囲内で運営できる個人用アプリとして開発しました。

## 技術環境

| 区分 | 内容 |
| --- | --- |
| 言語・基盤 | TypeScript、Next.js 15（App Router）、React 19 |
| 実行環境 | Node.js 20、Docker（Next.js の standalone 出力） |
| 外部サービス | Google Routes API（TRANSIT）、Supabase（PostgreSQL、匿名認証、RLS） |
| テスト | Vitest（単体テスト。カバレッジ 100% を CI で担保） |
| CI | GitHub Actions（型チェック、テスト、ビルド、コーディング規約チェック、ドキュメント形式チェック） |

## 使用した AI エージェント

- 開発は AI エージェント（Muse）との対話で進めました。要件定義と設計ドキュメントの作成、製造、単体テストと総合テストの実施、GitHub での PR 作成とマージ、Supabase のセットアップ補助までを Muse が担当し、条件の決定と最終確認は開発者本人が行いました。
- Muse は本人の Windows PC へ SSH で接続してリポジトリを操作し、ブラウザ操作が必要な場面（GitHub、Supabase）は本人のブラウザと連携して進めました。

## ドキュメント

- 要件定義書：`docs/00_要件定義書.md`（§10 にバス・飛行機への拡張要件）
- 基本設計書：`docs/01_基本設計書.md`
- ER 図：`docs/02_ER図.md`／CRUD 図：`docs/03_CRUD図.md`
- 詳細設計書：`docs/04_詳細設計書.md`／SQL 一覧：`docs/05_SQL一覧.md`／物理 ER 図：`docs/06_物理ER図.md`
- バッチ処理定義：`docs/07_バッチ処理定義.md`／クラス図：`docs/08_クラス図.md`／シーケンス図：`docs/09_シーケンス図.md`
- 共通項目定義：`docs/11_共通項目定義.md`
- Supabase 設計：`docs/17_Supabase設計.md`

## セットアップ

1. Google Cloud でプロジェクト作成 → 課金アカウント紐付け → Routes API 有効化 → API キー発行（API 制限＝Routes API のみ）＋クォータ上限設定。
2. `.env.sample` をコピーして `.env.local` を作り、`GOOGLE_MAPS_API_KEY` にキーを入れる（キーはチャット等に貼らない）。`.env.local` は gitignore 済みで Git には上がらない。
3. 起動は次のどちらか。
   - ローカル：`start.bat` をダブルクリック → ブラウザで `http://localhost:3000` を開く（手動の場合：`npm install` → `npm run build` → `npm run start`）
   - Docker：`docker compose up --build` → `http://localhost:3000`
4. キーなしでも「モックデータで試す」で画面確認ができる。

## Supabase のセットアップ（任意）

検索履歴・設定・利用カウンタを端末・ユーザー単位で Supabase に保存する場合の設定。未設定なら localStorage のみで動作する。設計は `docs/17_Supabase設計.md`、テーブルと RLS の定義は `supabase/schema.sql` を参照。

1. Supabase でプロジェクトを作成する（無料枠でよい）。
2. SQL Editor で `supabase/schema.sql` を実行し、テーブルと RLS ポリシーを作る。
3. Authentication の設定で Anonymous Sign-ins（匿名サインイン）を有効化する。
4. Project Settings → API の Project URL と anon key を、`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` に入れる。
5. `NEXT_PUBLIC_` 変数はビルド時に埋め込まれるため、アプリを再ビルドして再起動する。

## Docker と展開

- `Dockerfile` は Next.js の standalone 出力を使ったマルチステージビルド。`docker-compose.yml` は `.env.local` を読み込んでポート 3000 で起動する。
- 共有や AWS への展開を想定した構成にしており、コンテナイメージはそのまま ECR へ push して ECS／App Runner 等で動かせる（展開手順は展開先が決まった時点で追加する）。

## 主な仕様

- 出発地デフォルト＝現在地 GPS（座標を緯度経度のまま Routes API へ。追加 API なし）。拒否時は手入力に切替。
- 並び替えデフォルト＝総合おすすめ（運賃 0.4・所要時間 0.3・乗り換え 0.3 の正規化スコア）。運賃不明ルートは先頭にせず、分けて表示。
- 「最安」は API が返した候補のうち運賃が取得できたものの中での最安（IC／特急料金／定期は対象外）。
- 検索 1 回＝API 1 リクエスト。同一条件は 60 秒キャッシュ。月間カウンターが 8,000 件で警告・10,000 件で自動停止（設定変更可）。

## テストとカバレッジ

```text
npm run typecheck       # 型チェック
npm run test            # 単体テスト
npm run test:coverage   # カバレッジ付き（閾値：全指標 100%）
```

カバレッジ対象は `src/features/*/lib/**`、`src/lib/**`、`src/app/api/**`（画面コンポーネントは対象外）。

## CI（GitHub Actions）

push と pull_request で、ドキュメント形式チェック（Docs Check）と、型チェック → カバレッジ付きテスト → 本番ビルド（CI）を実行する。
