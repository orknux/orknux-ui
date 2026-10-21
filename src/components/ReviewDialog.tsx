import { useEffect, useRef, useState } from 'react';

import { sendChatReview } from '../api/ratings';
import { t } from '../i18n';
import styles from './Dialog.module.css';
import own from './ReviewDialog.module.css';

const SCORES = [1, 2, 3, 4, 5];

export interface ReviewDialogProps {
  /** The chat being reviewed, or null while the dialog is closed. */
  chatId: string | null;
  onClose: () => void;
  /** Called once the review has been kept. */
  onSent: () => void;
}

/**
 * A review of the chat the person is in, sent without asking the agent: a
 * score from 1 to 5, which every review has, and their words if they have any.
 * The same review the agent would pass on through rate_session, and held to
 * the same switch and limit by the server.
 */
export function ReviewDialog({ chatId, onClose, onSent }: ReviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [score, setScore] = useState<number | null>(null);
  const [review, setReview] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (chatId !== null && !dialog.open) {
      setScore(null);
      setReview('');
      setError(null);
      setSending(false);
      dialog.showModal();
    } else if (chatId === null && dialog.open) {
      dialog.close();
    }
  }, [chatId]);

  async function send() {
    if (chatId === null || score === null || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendChatReview(chatId, score, review);
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not send the review.'));
      setSending(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} data-testid="review-dialog">
      <form
        className={styles.body}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{t('Send a review')}</h2>
        </div>
        <div className={styles.fields}>
          <div className={own.scores} role="radiogroup" aria-label={t('Score')}>
            {SCORES.map((one) => (
              <button
                key={one}
                type="button"
                role="radio"
                aria-checked={score === one}
                className={score === one ? `${own.score} ${own.scoreOn}` : own.score}
                onClick={() => setScore(one)}
              >
                {one}
              </button>
            ))}
            <span className={own.scale}>{t('1 is poor, 5 is excellent')}</span>
          </div>
          <textarea
            className={own.text}
            value={review}
            onChange={(event) => setReview(event.target.value)}
            placeholder={t('What went well or wrong (optional)')}
            aria-label={t('Review')}
            rows={4}
          />
        </div>
        {error !== null && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={sending}>
            {t('Cancel')}
          </button>
          <button type="submit" className={styles.filled} disabled={score === null || sending}>
            {sending ? t('Sending…') : t('Send review')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
