import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import sendIcon from '../../assets/send.svg';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { Select } from '../../components/Select';
import form from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import styles from './WireframeEditorPage.module.css';

/** What an empty chat offers: a pressed card is sent as it is, so each prompt is whole on its own. */
export interface ChatIdea {
  icon: string;
  title: () => string;
  line: () => string;
  prompt: () => string;
}

export interface ChatTurnShown {
  role: 'user' | 'assistant';
  content: string;
}

export interface DesignChatProps {
  /** What the test ids start with - `wireframe`, `document` - so each editor's checks find their own. */
  prefix: string;
  firstName: string;
  /** The welcome's second line: "What shall we sketch?". */
  question: string;
  ideas: ChatIdea[];
  /** Whether there is anything to talk about yet: the drawing or the document has loaded. */
  ready: boolean;
  talk: ChatTurnShown[];
  answering: boolean;
  talkError: string | null;
  /** What is said while the model works: "Drawing…", "Writing…". */
  working: string;
  asking: string;
  onAsking: (text: string) => void;
  /** Send what is typed, or a card's prompt. */
  onAsk: (event?: FormEvent<HTMLFormElement>, idea?: string) => void;
  models: Model[] | null;
  modelId: string;
  onModel: (id: string) => void;
  placeholder: string;
  inputLabel: string;
  /** Under the box: the editor's own error and counts. */
  footer?: ReactNode;
}

/**
 * The conversation down the right of a Design editor: a welcome with ideas
 * while it is empty, the turns once it is not, and the box to ask in with the
 * model and Send along its foot. The wireframe editor's, shared by the
 * document editor, so the two editors' chats are one chat in two places.
 */
export function DesignChat(props: DesignChatProps) {
  const { prefix, talk, answering } = props;
  const talkEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    talkEnd.current?.scrollIntoView({ block: 'end' });
  }, [talk, answering]);

  return (
    <>
      <div className={styles.talk} data-testid={`${prefix}-chat`}>
        {talk.length === 0 && !answering && (
          <div className={styles.welcome} data-testid={`${prefix}-welcome`}>
            <h2 className={styles.hello}>
              {tf('Hi {name}!', { name: props.firstName })}
              <span>{props.question}</span>
            </h2>
            <div className={styles.ideas}>
              {props.ideas.map((idea) => (
                <button
                  key={idea.icon + idea.title()}
                  type="button"
                  className={styles.idea}
                  disabled={props.modelId === '' || !props.ready}
                  onClick={() => props.onAsk(undefined, idea.prompt())}
                  data-testid={`${prefix}-idea`}
                >
                  <span className={styles.ideaIcon}>
                    <img src={idea.icon} alt="" width={18} height={18} />
                  </span>
                  <span className={styles.ideaText}>
                    <span className={styles.ideaTitle}>{idea.title()}</span>
                    <span className={styles.ideaLine}>{idea.line()}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {talk.map((turn, index) => (
          <div
            key={index}
            className={turn.role === 'user' ? styles.mine : styles.theirs}
            data-testid={`${prefix}-chat-message`}
            data-role={turn.role}
          >
            {turn.role === 'user' ? turn.content : <Markdown>{turn.content}</Markdown>}
          </div>
        ))}
        {answering && (
          <div className={styles.theirs}>
            <Loader label={props.working} delay={0} size={16} />
          </div>
        )}
        {props.talkError !== null && (
          <p className={form.error} role="alert" data-testid={`${prefix}-chat-error`}>
            {props.talkError}
          </p>
        )}
        <div ref={talkEnd} />
      </div>

      <form className={styles.composer} onSubmit={(event) => props.onAsk(event)}>
        <div className={styles.askBox}>
          <textarea
            className={styles.ask}
            value={props.asking}
            onChange={(event) => props.onAsking(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={props.placeholder}
            aria-label={props.inputLabel}
            data-testid={`${prefix}-chat-input`}
          />
          <div className={styles.askBar}>
            <Select
              className={`${form.input} ${form.select} ${styles.modelPill}`}
              value={props.modelId}
              onChange={props.onModel}
              disabled={props.models === null || props.models.length === 0}
              aria-label={t('Model')}
              title={t('Model')}
              data-testid={`${prefix}-chat-model`}
            >
              {props.models !== null && props.models.length === 0 && <option value="">{t('This workspace has no chat model')}</option>}
              {(props.models ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.providerName}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className={styles.send}
              disabled={props.asking.trim() === '' || props.modelId === '' || answering || !props.ready}
              title={answering ? props.working : t('Send')}
              aria-label={t('Send')}
              data-testid={`${prefix}-chat-send`}
            >
              {answering ? <Loader label="" delay={0} size={14} /> : <img src={sendIcon} alt="" width={16} height={16} data-keeps-colour="" />}
            </button>
          </div>
        </div>
        {props.footer}
      </form>
    </>
  );
}

/**
 * The workspace's chat models, and the one this person last picked here -
 * remembered per workspace under [key], as the wireframe editor remembers its.
 */
export function useChatModels(workspaceId: string, key: (workspaceId: string) => string) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => {
        const chat = all.filter((one) => one.kind === 'CHAT' && one.enabled !== false);
        setModels(chat);
        let remembered: string | null = null;
        try {
          remembered = localStorage.getItem(key(workspaceId));
        } catch {
          remembered = null;
        }
        setModelId(chat.some((one) => one.id === remembered) ? (remembered ?? '') : (chat[0]?.id ?? ''));
      })
      .catch(() => setModels([]));
    // `key` names a place in storage; a new function for the same name is not a new place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  const choose = (picked: string) => {
    setModelId(picked);
    try {
      localStorage.setItem(key(workspaceId), picked);
    } catch {
      // Remembered for this visit only.
    }
  };
  return { models, modelId, choose };
}
