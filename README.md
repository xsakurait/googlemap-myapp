# 電車ルート検索アプリ（Next.js）

現在地（GPS）から目的地まで、今から乗れる次の便を「最安・最短・乗り換え最少」の総合おすすめ順で表示する個人用 Web アプリです。Google Routes API（TRANSIT）のみを使い、無料枠（Essentials SKU：月 10,000 件）の範囲内で動くよう設計しています。

## ドキュメント

- 要件定義書：`docs/00_要件定義書.md`（§10 にバス・飛行機への拡張要件）
- 基本設計書：`docs/01_基本設計書.md`
- ER 図：`docs/02_ER図.md`／CRUD 図：`docs/03_CRUD図.md`
- 詳細設計書：`docs/04_詳細設計書.md`／SQL 一覧：`docs/05_SQL一覧.md`／物理 ER 図：`docs/06_物理ER図.md`
- バッチ処理定義：`docs/07_バッチ処理定義.md`／クラス図：`docs/08_クラス図.md`／シーケンス図：`docs/09_シーケンス図.md`
- 共通項目定義：`docs/11_共通項目定義.md`

## セットアップ

1. Google Cloud でプロジェクト作成 → 課金アカウント紐付け → Routes API 有効化 → API キー発行（API 制限＝Routes API のみ）＋クォータ上限設定。
2. `.env.sample` をコピーして `.env.local` を作り、`GOOGLE_MAPS_API_KEY` にキーを入れる（キーはチャット等に貼らない）。`.env.local` は gitignore 済みで Git には上がらない。
3. 起動は次のどちらか。
   - ローカル：`start.bat` をダブルクリック → ブラウザで `http://localhost:3000` を開く（手動の場合：`npm install` → `npm run build` → `npm run start`）
   - Docker：`docker compose up --build` → `http://localhost:3000`
4. キーなしでも「モックデータで試す」で画面確認ができる。

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
npm run test:coverage   # カバレッジ付き（閾値：lines/statements/functions 80%、branches 70%）
```

カバレッジ対象は `src/lib/**` と `src/app/api/**`。

## CI（GitHub Actions）

push と pull_request で、ドキュメント形式チェック（Docs Check）と、型チェック → カバレッジ付きテスト → 本番ビルド（CI）を実行する。
