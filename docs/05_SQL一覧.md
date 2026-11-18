# SQL一覧：電車ルート検索アプリ

作成日：2026-11-18／対応文書：docs/01_基本設計書.md、docs/02_ER図.md、docs/11_共通項目定義.md

## 1. SQL の有無

本アプリは RDB を使用しないため、発行する SQL は存在しない。データの読み書きはすべて localStorage（クライアント）とサーバー側メモリ（Map）に対して行う。
本書では、その代替として「データ操作一覧」を SQL の区分（参照／登録／更新／削除）に読み替えて定義する。ストレージキーとインデックス定義は docs/11_共通項目定義.md を正とする。

## 2. データ操作一覧

| # | 区分（SQL相当） | 対象 | キー／条件 | 実行モジュール | タイミング |
|---|---|---|---|---|---|
| OP-01 | 参照 | tra.usage | IDX-02（month） | usage.loadUsage | 画面表示時・検索前 |
| OP-02 | 登録／更新 | tra.usage | IDX-02（month） | usage.increment＋serializeUsage | 実 API 検索の成功時 |
| OP-03 | 参照 | tra.history | IDX-03（並び順） | page.tsx | 画面表示時（プルダウン候補） |
| OP-04 | 登録 | tra.history | 先頭へ追加、最大 10 件 | page.tsx | 検索成功時 |
| OP-05 | 削除 | tra.history | 11 件目の末尾要素 | page.tsx | OP-04 と同時（押し出し） |
| OP-06 | 参照／更新 | tra.settings | 固定キー | page.tsx | 画面表示時・設定変更時 |
| OP-07 | 参照／更新 | tra.originText | 固定キー | page.tsx | 画面表示時・検索時 |
| OP-08 | 参照 | サーバー側キャッシュ | IDX-01（キャッシュキー） | cache.get（route.ts） | POST /api/routes の処理中 |
| OP-09 | 登録 | サーバー側キャッシュ | IDX-01（キャッシュキー）、TTL 60 秒 | cache.set（route.ts） | Routes API 応答の取得時 |
| OP-10 | 削除 | サーバー側キャッシュ | IDX-01、TTL 失効 | cache.get（route.ts） | 失効エントリの取得時 |

## 3. 備考

- UsageCounter の「削除」に相当する操作はない。月替わりは OP-01 の読み取り時に現在月と比較し、異なれば 0 件として扱う（遅延評価。docs/07_バッチ処理定義.md 参照）。
- 外部へのデータ送信は Google Routes API へのリクエストのみで、検索条件以外の利用者データは送信しない。
- 将来 RDB を導入する場合は、本書を改訂し実 SQL を定義すること。その際は docs/02_ER図.md の論理モデルを物理テーブルへ落とし込む。
