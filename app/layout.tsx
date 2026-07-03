import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aremi (동선)",
  description: "일정과 지도를 하나로 — 날짜별로 계획하고 동선을 짜는 앱.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Aremi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 핀치 줌은 열어둔다 (접근성 WCAG 1.4.4 — 저시력 사용자가 확대할 수 있어야 함)
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="device">{children}</div>
      </body>
    </html>
  );
}
