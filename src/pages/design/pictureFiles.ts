import type { Artifact } from '../../api/artifacts';
import { t } from '../../i18n';

/**
 * Pictures in and out of the image editor as files.
 *
 * PNG and JPEG are the picture alone. An .orkx file is an archive of the
 * picture and its project - name, prompt and what it was drawn with - so that
 * importing it again brings all of that back. The server writes and reads the
 * archive, so the format is defined in one place; here it only passes through.
 */

export type ExportFormat = 'png' | 'jpeg' | 'orkx';

/** A file read for importing: an .orkx archive, or a picture and the name its file gave it. */
export type ReadPicture = { archive: string } | { image: string; name: string | null };

export async function readPictureFile(file: File): Promise<ReadPicture> {
  if (file.name.toLowerCase().endsWith('.orkx')) return { archive: await dataUrlOf(file) };
  if (!file.type.startsWith('image/')) throw new Error(t('That file is not a picture.'));
  return { image: await dataUrlOf(file), name: file.name.replace(/\.[^.]+$/, '') || null };
}

/** Saves the picture to the computer as a PNG, a JPEG or an .orkx file. */
export async function exportPicture(workspaceId: string, picture: Artifact, name: string, format: ExportFormat): Promise<void> {
  if (format === 'orkx') {
    const answer = await fetch(`/api/workspaces/${workspaceId}/design/archive/${encodeURIComponent(picture.id)}`, { credentials: 'same-origin' });
    if (!answer.ok) throw new Error(t('Could not export the picture.'));
    save(await answer.blob(), `${fileBase(name)}.orkx`);
    return;
  }
  const stored = await (await fetch(picture.url, { credentials: 'same-origin' })).blob();
  const base = fileBase(name);
  const wanted = format === 'png' ? 'image/png' : 'image/jpeg';
  // Already that kind of file: handed over as it is stored, nothing re-encoded.
  if ((stored.type || picture.contentType) === wanted) {
    save(stored, `${base}.${format === 'png' ? 'png' : 'jpg'}`);
    return;
  }
  save(await reencoded(stored, wanted), `${base}.${format === 'png' ? 'png' : 'jpg'}`);
}

/** The picture drawn again as another kind of file; a JPEG has no transparency, so it goes on white. */
async function reencoded(stored: Blob, type: string): Promise<Blob> {
  const bitmap = await createImageBitmap(stored);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error(t('Could not export the picture.'));
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob === null ? reject(new Error(t('Could not export the picture.'))) : resolve(blob)), type, 0.92),
  );
}

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('Could not read the file.')));
    reader.readAsDataURL(blob);
  });
}

/** A name a file system takes. */
function fileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'picture';
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
