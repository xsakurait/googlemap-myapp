import { RouteSearchApp } from "@/features/route-search/components/route-search-app";

/** 検索画面（静的部分はサーバーコンポーネント、対話部分はクライアントコンポーネントへ分離） */
export default function Home() {
  return (
    <main>
      <h1>電車ルート検索</h1>
      <p className="note">
        現在地から目的地まで、今から乗れる次の便を「最安・最短・乗り換え最少」の総合おすすめ順で表示します。
      </p>
      <RouteSearchApp />
    </main>
  );
}
