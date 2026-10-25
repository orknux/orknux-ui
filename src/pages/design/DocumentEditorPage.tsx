import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { importDesignImage } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import {
  PAGE_SIZES,
  askDocument,
  checkGrammar,
  contentOf,
  documentPath,
  fetchDocument,
  fetchDocumentCompletion,
  fetchGrammarSettings,
  renameDocument,
  saveDocument,
} from '../../api/documents';
import type { DesignDocument, DocumentSettings, DocumentTurn, GrammarMatch, GrammarSettings, Margins, Orientation, PageSize } from '../../api/documents';
import type { SessionUser } from '../../api/session';
import { fetchWorkspace } from '../../api/workspaces';
import boldIcon from '../../assets/bold.svg';
import codeIcon from '../../assets/code.svg';
import eyeIcon from '../../assets/eye.svg';
import fileTextIcon from '../../assets/file-text.svg';
import imageIcon from '../../assets/image.svg';
import italicIcon from '../../assets/italic.svg';
import linkIcon from '../../assets/link.svg';
import listOrderedIcon from '../../assets/list-ordered.svg';
import listIcon from '../../assets/list.svg';
import minusIcon from '../../assets/minus.svg';
import pageBreakIcon from '../../assets/page-break.svg';
import pencilIcon from '../../assets/pencil.svg';
import quoteIcon from '../../assets/quote.svg';
import redoIcon from '../../assets/redo.svg';
import searchIcon from '../../assets/search.svg';
import strikeIcon from '../../assets/strikethrough.svg';
import tableIcon from '../../assets/table.svg';
import underlineIcon from '../../assets/underline.svg';
import undoIcon from '../../assets/undo.svg';
import listChecksIcon from '../../assets/list-checks.svg';
import notebookIcon from '../../assets/notebook-pen.svg';
import polishIcon from '../../assets/wand-sparkles.svg';
import { AppShell } from '../../components/AppShell';
import form from '../../components/Dialog.module.css';
import { useInlineCompletion } from '../../components/inlineCompletion';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import { Loader } from '../../components/Loader';
import { useSieve } from '../../components/sieve';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { t, tf } from '../../i18n';
import { currentLanguage } from '../../session/language';
import { matches, useSaveShortcut } from '../../session/shortcut';
import { shellUser } from '../../session/user';
import shell from './DesignImageEditorPage.module.css';
import { DesignChat, useChatModels } from './DesignChat';
import type { ChatIdea } from './DesignChat';
import { DesignPicturePickerDialog } from './DesignPicturePickerDialog';
import { DocumentExportMenu } from './DocumentExportMenu';
import { DocumentFind } from './DocumentFind';
import { DocumentPaper, geometryOf, useDocumentEditor } from './DocumentPaper';
import { aroundCaret, documentImageSource, markGrammar, suggest, textblocks } from './documentExtensions';
import type { GrammarMark } from './documentExtensions';
import { MARGIN_SETTINGS, ORIENTATIONS, pageOf, settingsOf } from './documentSettings';
import styles from './DocumentEditorPage.module.css';
import wire from './WireframeEditorPage.module.css';

export interface DocumentEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** What an empty chat offers to write. */
const IDEAS: ChatIdea[] = [
  {
    icon: notebookIcon,
    title: () => t('Draft a brief'),
    line: () => t('Goals, scope, timeline and risks'),
    prompt: () => t('Draft a one-page project brief with sections for goals, scope, timeline and risks.'),
  },
  {
    icon: fileTextIcon,
    title: () => t('Meeting notes'),
    line: () => t('Attendees, decisions and actions'),
    prompt: () => t('Write a template for meeting notes: attendees, agenda, decisions and a table of actions with owners and dates.'),
  },
  {
    icon: listChecksIcon,
    title: () => t('Summarise'),
    line: () => t('A short summary at the top'),
    prompt: () => t('Read the document and add a short summary of it at the top, under a heading.'),
  },
  {
    icon: polishIcon,
    title: () => t('Polish the writing'),
    line: () => t('Clearer, shorter, the same meaning'),
    prompt: () => t('Rewrite the document so it reads more clearly and concisely, keeping its meaning, structure and pictures.'),
  },
];

/** The conversation is kept for the length of the browser tab, so a reload does not lose it. */
const talkKey = (id: string) => `orknux.document.talk.${id}`;
const modelKey = (workspaceId: string) => `orknux.document.model.${workspaceId}`;

/** How often the document is read again while a model writes in it, so its changes appear as they are saved. */
const FOLLOW_MS = 1500;

/** How much of the text before the caret is sent for a suggestion; the server cuts it to its own Tunable. */
const SENT_BEFORE = 20_000;

/** The editor as the routes hold it: one page per document, so another one opens afresh. */
export function DocumentEditorRoute(props: DocumentEditorPageProps) {
  const { documentId = '' } = useParams();
  return <DocumentEditorPage key={documentId} {...props} />;
}

/** Turns a picked file into a data URL, which `importDesignImage` takes. */
function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

/**
 * Where a document is written: its pages on a desk, a bar of what can be done
 * to the words above them, and down the right a conversation with a chat model
 * that writes in it - the wireframe editor's shell and its chat, so the two
 * editors in Design read as one product.
 *
 * Saved by Save, as the wireframe editor's drawing is; leaving with changes
 * asks first. What a model writes it saves itself, through the orknux_*
 * document tools; the page follows while it works, each change one more step
 * undo goes back over. While typing, the workspace's completion model suggests
 * how the sentence goes on and the paragraphs changed are checked for grammar -
 * each with a switch in the bar, remembered for the person.
 */
export function DocumentEditorPage({ session, onSignOut }: DocumentEditorPageProps) {
  const firstName = (session.displayName?.trim() || session.username).split(/\s+/)[0];
  const { workspaceId = '', documentId = '' } = useParams();
  const navigate = useNavigate();
  const [held, setHeld] = useState<DesignDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [settings, setSettings] = useState<DocumentSettings>({ pageSize: 'A4', orientation: 'PORTRAIT', margins: 'NORMAL', language: '' });
  /** The content and settings as last saved, to compare against. */
  const [saved, setSaved] = useState('');
  const [tick, setTick] = useState(0);
  const [finding, setFinding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [completionPause, setCompletionPause] = useState<number | null>(null);
  const [autocomplete, setAutocomplete] = useSieve('document-editor.autocomplete');
  const [grammarSieve, setGrammarSieve] = useSieve('document-editor.grammar');
  const completing = autocomplete !== 'off';
  const grammarOn = grammarSieve !== 'off';
  const [grammar, setGrammar] = useState<GrammarSettings | null>(null);
  const [picked, setPicked] = useState<{ mark: GrammarMark; left: number; top: number } | null>(null);
  const ignored = useRef(new Set<string>());
  const checked = useRef(new Map<string, GrammarMatch[]>());

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey);
  const [talk, setTalk] = useState<DocumentTurn[]>([]);
  const [asking, setAsking] = useState('');
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  const scope = useRef<HTMLDivElement | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  const saveKey = useSaveShortcut();

  const page = useMemo(() => pageOf(settings), [settings]);
  const geometry = useMemo(() => geometryOf({ page }), [page]);

  const { editor, pages } = useDocumentEditor({
    document: held,
    geometry,
    editable: !answering,
    onChange: () => setTick((at) => at + 1),
    onGrammarPick: (mark, at) => setPicked({ mark, left: at.left, top: at.bottom + 4 }),
    onFiles: (files, at) => void insertFiles(files, at),
  });

  const fingerprint = (editorNow: Editor | null, now: DocumentSettings) =>
    editorNow === null ? '' : JSON.stringify({ content: editorNow.getJSON(), settings: now });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const unsaved = useMemo(() => held !== null && editor !== null && fingerprint(editor, settings) !== saved, [held, editor, settings, saved, tick]);

  // -- Loading ------------------------------------------------------------

  useEffect(() => {
    if (documentId === '') return;
    let left = false;
    fetchDocument(documentId)
      .then((found) => {
        if (left) return;
        if (found === null) {
          setMissing(true);
          return;
        }
        setHeld(found);
        setSettings(settingsOf(found));
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the document.'));
      });
    try {
      const kept = sessionStorage.getItem(talkKey(documentId));
      if (kept !== null) setTalk(JSON.parse(kept) as DocumentTurn[]);
    } catch {
      // Nothing kept: the conversation starts empty.
    }
    return () => {
      left = true;
    };
  }, [documentId]);

  // What was loaded is what is saved, once the editor holds it.
  useEffect(() => {
    if (editor !== null && held !== null && saved === '') setSaved(fingerprint(editor, settingsOf(held)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, held]);

  useEffect(() => {
    if (workspaceId === '') return;
    fetchWorkspace(workspaceId)
      .then((found) => setCompletionPause(found?.completionModelId == null ? null : found.completionPauseMillis))
      .catch(() => setCompletionPause(null));
    fetchGrammarSettings().then(setGrammar).catch(() => setGrammar(null));
  }, [workspaceId]);

  useEffect(() => {
    try {
      if (documentId !== '') sessionStorage.setItem(talkKey(documentId), JSON.stringify(talk));
    } catch {
      // A conversation that cannot be kept is still a conversation.
    }
  }, [talk, documentId]);

  // Follow the editor's selection, so the suggestion and the bar's states are drawn for where the caret is.
  useEffect(() => {
    if (editor === null) return;
    const moved = () => setTick((at) => at + 1);
    editor.on('selectionUpdate', moved);
    editor.on('focus', moved);
    editor.on('blur', moved);
    return () => {
      editor.off('selectionUpdate', moved);
      editor.off('focus', moved);
      editor.off('blur', moved);
    };
  }, [editor]);

  // -- Saving -------------------------------------------------------------

  async function save(): Promise<boolean> {
    if (held === null || editor === null) return false;
    if (!unsaved) return true;
    setBusy(true);
    setError(null);
    try {
      const written = await saveDocument(held.id, editor.getJSON(), held.revision, settings);
      setHeld(written);
      setSaved(fingerprint(editor, settings));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the document.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (naming === null || held === null) return;
    const called = naming.trim();
    setNaming(null);
    if (called === '' || called === held.name) return;
    try {
      const renamed = await renameDocument(held.id, called);
      setHeld({ ...held, name: renamed.name, revision: renamed.revision });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the document.'));
    }
  }

  const back = `/workspace/${workspaceId}/design/documents`;
  const guard = useLeaveGuard({ unsaved, backTo: back, save });

  const keys = useRef({ save });
  keys.current = { save };
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [saveKey]);

  /** A document as the server holds it now, taken onto the page as one step undo goes back over. */
  function take(found: DesignDocument) {
    if (editor === null) return;
    editor.commands.setContent(contentOf(found), { emitUpdate: false });
    setHeld(found);
    setSettings(settingsOf(found));
    setSaved(fingerprint(editor, settingsOf(found)));
  }

  // -- Pictures -------------------------------------------------------------

  function insertPicture(artifact: string, name: string | null, at: number | null) {
    if (editor === null) return;
    const node = { type: 'image', attrs: { artifact, src: documentImageSource(workspaceId, artifact), alt: name } };
    if (at === null) editor.chain().focus().insertContent(node).run();
    else editor.chain().focus().insertContentAt(at, node).run();
  }

  async function insertFiles(files: File[], at: number | null) {
    setError(null);
    for (const file of files) {
      try {
        const kept = await importDesignImage({ workspaceId, image: await dataUrl(file), name: file.name.replace(/\.[^.]+$/, '') });
        insertPicture(kept.id, kept.name, at);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('Could not keep the picture.'));
      }
    }
  }

  // -- The conversation ----------------------------------------------------

  async function ask(event?: FormEvent<HTMLFormElement>, idea?: string) {
    event?.preventDefault();
    const said = (idea ?? asking).trim();
    if (said === '' || modelId === '' || held === null || answering) return;
    setTalkError(null);
    // The model writes in what is saved, so what is on screen is saved first.
    if (unsaved && !(await save())) return;
    const sent: DocumentTurn[] = [...talk, { role: 'user', content: said }];
    setTalk(sent);
    setAsking('');
    setAnswering(true);
    let revision = held.revision;
    // The page follows the model while it works: each save it makes appears as it is made.
    const following = window.setInterval(() => {
      fetchDocument(held.id)
        .then((now) => {
          if (now !== null && now.revision !== revision) {
            revision = now.revision;
            take(now);
          }
        })
        .catch(() => undefined);
    }, FOLLOW_MS);
    try {
      const answered = await askDocument(held.id, modelId, sent);
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed && answered.document.revision !== revision) take(answered.document);
    } catch (cause) {
      setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.'));
      const now = await fetchDocument(held.id).catch(() => null);
      if (now !== null && now.revision !== revision) take(now);
    } finally {
      window.clearInterval(following);
      setAnswering(false);
    }
  }

  // -- The suggestion while typing -------------------------------------------

  const caret = editor === null ? null : aroundCaret(editor.state);
  const inCode = editor?.isActive('codeBlock') ?? false;
  const typed = caret === null ? '' : `${caret.blockStart}\u0000${caret.inBlock}`;
  const sheetOfCaret = () => {
    if (editor === null) return 1;
    const paper = editor.view.dom.closest('[data-testid="document-paper"]')?.getBoundingClientRect();
    if (paper === undefined) return 1;
    const top = editor.view.coordsAtPos(editor.state.selection.head).top;
    return Math.max(1, Math.floor((top - paper.top) / (geometry.height + geometry.gap)) + 1);
  };
  const { rest } = useInlineCompletion({
    pause: completing ? completionPause : null,
    text: typed,
    ready:
      editor !== null &&
      held !== null &&
      !answering &&
      editor.isFocused &&
      editor.state.selection.empty &&
      caret !== null &&
      caret.atEnd &&
      caret.inBlock.trim() !== '' &&
      !inCode,
    scope: held?.id ?? null,
    ask: (_asked, signal) =>
      held === null || editor === null
        ? Promise.resolve(null)
        : fetchDocumentCompletion(
            held.id,
            { before: aroundCaret(editor.state).before.slice(-SENT_BEFORE), after: aroundCaret(editor.state).after.slice(0, SENT_BEFORE / 4), page: sheetOfCaret() },
            signal,
          ),
  });
  const ghost = completing && caret !== null && caret.atEnd && !inCode ? rest(typed) : null;
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    suggest(editor, ghost);
  }, [editor, ghost]);

  // -- Grammar -----------------------------------------------------------------

  const language = settings.language !== '' ? settings.language : currentLanguage();

  const applyGrammar = useCallback(() => {
    if (editor === null) return;
    const marks: GrammarMark[] = [];
    for (const block of textblocks(editor.state.doc)) {
      const found = checked.current.get(`${language}\u0000${block.text}`);
      if (found === undefined) continue;
      for (const match of found) {
        const from = block.positions[match.offset];
        const last = block.positions[match.offset + match.length - 1];
        if (from === undefined || last === undefined) continue;
        const word = block.text.slice(match.offset, match.offset + match.length);
        if (ignored.current.has(`${match.rule}\u0000${word}`)) continue;
        marks.push({ from, to: last + 1, message: match.message, replacements: match.replacements, rule: match.rule, spelling: match.spelling });
      }
    }
    markGrammar(editor, marks);
  }, [editor, language]);

  useEffect(() => {
    if (editor === null || held === null) return;
    if (!grammarOn || grammar === null) {
      markGrammar(editor, []);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        // Only paragraphs not checked as they now read: an unchanged one is not asked about again.
        for (const block of textblocks(editor.state.doc)) {
          if (controller.signal.aborted) return;
          const key = `${language}\u0000${block.text}`;
          if (checked.current.has(key) || block.text.length > grammar.textMost) continue;
          try {
            checked.current.set(key, await checkGrammar(language, block.text, controller.signal));
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        if (!controller.signal.aborted) applyGrammar();
      })();
    }, grammar.pauseMillis);
    applyGrammar();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The tick is every change to the document.
  }, [editor, held, grammarOn, grammar, language, tick, applyGrammar]);

  // -- Formatting --------------------------------------------------------------

  const can = editor !== null && !answering;
  const run = (go: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (editor === null) return;
    go(editor.chain().focus()).run();
  };
  const active = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false;
  const blockStyle = active('heading', { level: 1 })
    ? 'h1'
    : active('heading', { level: 2 })
      ? 'h2'
      : active('heading', { level: 3 })
        ? 'h3'
        : 'p';

  function link() {
    if (editor === null) return;
    const was = (editor.getAttributes('link').href as string | undefined) ?? '';
    const href = window.prompt(t('Link address'), was);
    if (href === null) return;
    if (href.trim() === '') run((chain) => chain.extendMarkRange('link').unsetLink());
    else run((chain) => chain.extendMarkRange('link').setLink({ href: href.trim() }));
  }

  const tool = (label: string, icon: string, on: boolean, act: () => void, testid: string, disabled = !can) => (
    <button
      type="button"
      className={`${shell.tool} ${on ? wire.toolOn : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={act}
      disabled={disabled}
      aria-pressed={on}
      title={label}
      aria-label={label}
      data-testid={testid}
    >
      <img src={icon} alt="" width={16} height={16} />
    </button>
  );

  if (missing) {
    return (
      <AppShell title={t('Document editor')} user={shellUser(session)} workspacePath={`/workspace/${workspaceId}`} showAdmin={session.admin} onSignOut={onSignOut} sidebar={null} hideSidebar>
        <p className={styles.missing}>{t('There is no such document here.')}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('Document editor')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={shell.toolbar}>
        <button
          type="button"
          className={shell.back}
          onClick={() => {
            if (!askBeforeLeaving(back)) navigate(back);
          }}
          data-testid="document-back"
        >
          ← {t('Documents')}
        </button>
        {naming !== null ? (
          <input
            className={shell.titleInput}
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename();
              if (event.key === 'Escape') setNaming(null);
            }}
            aria-label={t('Name')}
            autoFocus
            data-testid="document-title-input"
          />
        ) : (
          <button type="button" className={shell.toolbarTitle} onClick={() => setNaming(held?.name ?? '')} title={t('Rename the document')} data-testid="document-title">
            {held?.name ?? ''}
          </button>
        )}
        {naming === null && (
          <button type="button" className={shell.tool} onClick={() => setNaming(held?.name ?? '')} title={t('Rename the document')} aria-label={t('Rename the document')}>
            <img src={pencilIcon} alt="" width={14} height={14} />
          </button>
        )}
        {unsaved && (
          <span className={shell.unsavedMark} data-testid="document-unsaved">
            {t('Unsaved')}
          </span>
        )}
        <div className={shell.toolbarRight}>
          <div className={styles.modes} role="group" aria-label={t('Mode')}>
            <span className={`${styles.mode} ${styles.modeOn}`} aria-current="true">
              {t('Edit')}
            </span>
            <Link
              className={styles.mode}
              to={held === null ? '#' : documentPath(workspaceId, held.id, true)}
              onClick={(event) => {
                if (held === null) return;
                const to = documentPath(workspaceId, held.id, true);
                event.preventDefault();
                if (!askBeforeLeaving(to)) navigate(to);
              }}
              data-testid="document-to-view"
            >
              <img src={eyeIcon} alt="" width={14} height={14} />
              {t('View')}
            </Link>
          </div>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.switch} ${completing ? styles.switchOn : ''}`}
            onClick={() => setAutocomplete(completing ? 'off' : '')}
            aria-pressed={completing}
            title={t('Auto-completion')}
            data-testid="document-autocomplete"
          >
            {t('Auto-completion')}
          </button>
          <button
            type="button"
            className={`${styles.switch} ${grammarOn ? styles.switchOn : ''}`}
            onClick={() => setGrammarSieve(grammarOn ? 'off' : '')}
            aria-pressed={grammarOn}
            title={t('Grammar')}
            data-testid="document-grammar"
          >
            {t('Grammar')}
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <div className={styles.menuHolder}>
            <button type="button" className={form.ghost} onClick={() => setPageMenu((open) => !open)} aria-expanded={pageMenu} data-testid="document-page-settings">
              {t('Page')}
            </button>
            {pageMenu && (
              <div className={styles.menu} data-testid="document-page-menu">
                <label className={styles.menuField}>
                  <span>{t('Size')}</span>
                  <select
                    value={settings.pageSize}
                    onChange={(event) => setSettings({ ...settings, pageSize: event.target.value as PageSize })}
                    data-testid="document-page-size"
                  >
                    {PAGE_SIZES.map((one) => (
                      <option key={one.value} value={one.value}>
                        {one.value === 'LETTER' ? t('Letter') : one.value === 'LEGAL' ? t('Legal') : one.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.menuField}>
                  <span>{t('Orientation')}</span>
                  <select
                    value={settings.orientation}
                    onChange={(event) => setSettings({ ...settings, orientation: event.target.value as Orientation })}
                    data-testid="document-orientation"
                  >
                    {ORIENTATIONS.map((one) => (
                      <option key={one} value={one}>
                        {one === 'PORTRAIT' ? t('Portrait') : t('Landscape')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.menuField}>
                  <span>{t('Margins')}</span>
                  <select
                    value={settings.margins}
                    onChange={(event) => setSettings({ ...settings, margins: event.target.value as Margins })}
                    data-testid="document-margins"
                  >
                    {MARGIN_SETTINGS.map((one) => (
                      <option key={one} value={one}>
                        {one === 'NORMAL' ? t('Normal') : one === 'NARROW' ? t('Narrow') : t('Wide')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.menuField}>
                  <span>{t('Language')}</span>
                  <select value={settings.language} onChange={(event) => setSettings({ ...settings, language: event.target.value })} data-testid="document-language">
                    <option value="">{t('Your language')}</option>
                    <option value="en">{t('English')}</option>
                    <option value="pl">{t('Polish')}</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <DocumentExportMenu documentId={held?.id ?? null} name={held?.name ?? ''} beforeExport={save} />
          <button type="button" className={form.filled} onClick={() => void save()} disabled={!unsaved || busy || answering} title={`${t('Save')} (${saveKey})`} data-testid="document-save">
            {t('Save')}
          </button>
        </div>
      </div>

      <div className={shell.editor}>
        <div className={styles.column} data-testid="document-canvas">
          <div className={styles.formatBar} role="toolbar" aria-label={t('Formatting')} data-testid="document-toolbar">
            {tool(t('Undo'), undoIcon, false, () => run((chain) => chain.undo()), 'document-undo', !can || !(editor?.can().undo() ?? false))}
            {tool(t('Redo'), redoIcon, false, () => run((chain) => chain.redo()), 'document-redo', !can || !(editor?.can().redo() ?? false))}
            <span className={shell.toolbarGap} aria-hidden="true" />
            <select
              className={styles.blockStyle}
              value={blockStyle}
              onChange={(event) => {
                const chosen = event.target.value;
                if (chosen === 'p') run((chain) => chain.setParagraph());
                else run((chain) => chain.setHeading({ level: Number(chosen.slice(1)) as 1 | 2 | 3 }));
              }}
              disabled={!can}
              aria-label={t('Text style')}
              data-testid="document-block-style"
            >
              <option value="p">{t('Paragraph')}</option>
              <option value="h1">{t('Heading 1')}</option>
              <option value="h2">{t('Heading 2')}</option>
              <option value="h3">{t('Heading 3')}</option>
            </select>
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Bold'), boldIcon, active('bold'), () => run((chain) => chain.toggleBold()), 'document-bold')}
            {tool(t('Italic'), italicIcon, active('italic'), () => run((chain) => chain.toggleItalic()), 'document-italic')}
            {tool(t('Underline'), underlineIcon, active('underline'), () => run((chain) => chain.toggleUnderline()), 'document-underline')}
            {tool(t('Strikethrough'), strikeIcon, active('strike'), () => run((chain) => chain.toggleStrike()), 'document-strike')}
            {tool(t('Inline code'), codeIcon, active('code'), () => run((chain) => chain.toggleCode()), 'document-code')}
            {tool(t('Link'), linkIcon, active('link'), link, 'document-link')}
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Bulleted list'), listIcon, active('bulletList'), () => run((chain) => chain.toggleBulletList()), 'document-bullets')}
            {tool(t('Numbered list'), listOrderedIcon, active('orderedList'), () => run((chain) => chain.toggleOrderedList()), 'document-numbers')}
            {tool(t('Quote'), quoteIcon, active('blockquote'), () => run((chain) => chain.toggleBlockquote()), 'document-quote')}
            <button
              type="button"
              className={`${shell.tool} ${styles.wordTool} ${active('codeBlock') ? wire.toolOn : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run((chain) => chain.toggleCodeBlock())}
              disabled={!can}
              aria-pressed={active('codeBlock')}
              title={t('Code block')}
              aria-label={t('Code block')}
              data-testid="document-code-block-tool"
            >
              {'{ }'}
            </button>
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Table'), tableIcon, active('table'), () => run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), 'document-table')}
            {tool(t('Upload a picture'), imageIcon, false, () => upload.current?.click(), 'document-image-upload')}
            <button
              type="button"
              className={`${shell.tool} ${styles.wordTool}`}
              onClick={() => setPicking(true)}
              disabled={!can}
              title={t('A picture from Orknux')}
              aria-label={t('A picture from Orknux')}
              data-testid="document-image-pick"
            >
              {t('Pictures')}
            </button>
            {tool(t('Horizontal line'), minusIcon, false, () => run((chain) => chain.setHorizontalRule()), 'document-rule')}
            {tool(t('Page break'), pageBreakIcon, false, () => run((chain) => chain.setPageBreak()), 'document-page-break-tool')}
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Find'), searchIcon, finding, () => setFinding(true), 'document-find-open', editor === null)}
            <span className={styles.pageCount} data-testid="document-page-count">
              {tf('{count} pages', { count: pages })}
            </span>
            <input
              ref={upload}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              multiple
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                if (files.length > 0) void insertFiles(files, null);
              }}
              data-testid="document-image-file"
            />
          </div>
        <div className={styles.canvas} ref={scope}>
          <DocumentFind editor={editor} replacing scope={scope} open={finding} onOpen={setFinding} />
          {held === null || editor === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <div className={styles.desk}>
              <DocumentPaper editor={editor} geometry={geometry} pages={pages} />
            </div>
          )}
          {answering && (
            <div className={wire.drawing} data-testid="document-writing">
              <Loader label={t('Writing…')} delay={0} size={20} />
            </div>
          )}
          {picked !== null && (
            <div className={styles.grammarCard} style={{ left: picked.left, top: picked.top }} role="dialog" data-testid="document-grammar-card">
              <p className={styles.grammarMessage}>{picked.mark.message}</p>
              <div className={styles.grammarFixes}>
                {picked.mark.replacements.map((replacement) => (
                  <button
                    key={replacement}
                    type="button"
                    className={styles.grammarFix}
                    onClick={() => {
                      if (editor === null) return;
                      editor.chain().focus().insertContentAt({ from: picked.mark.from, to: picked.mark.to }, replacement).run();
                      setPicked(null);
                    }}
                    data-testid="document-grammar-replacement"
                  >
                    {replacement}
                  </button>
                ))}
              </div>
              <div className={styles.grammarActions}>
                <button
                  type="button"
                  className={form.ghost}
                  onClick={() => {
                    if (editor === null) return;
                    ignored.current.add(`${picked.mark.rule}\u0000${editor.state.doc.textBetween(picked.mark.from, picked.mark.to)}`);
                    setPicked(null);
                    applyGrammar();
                  }}
                  data-testid="document-grammar-ignore"
                >
                  {t('Ignore')}
                </button>
                <button type="button" className={form.ghost} onClick={() => setPicked(null)}>
                  {t('Close')}
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

        <div className={`${shell.panel} ${wire.panel}`} data-testid="document-panel">
          <DesignChat
            prefix="document"
            firstName={firstName}
            question={t('What shall we write?')}
            ideas={IDEAS}
            ready={held !== null}
            talk={talk}
            answering={answering}
            talkError={talkError}
            working={t('Writing…')}
            asking={asking}
            onAsking={setAsking}
            onAsk={(event, idea) => void ask(event, idea)}
            models={models}
            modelId={modelId}
            onModel={choose}
            placeholder={t('Describe what to write')}
            inputLabel={t('What to write')}
            footer={
              <>
                {error !== null && held !== null && (
                  <p className={form.error} role="alert">
                    {error}
                  </p>
                )}
                <span className={wire.count}>{tf('{count} words', { count: held?.words ?? 0 })}</span>
              </>
            }
          />
        </div>
      </div>

      <DesignPicturePickerDialog
        open={picking}
        workspaceId={workspaceId}
        title={t('A picture from Orknux')}
        onClose={() => setPicking(false)}
        onPick={(picture: Artifact) => {
          setPicking(false);
          insertPicture(picture.id, picture.name ?? picture.prompt, null);
        }}
      />
      <UnsavedWorkDialog
        subject={guard.asking ? (held?.name ?? t('This document')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}
