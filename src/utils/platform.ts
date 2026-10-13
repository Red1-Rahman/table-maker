import type { ExportedFile } from '@/types/export';

export const isTauri = (): boolean => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const toBytes = (d: Uint8Array | string): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

function browserDownload(file: ExportedFile) {
  const blob = new Blob([toBytes(file.data) as BlobPart], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Saves a file: native Save dialog on desktop (Tauri), browser download on the web. */
export async function saveFile(file: ExportedFile): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const ext = file.name.split('.').pop() ?? '';
      const path = await save({ defaultPath: file.name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!path) return false;
      await writeFile(path, toBytes(file.data));
      return true;
    } catch (e) {
      console.warn('Native save failed, falling back to browser download', e);
    }
  }
  browserDownload(file);
  return true;
}

export async function saveFiles(files: ExportedFile[]): Promise<void> {
  for (const f of files) {
    await saveFile(f);
    if (!isTauri() && files.length > 1) await new Promise((r) => setTimeout(r, 250)); // let browsers accept multiple downloads
  }
}
