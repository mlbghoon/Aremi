"use client";

export type Tab = "plan" | "map" | "feed";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "plan", icon: "📅", label: "달력" },
  { id: "map", icon: "🗺", label: "동선" },
  { id: "feed", icon: "📖", label: "돌아보기" },
];

/** 항상 보이는 하단 탭바 — 세 최상위 화면(달력/동선/돌아보기) 전환. */
export default function BottomNav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`bn-item${active === t.id ? " on" : ""}`}
          onClick={() => onSelect(t.id)}
          aria-current={active === t.id ? "page" : undefined}
        >
          <span className="bn-icon">{t.icon}</span>
          <span className="bn-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
