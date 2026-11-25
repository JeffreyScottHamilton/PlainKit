import { addFiles } from '@/session/store';

/** Folder drops: walks dropped directory entries and keeps each file's relative path as its name. */
async function walk(entry: FileSystemEntry, dir: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push(new File([file], dir + entry.name, { type: file.type }));
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, `${dir}${entry.name}/`, out);
  }
}

/** Adds files with their relative paths to the session. Adding never starts work. */
export async function addWithPaths(entries: FileSystemEntry[]): Promise<number> {
  const out: File[] = [];
  for (const e of entries) await walk(e, '', out);
  if (out.length) addFiles(out, 'zip');
  return out.length;
}

/** Files from a webkitdirectory input, named by their path inside the chosen folder. */
export function namedByPath(list: FileList): File[] {
  return [...list].map((f) => (f.webkitRelativePath ? new File([f], f.webkitRelativePath, { type: f.type }) : f));
}
