import { useEffect, useRef, useState } from 'react';

import { attachmentUrl, fetchAttachmentAudio, isMidi } from '../api/attachments';
import type { Attachment } from '../api/attachments';
import { t, tf } from '../i18n';
import styles from './AttachmentSound.module.css';

/**
 * A sound attached to a message, played where it is.
 *
 * A recording is the browser's own `<audio controls>` - play and pause, a seek
 * bar and the time are the element's, and every browser draws them in a way its
 * users already know - with a download beside it, which the element offers in
 * some browsers and not in others.
 *
 * A MIDI file is a score, and no browser plays one. It gets a Play that asks the
 * server to render it (once; the server keeps the rendering) and says so while
 * it does, because the first time is seconds of nothing otherwise; then the same
 * player, playing.
 */
export function AttachmentSound({ file }: { file: Attachment }) {
  const midi = isMidi(file.contentType);
  /** The rendering, as an object URL, once a MIDI file has been asked for. */
  const [rendered, setRendered] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  // The rendering's bytes are let go with the message rather than kept for as long as the page is open.
  useEffect(() => () => {
    if (rendered !== null) URL.revokeObjectURL(rendered);
  }, [rendered]);

  // Played the moment it arrives: somebody pressed Play, and a second press should not be needed.
  useEffect(() => {
    if (rendered !== null) void player.current?.play().catch(() => undefined);
  }, [rendered]);

  async function render() {
    setRendering(true);
    setFailed(null);
    try {
      setRendered(URL.createObjectURL(await fetchAttachmentAudio(file.id)));
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : t('That could not be played.'));
    } finally {
      setRendering(false);
    }
  }

  const source = midi ? rendered : attachmentUrl(file.id);
  return (
    <div className={styles.sound} data-message-sound={file.id}>
      {source !== null && (
        <audio
          ref={player}
          className={styles.player}
          src={source}
          controls
          preload="metadata"
          title={file.filename}
          // The element itself is what a check measures, and what the chat has always marked as the file.
          {...(midi ? { 'data-midi-player': '' } : { 'data-message-file': file.id, 'data-message-audio': '' })}
        />
      )}
      <div className={styles.bar} {...(midi ? { 'data-message-file': file.id, 'data-message-midi': '' } : {})}>
        <span className={styles.name} title={file.filename}>
          {file.filename}
        </span>
        {midi && rendered === null && (
          <button type="button" className={styles.play} onClick={() => void render()} disabled={rendering} data-midi-play="">
            {rendering ? t('Rendering…') : t('Play')}
          </button>
        )}
        <a className={styles.download} href={attachmentUrl(file.id)} download={file.filename} title={tf('Download {name}', { name: file.filename })}>
          {t('Download')}
        </a>
      </div>
      {failed !== null && <span className={styles.error}>{failed}</span>}
    </div>
  );
}
