-- 電車ルート検索アプリの Supabase スキーマ定義。
-- 使い方: Supabase の SQL Editor で本ファイルを実行する。
-- 前提: Authentication で Anonymous Sign-ins（匿名サインイン）を有効化しておくこと。
-- 方針: 全テーブルで RLS（Row Level Security）を有効化し、匿名認証のユーザー ID
-- （auth.uid()）が一致する行だけを読み書きできるようにする。

-- 検索履歴（ユーザー単位、表示は新しい順に最大 10 件）
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin_text text not null,
  destination_text text not null,
  searched_at timestamptz not null default now()
);

create index if not exists search_history_user_time_idx
  on public.search_history (user_id, searched_at desc);

-- ユーザー設定（ユーザー単位で 1 行）
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_mode text not null default 'recommend',
  warn_at integer not null default 8000,
  stop_at integer not null default 10000,
  updated_at timestamptz not null default now()
);

-- 無料枠の利用カウンタ（ユーザー単位・月単位で 1 行）
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  count integer not null default 0,
  primary key (user_id, month)
);

-- RLS を有効化する。
alter table public.search_history enable row level security;
alter table public.user_settings enable row level security;
alter table public.usage_counters enable row level security;

-- ポリシー: 自分の行だけを対象にする（参照・追加・更新・削除すべて）。
create policy "search_history_own_rows" on public.search_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_settings_own_rows" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "usage_counters_own_rows" on public.usage_counters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
