import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { attachmentUrl, isShowable, uploadAttachments } from '../../api/attachments';
import type { Attachment, EditorTurn } from '../../api/attachments';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import paperclipIcon from '../../assets/paperclip.svg';
import sendIcon from '../../assets/send.svg';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { Select } from '../../components/Select';
import form from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import { useInstallation } from '../../session/installation';
import styles from './WireframeEditorPage.module.css';

/** What an empty chat offers: a pressed card is sent as it is, so each prompt is whole on its own. */
export interface ChatIdea {
  icon: string;
  title: () => string;
  line: () => string;
  prompt: () => string;
}

export type ChatTurnShown = EditorTurn;

/**
 * The files waiting in an editor chat's composer, from [useChatFiles]: uploaded
 * the moment they are dropped or picked, as the main chat uploads them, so a
 * failure is a chip that did not appear rather than a message that would not go.
 */
export interface ChatFiles {
  /** Whether this installation takes attachments at all; nothing is offered where it does not. */
  allowed: boolean;
  attached: Attachment[];
  attaching: boolean;
  error: string | null;
  add: (files: File[]) => void;
  remove: (id: string) => void;
  /** What is attached, handed over for the turn being sent and cleared from the composer. */
  take: () => Attachment[];
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
  /** Files dropped on the chat or picked with its paperclip, sent with the next turn. */
  files: ChatFiles;
  /** Under the box: the editor's own error and counts. */
  footer?: ReactNode;
}

/**
 * The conversation down the right of a Design editor: a welcome with ideas
 * while it is empty, the turns once it is not, and the box to ask in with the
 * model and Send along its foot. One chat for the wireframe, document and
 * diagram editors, so files dropped on any of them are taken the same way.
 */
export function DesignChat(props: DesignChatProps) {
  const { prefix, talk, answering, files } = props;
  const talkEnd = useRef<HTMLDivElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  /** Files dropped or picked, and the box focused with the caret at the end, so the words about them come next. */
  function attach(picked: File[]) {
    if (picked.length === 0) return;
    files.add(picked);
    const field = box.current;
    if (field === null) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    talkEnd.current?.scrollIntoView({ block: 'end' });
  }, [talk, answering]);

  const nothingToSend = props.asking.trim() === '' && files.attached.length === 0;

  return (
    /*
      Files dropped anywhere on the conversation are attached, as the main chat
      takes them. Without this a dropped file was the browser's to handle: it
      opened the file in place of the editor and the drawing was gone.
    */
    <div
      className={styles.chatArea}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = files.allowed ? 'copy' : 'none';
        if (files.allowed) setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropping(false);
        if (files.allowed) attach(Array.from(event.dataTransfer.files));
      }}
      data-testid={`${prefix}-chat-area`}
    >
      {dropping && (
        <div className={styles.dropZone} data-testid={`${prefix}-chat-drop-zone`} aria-hidden="true">
          {t('Drop to attach')}
        </div>
      )}
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
                  disabled={props.modelId === '' || !props.ready || files.attaching}
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
            {(turn.attachments ?? []).length > 0 && (
              <span className={styles.sentFiles}>
                {(turn.attachments ?? []).map((file) => (
                  <a
                    key={file.id}
                    className={styles.sentFile}
                    href={attachmentUrl(file.id)}
                    download={file.filename}
                    title={file.filename}
                    data-testid={`${prefix}-chat-message-file`}
                  >
                    {isShowable(file.contentType) && <img className={styles.fileThumb} src={attachmentUrl(file.id)} alt="" />}
                    <span className={styles.fileName}>{file.filename}</span>
                  </a>
                ))}
              </span>
            )}
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
          {/* What is going with the message, above the box it is going from. */}
          {files.attached.length > 0 && (
            <div className={styles.files}>
              {files.attached.map((file) => (
                <span key={file.id} className={styles.file} data-testid={`${prefix}-chat-attachment`}>
                  {isShowable(file.contentType) && <img className={styles.fileThumb} src={attachmentUrl(file.id)} alt="" />}
                  <span className={styles.fileName} title={file.filename}>
                    {file.filename}
                  </span>
                  <button
                    type="button"
                    className={styles.fileRemove}
                    onClick={() => files.remove(file.id)}
                    aria-label={tf('Remove {name}', { name: file.filename })}
                    title={tf('Remove {name}', { name: file.filename })}
                    data-testid={`${prefix}-chat-attachment-remove`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={box}
            className={styles.ask}
            value={props.asking}
            onChange={(event) => props.onAsking(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            /*
              A pasted picture is attached the way a dropped one is. Only a paste
              that carries files and no text is taken over, so copying a cell
              from a spreadsheet - which carries both - still pastes the words.
            */
            onPaste={(event) => {
              if (!files.allowed) return;
              const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
              if (pasted.length === 0 || event.clipboardData.getData('text/plain') !== '') return;
              event.preventDefault();
              files.add(pasted);
            }}
            placeholder={props.placeholder}
            aria-label={props.inputLabel}
            data-testid={`${prefix}-chat-input`}
          />
          {files.error !== null && (
            <p className={form.error} role="alert" data-testid={`${prefix}-chat-attach-error`}>
              {files.error}
            </p>
          )}
          <div className={styles.askBar}>
            {files.allowed && (
              <>
                <button
                  type="button"
                  className={styles.attach}
                  onClick={() => picker.current?.click()}
                  disabled={files.attaching}
                  aria-label={t('Attach files')}
                  title={files.attaching ? t('Uploading…') : t('Attach files')}
                  data-testid={`${prefix}-chat-attach`}
                >
                  {files.attaching ? <Loader label="" delay={0} size={14} /> : <img src={paperclipIcon} alt="" width={16} height={16} />}
                </button>
                <input
                  ref={picker}
                  className={styles.filePicker}
                  type="file"
                  multiple
                  onChange={(event) => {
                    attach(Array.from(event.target.files ?? []));
                    // Cleared so the same file can be picked twice in a row.
                    event.target.value = '';
                  }}
                  aria-hidden="true"
                  tabIndex={-1}
                  data-testid={`${prefix}-chat-file-input`}
                />
              </>
            )}
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
              disabled={nothingToSend || props.modelId === '' || answering || !props.ready || files.attaching}
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
    </div>
  );
}

/**
 * The files an editor chat's composer holds. Uploaded through the same door,
 * and to the same limits, as the main chat's; offered only where this
 * installation takes attachments.
 */
export function useChatFiles(workspaceId: string): ChatFiles {
  const installation = useInstallation();
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = installation?.attachmentsEnabled === true && workspaceId !== '';

  function add(picked: File[]) {
    if (picked.length === 0 || !allowed) return;
    setAttaching(true);
    setError(null);
    uploadAttachments(workspaceId, picked)
      .then((held) => setAttached((current) => [...current, ...held]))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Those files could not be uploaded.')))
      .finally(() => setAttaching(false));
  }

  return {
    allowed,
    attached,
    attaching,
    error,
    add,
    remove: (id) => setAttached((current) => current.filter((file) => file.id !== id)),
    take: () => {
      const sending = attached;
      setAttached([]);
      setError(null);
      return sending;
    },
  };
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
