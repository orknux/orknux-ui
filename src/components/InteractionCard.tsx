import { useState } from 'react';
import { answerRequest, type InteractionRequest } from '../api/interactions';
import { t } from '../i18n';
import styles from './InteractionCard.module.css';

interface InteractionCardProps {
  request: InteractionRequest;
  /** Called with the request as the server answered it, so the caller can redraw what it changed. */
  onAnswered?: (request: InteractionRequest) => void;
}

/**
 * A question put to a person on an agent's behalf, with a button for each of
 * its options - drawn from the options alone, so a new kind of question needs
 * nothing here. Once it is answered, or settled somewhere else, the buttons
 * give way to what became of it.
 */
export function InteractionCard({ request, onAnswered }: InteractionCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = request.chosen === null;

  async function choose(option: string) {
    setBusy(true);
    setError(null);
    try {
      onAnswered?.(await answerRequest(request.id, option));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not send the answer.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={open ? `${styles.card} ${styles.open}` : styles.card}
      data-interaction={request.id}
      data-interaction-kind={request.kind}
      data-interaction-open={open ? 'true' : 'false'}
    >
      <span className={styles.badge}>{t('Question')}</span>
      <p className={styles.question}>{request.question}</p>
      {open ? (
        <div className={styles.options}>
          {request.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${option.style === 'primary' ? styles.primary : option.style === 'danger' ? styles.danger : ''}`}
              disabled={busy}
              onClick={() => void choose(option.id)}
              data-interaction-option={option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.outcome} data-interaction-outcome="">
          {request.outcome ?? request.options.find((option) => option.id === request.chosen)?.label ?? request.chosen}
          {request.chosenBy !== null && <span className={styles.by}> · {request.chosenBy}</span>}
        </p>
      )}
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Where each request goes among lines drawn in time order: before the first
 * line said after it was asked. Lines with no time do not move it; a request
 * asked after every timed line goes at the end, under index `lines.length`.
 */
export function placeRequests<T>(
  lines: T[],
  atOf: (line: T) => string | null,
  requests: InteractionRequest[],
  ascending = true,
): Map<number, InteractionRequest[]> {
  const placed = new Map<number, InteractionRequest[]>();
  for (const request of requests) {
    const asked = Date.parse(request.createdAt);
    let at = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
      const said = atOf(lines[index]);
      if (said === null) continue;
      const when = Date.parse(said);
      if (ascending ? when > asked : when < asked) {
        at = index;
        break;
      }
    }
    placed.set(at, [...(placed.get(at) ?? []), request]);
  }
  return placed;
}
