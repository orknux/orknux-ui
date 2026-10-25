import { graphql } from './client';
import { t } from '../i18n';

/**
 * Files attached to a chat.
 *
 * REST, because what crosses is bytes: a multipart form is what a browser makes
 * of a file picker, and JSON would mean base64 in both directions.
 *
 * Where they are kept is the installation's business — a directory per
 * workspace, on whatever storage was configured — so nothing here says anything
 * about it beyond which workspace is asking.
 */
export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export async function uploadAttachments(workspaceId: string, files: File[]): Promise<Attachment[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));

  const answer = await fetch(`/api/workspaces/${workspaceId}/attachments`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  const said = (await answer.json().catch(() => null)) as
    | { attachments?: Attachment[]; error?: string; message?: string }
    | null;
  if (!answer.ok) {
    throw new Error(said?.error ?? said?.message ?? t('Those files could not be uploaded.'));
  }
  return said?.attachments ?? [];
}

/**
 * Says which chat these belong to.
 *
 * Sent once the message is, because a first message is what makes the chat: the
 * files went up while the sentence was being typed and had nowhere to belong
 * until then.
 */
export async function attachToChat(chatId: string, attachmentIds: string[]): Promise<void> {
  await graphql<{ attachToChat: unknown }>(
    `mutation AttachToChat($chatId: ID!, $attachmentIds: [ID!]!) {
       attachToChat(chatId: $chatId, attachmentIds: $attachmentIds) { id }
     }`,
    { chatId, attachmentIds },
  );
}

/** What was attached to one chat, oldest first. */
export async function fetchChatAttachments(chatId: string): Promise<Attachment[]> {
  const data = await graphql<{ chatAttachments: Attachment[] }>(
    `query ChatAttachments($chatId: ID!) {
       chatAttachments(chatId: $chatId) { id filename contentType sizeBytes }
     }`,
    { chatId },
  );
  return data.chatAttachments;
}

/** Where the browser downloads one from; checked against the workspace on the way. */
export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}

/**
 * Whether the chat may show it rather than only offer it.
 *
 * The same list the server serves inline — raster pictures, and not SVG, which
 * is a document that can carry script.
 */
export function isShowable(contentType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(
    contentType.toLowerCase(),
  );
}

/**
 * Whether the chat may play it under the message in a `<video>`.
 *
 * The containers the server serves inline, and every browser's media element
 * plays; anything else is still a chip that downloads.
 */
export function isPlayable(contentType: string): boolean {
  return ['video/mp4', 'video/webm', 'video/ogg'].includes(contentType.toLowerCase());
}

/**
 * Whether the chat may play it under the message in an `<audio>`.
 *
 * The sounds the server serves inline: mp3, flac, wav, ogg and m4a/aac. MIDI is
 * notes rather than sound, and has [isMidi]'s Play instead.
 */
export function isAudible(contentType: string): boolean {
  return ['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'].includes(
    contentType.toLowerCase(),
  );
}

/** Whether it is a MIDI file: a score no browser plays, which the server renders to sound when Play is pressed. */
export function isMidi(contentType: string): boolean {
  return ['audio/midi', 'audio/mid', 'audio/x-midi', 'audio/x-mid'].includes(contentType.toLowerCase());
}

/** Where a MIDI attachment is served as sound: rendered by the server the first time, kept after. */
export function attachmentAudioUrl(id: string): string {
  return `/api/attachments/${id}/audio`;
}

/**
 * A MIDI attachment as sound, for Play.
 *
 * Fetched rather than handed to an `<audio>` as its address, because rendering
 * takes seconds the first time and the page says so while it does - and an
 * element given the address would say nothing until it played or failed.
 */
export function fetchAttachmentAudio(id: string): Promise<Blob> {
  return fetchSound(attachmentAudioUrl(id));
}

/**
 * A sound the server serves - an attachment, or a MIDI file's rendering - as
 * bytes to play, with the server's own sentence where it refused.
 */
export async function fetchSound(url: string): Promise<Blob> {
  const answer = await fetch(url, { credentials: 'include' });
  if (!answer.ok) {
    const said = (await answer.json().catch(() => null)) as { error?: string } | null;
    throw new Error(said?.error ?? t('That could not be played.'));
  }
  return answer.blob();
}

/** "2.4 MB", for a chip that has to fit beside a filename. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A turn of an editor's chat - the document, wireframe and diagram chats - with the files sent on it. */
export interface EditorTurn {
  role: 'user' | 'assistant';
  content: string;
  /** What was attached to this turn; the server is sent their ids and reads them for the model. */
  attachments?: Attachment[];
}

/** The turns as an editor's ask mutation takes them: each turn's files by id. */
export function editorTurnsInput(turns: EditorTurn[]): { role: string; content: string; attachmentIds: string[] }[] {
  return turns.map((turn) => ({ role: turn.role, content: turn.content, attachmentIds: (turn.attachments ?? []).map((file) => file.id) }));
}
