@echo off
chcp 65001 >nul
cd /d %~dp0
echo ========================================
echo  電車ルート検索アプリ 起動
echo ========================================
if not exist node_modules (
  echo [初回] 依存パッケージをインストールします...
  call npm install
  if errorlevel 1 goto :error
)
if not exist .env.local (
  echo [注意] .env.local がありません。モック表示のみ可能です。
  echo        実データ検索には .env.local.example をコピーして APIキーを設定してください。
)
if not exist .next (
  echo [初回] 本番ビルドを作成します...
  call npm run build
  if errorlevel 1 goto :error
)
echo ブラウザで http://localhost:3000 を開いてください。
call npm run start
goto :eof
:error
echo 起動に失敗しました。表示されたエラーを確認してください。
pause
