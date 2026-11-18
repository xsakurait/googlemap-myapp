import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker での配布・AWS 展開に備え、standalone 出力にする
  output: "standalone",
};

export default nextConfig;
