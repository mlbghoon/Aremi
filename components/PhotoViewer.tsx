"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Annotation, PhotoMeta } from "@/lib/photos";

export interface ViewerPhoto {
  meta: PhotoMeta;
  url: string;
}

const EMOJIS = ["❤️", "😍", "👍", "🎉", "🔥", "✨", "🥰", "😂", "📍", "🌸", "⭐", "☕"];

function aid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
const clamp = (v: number) => Math.min(1, Math.max(0, v));

interface Props {
  photos: ViewerPhoto[];
  startIndex: number;
  onClose: () => void;
  onDelete: (id: string) => void;
  onAnnotate: (id: string, anns: Annotation[]) => void;
  onReorder: (orderedIds: string[]) => void;
}

export default function PhotoViewer({
  photos,
  startIndex,
  onClose,
  onDelete,
  onAnnotate,
  onReorder,
}: Props) {
  const [index, setIndex] = useState(startIndex);
  const [editing, setEditing] = useState(false);
  const [annos, setAnnos] = useState<Annotation[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);
  // 폰 프레임(.device) 위에 통째로 띄운다 (지도/시트를 덮도록)
  const [host, setHost] = useState<Element | null>(null);

  const cur = photos[index];

  useEffect(() => {
    setHost(document.querySelector(".device") ?? document.body);
  }, []);

  useEffect(() => {
    setAnnos(photos[index]?.meta.annotations ?? []);
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!cur || !host) return null;

  function persist(next: Annotation[]) {
    setAnnos(next);
    onAnnotate(cur.meta.id, next);
  }
  function addText() {
    const v = window.prompt("사진에 쓸 메모");
    if (!v?.trim()) return;
    persist([
      ...annos,
      { id: aid(), kind: "text", value: v.trim(), x: 0.5, y: 0.5, size: 1 },
    ]);
  }
  function addSticker(e: string) {
    persist([
      ...annos,
      { id: aid(), kind: "sticker", value: e, x: 0.5, y: 0.5, size: 1 },
    ]);
  }
  function removeAnno(id: string) {
    persist(annos.filter((a) => a.id !== id));
    setSel(null);
  }
  function resize(id: string, f: number) {
    persist(
      annos.map((a) =>
        a.id === id
          ? { ...a, size: Math.min(4, Math.max(0.4, (a.size ?? 1) + f)) }
          : a
      )
    );
  }
  function moveCurrent(dir: -1 | 1) {
    const ids = photos.map((p) => p.meta.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    onReorder(ids);
    setIndex(j);
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (!editing) return;
    e.preventDefault();
    dragRef.current = id;
    setSel(id);
    frameRef.current?.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const id = dragRef.current;
    if (!id || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width);
    const y = clamp((e.clientY - r.top) / r.height);
    setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, x, y } : a)));
  }
  function endDrag() {
    if (dragRef.current) {
      dragRef.current = null;
      onAnnotate(cur.meta.id, annos);
    }
  }

  // 사진 + 스티커/메모를 한 장으로 합쳐 공유(또는 저장)
  async function shareImage() {
    const img = new Image();
    img.src = cur.url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej();
    }).catch(() => {});
    const W = img.naturalWidth || 1080;
    const H = img.naturalHeight || 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const a of annos) {
      const x = a.x * W;
      const y = a.y * H;
      const s = a.size ?? 1;
      if (a.kind === "sticker") {
        ctx.font = `${Math.round(W * 0.12 * s)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
        ctx.fillText(a.value, x, y);
      } else {
        const fs = Math.round(W * 0.06 * s);
        ctx.font = `800 ${fs}px sans-serif`;
        ctx.lineWidth = Math.max(2, W * 0.008);
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.strokeText(a.value, x, y);
        ctx.fillStyle = "#fff";
        ctx.fillText(a.value, x, y);
      }
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "aremi.png", { type: "image/png" });
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "Aremi 다이어리" });
          return;
        } catch {
          return; // 사용자가 취소
        }
      }
      const u = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = u;
      link.download = "aremi.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, "image/png");
  }

  return createPortal(
    <div className="viewer">
      <div className="viewer-bar">
        <button onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <span className="viewer-count">
          {index + 1} / {photos.length}
        </span>
        <button
          className={editing ? "on" : ""}
          onClick={() => {
            setEditing((v) => !v);
            setSel(null);
          }}
        >
          {editing ? "완료" : "편집"}
        </button>
      </div>

      <div className="viewer-stage">
        {index > 0 && (
          <button
            className="viewer-nav prev"
            onClick={() => setIndex((i) => i - 1)}
            aria-label="이전"
          >
            ‹
          </button>
        )}
        <div
          className="viewer-frame"
          ref={frameRef}
          onPointerMove={onMove}
          onPointerUp={endDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.url} alt="" draggable={false} />
          {annos.map((a) => (
            <div
              key={a.id}
              className={`anno${sel === a.id ? " sel" : ""}${
                editing ? " editing" : ""
              }`}
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
              onPointerDown={(e) => startDrag(e, a.id)}
            >
              <span
                className={a.kind === "sticker" ? "anno-sticker" : "anno-text"}
                style={{
                  fontSize: `${(a.kind === "sticker" ? 46 : 22) * (a.size ?? 1)}px`,
                }}
              >
                {a.value}
              </span>
              {editing && sel === a.id && (
                <div
                  className="anno-tools"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button onClick={() => resize(a.id, -0.2)} aria-label="작게">
                    −
                  </button>
                  <button onClick={() => resize(a.id, 0.2)} aria-label="크게">
                    ＋
                  </button>
                  <button onClick={() => removeAnno(a.id)} aria-label="삭제">
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {index < photos.length - 1 && (
          <button
            className="viewer-nav next"
            onClick={() => setIndex((i) => i + 1)}
            aria-label="다음"
          >
            ›
          </button>
        )}
      </div>

      {editing ? (
        <div className="viewer-edit">
          <button className="add-text-btn" onClick={addText}>
            ＋ 텍스트
          </button>
          <div className="emoji-palette">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => addSticker(e)}>
                {e}
              </button>
            ))}
          </div>
          {photos.length > 1 && (
            <div className="reorder-row">
              <button onClick={() => moveCurrent(-1)} disabled={index === 0}>
                ◀ 앞으로
              </button>
              <button
                onClick={() => moveCurrent(1)}
                disabled={index === photos.length - 1}
              >
                뒤로 ▶
              </button>
            </div>
          )}
          <p className="viewer-hint dim">
            스티커/텍스트를 끌어 이동, 선택하면 −／＋ 로 크기 조절
          </p>
        </div>
      ) : (
        <>
          {photos.length > 1 && (
            <div className="viewer-dots">
              {photos.map((_, i) => (
                <button
                  key={i}
                  className={i === index ? "on" : ""}
                  onClick={() => setIndex(i)}
                  aria-label={`${i + 1}번 사진`}
                />
              ))}
            </div>
          )}
          <div className="viewer-actions">
            <button className="viewer-share" onClick={shareImage}>
              ⤴ 공유
            </button>
            <button className="viewer-del" onClick={() => onDelete(cur.meta.id)}>
              사진 삭제
            </button>
          </div>
        </>
      )}
    </div>,
    host
  );
}
