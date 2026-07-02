// 사진 저장소 — 인터페이스 뒤에 구현을 숨긴다.
// 지금은 IndexedDB(기기 로컬) 구현을 쓰고, 나중에 같은 인터페이스로
// SupabasePhotoStore를 만들어 맨 아래 export 한 줄만 바꾸면 클라우드로 전환된다.

/** 사진 위에 얹는 텍스트/스티커 (좌표는 이미지 기준 0~1 비율) */
export interface Annotation {
  id: string;
  kind: "text" | "sticker";
  value: string;
  x: number;
  y: number;
  size?: number; // 기본 1 (배율)
}

export interface PhotoMeta {
  id: string;
  eventId: string; // 어떤 일정(장소)의 사진인지
  date: string; // "YYYY-MM-DD"
  createdAt: number;
  order: number; // 표시 순서 (작을수록 먼저)
  annotations: Annotation[];
}

export interface PhotoStore {
  /** 사진 추가 (Blob/File) → 메타 반환 */
  add(eventId: string, date: string, file: Blob): Promise<PhotoMeta>;
  /** 한 일정의 사진 목록 */
  list(eventId: string): Promise<PhotoMeta[]>;
  /** 화면에 표시할 URL (로컬=objectURL, 클라우드=공개/서명 URL) */
  getURL(id: string): Promise<string | null>;
  /** 사진 위 메모/스티커 저장 */
  setAnnotations(id: string, annotations: Annotation[]): Promise<void>;
  /** 표시 순서 저장 */
  setOrder(id: string, order: number): Promise<void>;
  /** 사진 삭제 */
  remove(id: string): Promise<void>;
}

// ─────────────────────────── IndexedDB 구현 (현재) ───────────────────────────
const DB_NAME = "aremi";
const STORE = "photos";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("eventId", "eventId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

interface PhotoRecord extends PhotoMeta {
  blob: Blob;
}

function pid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

class IndexedDbPhotoStore implements PhotoStore {
  async add(eventId: string, date: string, file: Blob): Promise<PhotoMeta> {
    const db = await openDB();
    const now = Date.now();
    const meta: PhotoMeta = {
      id: pid(),
      eventId,
      date,
      createdAt: now,
      order: now,
      annotations: [],
    };
    await new Promise<void>((resolve, reject) => {
      const r = store(db, "readwrite").put({ ...meta, blob: file } as PhotoRecord);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    return meta;
  }

  async list(eventId: string): Promise<PhotoMeta[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = store(db, "readonly").index("eventId").getAll(eventId);
      r.onsuccess = () =>
        resolve(
          (r.result as PhotoRecord[])
            .map(({ blob, ...m }) => ({
              ...m,
              annotations: m.annotations ?? [],
              order: m.order ?? m.createdAt,
            }))
            .sort((a, b) => a.order - b.order)
        );
      r.onerror = () => reject(r.error);
    });
  }

  async setAnnotations(id: string, annotations: Annotation[]): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const os = store(db, "readwrite");
      const get = os.get(id);
      get.onsuccess = () => {
        const rec = get.result as PhotoRecord | undefined;
        if (!rec) return resolve();
        rec.annotations = annotations;
        const put = os.put(rec);
        put.onsuccess = () => resolve();
        put.onerror = () => reject(put.error);
      };
      get.onerror = () => reject(get.error);
    });
  }

  async getURL(id: string): Promise<string | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = store(db, "readonly").get(id);
      r.onsuccess = () => {
        const rec = r.result as PhotoRecord | undefined;
        resolve(rec ? URL.createObjectURL(rec.blob) : null);
      };
      r.onerror = () => reject(r.error);
    });
  }

  async setOrder(id: string, order: number): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const os = store(db, "readwrite");
      const get = os.get(id);
      get.onsuccess = () => {
        const rec = get.result as PhotoRecord | undefined;
        if (!rec) return resolve();
        rec.order = order;
        const put = os.put(rec);
        put.onsuccess = () => resolve();
        put.onerror = () => reject(put.error);
      };
      get.onerror = () => reject(get.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const r = store(db, "readwrite").delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
}

// ─────────────────────── Supabase 구현 (나중에) — 참고용 골격 ───────────────────────
// import { supabase } from "./supabase";
// class SupabasePhotoStore implements PhotoStore {
//   async add(eventId, date, file) {
//     const id = pid();
//     const path = `${eventId}/${id}`;
//     await supabase.storage.from("photos").upload(path, file);
//     await supabase.from("event_photos").insert({ id, event_id: eventId, date, storage_path: path });
//     return { id, eventId, date, createdAt: Date.now() };
//   }
//   async list(eventId) { /* select from event_photos where event_id = eventId */ }
//   async getURL(id) { /* getPublicUrl / createSignedUrl(path) */ }
//   async remove(id) { /* storage.remove + delete row */ }
// }

// 👉 전환 지점: 여기 한 줄만 SupabasePhotoStore로 바꾸면 UI 코드는 그대로 동작한다.
export const photoStore: PhotoStore = new IndexedDbPhotoStore();
