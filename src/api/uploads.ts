import { refusalOf } from './client';
import { installationNow } from '../session/installation';
import { t } from '../i18n';

/**
 * What every upload of a person's files shares: the size check against the
 * installation's current limit before a byte is sent, one file per request,
 * and a refusal said in words.
 *
 * Before this a file past the limit went up whole and the server's multipart
 * cap dropped the connection, so the chat said the browser's "Failed to fetch".
 * The limit is Admin Settings' Largest file and changes while a tab is open, so
 * it is read from the installation's settings each time rather than kept here;
 * the server checks it again, with the same sentence.
 */

const MEGABYTE = 1024 * 1024;

/**
 * The refusal for [file] past [limitMb], said as the server says it - same
 * code, same arguments - so the catalogue gives it the reader's language.
 * Rounded up, so a file a little over is never said to be the limit's size.
 */
export function tooLarge(file: { name: string; size: number }, limitMb: number): string {
  const sizeMb = Math.ceil(file.size / MEGABYTE);
  return refusalOf(
    `${file.name} is ${sizeMb} MB; uploads are limited to ${limitMb} MB - an administrator can raise it in Admin Settings → Attachments`,
    'AttachmentTooLarge',
    { name: file.name, sizeMb, limitMb },
  );
}

/**
 * Throws, in words, when one of [files] is past the limit. Asked before
 * anything is sent, so one file too many keeps the others from going up half.
 * Where the settings cannot be read the server is left to say it.
 */
export async function refuseOversized(files: File[]): Promise<void> {
  const limitMb = await installationNow().then((held) => held.attachmentMaxFileSizeMb).catch(() => null);
  if (limitMb === null) return;
  const over = files.find((file) => file.size > limitMb * MEGABYTE);
  if (over !== undefined) throw new Error(tooLarge(over, limitMb));
}

interface Refused {
  error?: string;
  message?: string;
  code?: string;
  arguments?: Record<string, unknown>;
}

/**
 * Sends one upload and reads its answer, or throws what went wrong in words:
 * the server's refusal in the reader's language where it sent one, and a
 * connection that broke said as one rather than as "Failed to fetch".
 */
export async function sendUpload<T>(url: string, form: FormData, fallback: string): Promise<T> {
  let answer: Response;
  try {
    answer = await fetch(url, { method: 'POST', body: form, credentials: 'include' });
  } catch {
    throw new Error(t('The server could not be reached, or the connection to it broke before it answered.'));
  }
  const said = (await answer.json().catch(() => null)) as (T & Refused) | null;
  if (!answer.ok) {
    const message = said?.message ?? said?.error;
    throw new Error(message === undefined ? fallback : refusalOf(message, said?.code, said?.arguments));
  }
  return (said ?? {}) as T;
}
