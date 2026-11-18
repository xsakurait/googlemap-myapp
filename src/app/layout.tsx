import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "電車ルート検索",
  description: "現在地から目的地まで、最安・最短・乗り換え最少の電車ルートを探す個人用アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
