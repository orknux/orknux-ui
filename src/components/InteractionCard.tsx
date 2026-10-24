import { useState } from 'react';
import { answerRequest, answerRequestWith, type InteractionRequest } from '../api/interactions';
import { t } from '../i18n';
import { Markdown } from './Markdown';
import styles from './InteractionCard.module.css';

/** An agent's plan in a chat in plan mode, put to the person to approve. Issue #653. */
export const PLAN_KIND = 'agent.plan';

/**
 * The labels the server gives its fixed questions, as the person reads them.
 * The server keeps them English because they also reach the session page and
 * the log; a label nobody listed here - an agent's own options - is shown as
 * it came.
 */
function labelled(label: string): string {
  switch (label) {
    case 'Approve':
      return t('Approve');
    case 'Approved':
      return t('Approved');
    case 'Keep planning':
      return t('Keep planning');
    default:
      return label;
  }
}

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
  const [ticked, setTicked] = useState<string[]>([]);
  const [words, setWords] = useState('');
  const open = request.chosen === null;
  const plan = request.kind === PLAN_KIND;
  /*
   * A menu rather than a row of buttons where there is more to it than which
   * button: a line under each option, several to tick, or the person's own
   * words. An agent's ask_person question is all three; Allow / Reject is none.
   */
  const menu = request.multiple || request.allowsText || request.options.some((option) => Boolean(option.description));

  function choose(option: string) {
    void send(() => answerRequest(request.id, option));
  }

  async function send(answering: () => Promise<InteractionRequest>) {
    setBusy(true);
    setError(null);
    try {
      onAnswered?.(await answering());
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
      <span className={styles.badge}>{plan ? t('Plan') : t('Question')}</span>
      {/* A plan is what the model wrote, in markdown; a question is one sentence. */}
      {plan ? (
        <div className={styles.question} data-interaction-plan="">
          <Markdown>{request.question}</Markdown>
        </div>
      ) : (
        <p className={styles.question}>{request.question}</p>
      )}
      {/*
        What it is about, one line each - the tools an agent asks for, with what
        sort of tool each is and what it does - so the person sees exactly what
        Accept would give before giving it.
      */}
      {request.items.length > 0 && (
        <ul className={styles.items} data-interaction-items="">
          {request.items.map((item) => (
            <li key={item.name} className={styles.item} data-interaction-item={item.name}>
              <span className={styles.itemName}>{item.name}</span>
              {item.kind !== null && <span className={styles.itemKind}>{item.kind}</span>}
              {item.description !== null && <span className={styles.itemDescription}>{item.description}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && menu ? (
        <form
          className={styles.menu}
          onSubmit={(event) => {
            event.preventDefault();
            void send(() => answerRequestWith(request.id, ticked, words.trim() === '' ? null : words.trim()));
          }}
        >
          <div className={styles.choices} role={request.multiple ? 'group' : undefined}>
            {request.options.map((option, index) => {
              const on = ticked.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={on ? `${styles.choice} ${styles.ticked}` : styles.choice}
                  disabled={busy}
                  aria-pressed={request.multiple ? on : undefined}
                  onClick={() =>
                    request.multiple
                      ? setTicked((held) => (on ? held.filter((id) => id !== option.id) : [...held, option.id]))
                      : choose(option.id)
                  }
                  data-interaction-option={option.id}
                >
                  {request.multiple && <span className={styles.box} aria-hidden="true" />}
                  {/* Numbered, so an answer in words can say "the second one". */}
                  <span className={styles.choiceNumber} data-choice-number>{index + 1}.</span>
                  <span className={styles.choiceText}>
                    <span className={styles.choiceLabel}>{labelled(option.label)}</span>
                    {Boolean(option.description) && <span className={styles.choiceDescription}>{option.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {(request.allowsText || request.multiple) && (
            <div className={styles.answerRow}>
              {request.allowsText && (
                <input
                  className={styles.words}
                  value={words}
                  onChange={(event) => setWords(event.target.value)}
                  placeholder={t('Or answer in your own words')}
                  aria-label={t('Your own answer')}
                  disabled={busy}
                  data-interaction-text=""
                />
              )}
              <button
                type="submit"
                className={`${styles.option} ${styles.primary}`}
                disabled={busy || (ticked.length === 0 && words.trim() === '')}
                data-interaction-send=""
              >
                {t('Send')}
              </button>
            </div>
          )}
        </form>
      ) : open ? (
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
              {labelled(option.label)}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.outcome} data-interaction-outcome="">
          {request.outcome !== null
            ? labelled(request.outcome)
            : labelled(request.options.find((option) => option.id === request.chosen)?.label ?? request.chosen ?? '')}
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
  /** Whether undated lines after the last dated one are the present, which a request is put before. */
  undatedIsPresent = true,
): Map<number, InteractionRequest[]> {
  const placed = new Map<number, InteractionRequest[]>();
  /*
   * Lines with no time after the last one that has one are the present - an
   * answer still being written - so a request comes before them. Undated lines
   * further up are older ones and are passed over.
   */
  let lastDated = -1;
  lines.forEach((line, index) => {
    if (atOf(line) !== null) lastDated = index;
  });
  for (const request of requests) {
    const asked = Date.parse(request.createdAt);
    let at = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
      const said = atOf(lines[index]);
      if (said === null) {
        if (undatedIsPresent && ascending && index > lastDated) {
          at = index;
          break;
        }
        continue;
      }
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
