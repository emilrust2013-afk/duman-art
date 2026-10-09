import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // В корне репозитория лежит свой package-lock.json (для bot/), поэтому
  // явно указываем корень приложения, а не даём Next угадывать его.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
