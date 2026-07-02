import { photoStore } from "./photos";

/** 일정/일기/기분/다녀옴 + 사진(dataURL)까지 한 JSON으로 내보내기 */
export async function exportBackupBlob(plan: unknown): Promise<Blob> {
  const photos = await photoStore.exportAll();
  const payload = {
    app: "aremi",
    version: 1,
    exportedAt: Date.now(),
    plan,
    photos,
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

/** 백업 파일을 읽어 사진은 복원하고, plan(로컬 상태)만 돌려준다 */
export async function readBackupFile(file: File): Promise<any> {
  const data = JSON.parse(await file.text());
  if (data.app !== "aremi") throw new Error("Aremi 백업 파일이 아니에요.");
  if (Array.isArray(data.photos)) await photoStore.importAll(data.photos);
  return data.plan ?? {};
}
