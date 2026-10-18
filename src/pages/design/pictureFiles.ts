import type { Artifact } from '../../api/artifacts';
import { t } from '../../i18n';

/**
 * Pictures in and out of the image editor as files.
 *
 * PNG and JPEG are the picture alone. An .orkx file is the picture with what
 * Orknux knows about it - its name and the prompt it was drawn from - so that
 * importing it again brings those back rather than a nameless picture. It is
 * JSON, and the picture inside it is the stored file itself, byte for byte.
 */

export type ExportFormat = 'png' | 'jpeg' | 'orkx';

/** What an .orkx file says it is, and the shape it has; read as data, never trusted further. */
const ORKX_FORMAT = 'orknux-picture';
const ORKX_VERSION = 1;

interface OrkxFile {
  format: typeof ORKX_FORMAT;
  version: number;
  name: string | null;
  prompt: string | null;
  contentType: string;
  /** The picture, as a data URL. */
  image: string;
  drawnWith: Artifact['drawnWith'];
}

/** A file read for importing: the picture as a data URL, and what the file said about it. */
export interface ReadPicture {
  image: string;
  name: string | null;
  prompt: string | null;
}

export async function readPictureFile(file: File): Promise<ReadPicture> {
  if (file.name.toLowerCase().endsWith('.orkx')) {
    let parsed: Partial<OrkxFile>;
    try {
      parsed = JSON.parse(await file.text()) as Partial<OrkxFile>;
    } catch {
      throw new Error(t('That .orkx file could not be read.'));
    }
    if (parsed.format !== ORKX_FORMAT || typeof parsed.image !== 'string') {
      throw new Error(t('That .orkx file holds no picture.'));
    }
    return {
      image: parsed.image,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : null,
    };
  }
  if (!file.type.startsWith('image/')) throw new Error(t('That file is not a picture.'));
  return { image: await dataUrlOf(file), name: file.name.replace(/\.[^.]+$/, '') || null, prompt: null };
}

/** Saves the picture to the computer as a PNG, a JPEG or an .orkx file. */
export async function exportPicture(picture: Artifact, name: string, format: ExportFormat): Promise<void> {
  const stored = await (await fetch(picture.url, { credentials: 'same-origin' })).blob();
  const base = fileBase(name);
  if (format === 'orkx') {
    const file: OrkxFile = {
      format: ORKX_FORMAT,
      version: ORKX_VERSION,
      name,
      prompt: picture.prompt,
      contentType: stored.type || picture.contentType,
      image: await dataUrlOf(stored),
      drawnWith: picture.drawnWith,
    };
    save(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${base}.orkx`);
    return;
  }
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
