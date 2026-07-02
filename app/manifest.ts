import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aremi (동선)",
    short_name: "Aremi",
    description: "일정과 지도를 하나로 — 날짜별로 계획하고 동선을 짜는 앱.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0e13",
    theme_color: "#7c6cff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
