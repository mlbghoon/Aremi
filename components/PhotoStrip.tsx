"use client";

import { useEffect, useRef, useState } from "react";
import { photoStore, PhotoMeta, Annotation } from "@/lib/photos";
import PhotoViewer, { ViewerPhoto } from "@/components/PhotoViewer";

/** 한 일정(eventId)의 사진들: 캐러셀 썸네일 + 전체보기 + 추가 */
export default function PhotoStrip({
  eventId,
  date,
}: {
  eventId: string;
  date: string;
}) {
  const [items, setItems] = useState<ViewerPhoto[]>([]);
  const [dot, setDot] = useState(0);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const urlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function revokeAll() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
  }

  async function load() {
    try {
      const metas = await photoStore.list(eventId);
      const withUrls = await Promise.all(
        metas.map(async (m) => ({
          meta: m,
          url: (await photoStore.getURL(m.id)) ?? "",
        }))
      );
      revokeAll();
      urlsRef.current = withUrls.map((w) => w.url).filter(Boolean);
      setItems(withUrls);
    } catch {
      /* 무시 */
    }
  }

  useEffect(() => {
    load();
    return () => revokeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) await photoStore.add(eventId, date, f);
    if (inputRef.current) inputRef.current.value = "";
    await load();
  }

  async function onDelete(id: string) {
    await photoStore.remove(id);
    await load();
    setViewerAt((at) => {
      if (at == null) return null;
      const nextLen = items.length - 1;
      return nextLen <= 0 ? null : Math.min(at, nextLen - 1);
    });
  }

  function onAnnotate(id: string, anns: Annotation[]) {
    photoStore.setAnnotations(id, anns);
    setItems((prev) =>
      prev.map((it) =>
        it.meta.id === id ? { ...it, meta: { ...it.meta, annotations: anns } } : it
      )
    );
  }

  async function onReorder(ids: string[]) {
    await Promise.all(ids.map((id, i) => photoStore.setOrder(id, i)));
    await load();
  }

  return (
    <div className="photos">
      {items.length > 0 && (
        <>
          <div
            className="photo-gallery"
            onScroll={(e) => {
              const el = e.currentTarget;
              setDot(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {items.map(({ meta, url }, i) => (
              <button
                key={meta.id}
                className="photo-slide"
                onClick={() => setViewerAt(i)}
                aria-label="사진 크게 보기"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
                {meta.annotations?.map((a) => (
                  <span
                    key={a.id}
                    className={`sa ${a.kind}`}
                    style={{
                      left: `${a.x * 100}%`,
                      top: `${a.y * 100}%`,
                      fontSize: `${(a.kind === "sticker" ? 30 : 13) * (a.size ?? 1)}px`,
                    }}
                  >
                    {a.value}
                  </span>
                ))}
              </button>
            ))}
          </div>
          {items.length > 1 && (
            <div className="photo-dots">
              {items.map((_, i) => (
                <i key={i} className={i === dot ? "on" : ""} />
              ))}
            </div>
          )}
        </>
      )}

      <button
        className={`photo-add${items.length > 0 ? " slim" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        ＋ 사진{items.length > 0 ? " 추가" : ""}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {viewerAt != null && items[viewerAt] && (
        <PhotoViewer
          photos={items}
          startIndex={viewerAt}
          onClose={() => setViewerAt(null)}
          onDelete={onDelete}
          onAnnotate={onAnnotate}
          onReorder={onReorder}
        />
      )}
    </div>
  );
}
