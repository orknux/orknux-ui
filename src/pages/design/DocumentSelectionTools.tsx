import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { TRANSLATION_LANGUAGES, translateDocumentText } from '../../api/documents';
import type { TranslationLanguage } from '../../api/documents';
import form from '../../components/Dialog.module.css';
import { Loader } from '../../components/Loader';
import { Select } from '../../components/Select';
import { useSieve } from '../../components/sieve';
import { t } from '../../i18n';
import { newNoteId, removeNote, setNote } from './documentExtensions';
import styles from './DocumentTools.module.css';

/** How much of the text either side of a selection Translate sends; the server cuts it to its own Tunable. */
const SENT_AROUND = 5_000;

/** The longest note a highlight carries: the server's format (`Documents.NOTE_LENGTH`). */
const NOTE_LENGTH = 2_000;

/** What each language is called on the screen; the server tells the model the English name. */
export function languageName(code: TranslationLanguage): string {
  switch (code) {
    case 'en':
      return t('English');
    case 'pl':
      return t('Polish');
    case 'de':
      return t('German');
    case 'fr':
      return t('French');
    case 'es':
      return t('Spanish');
    case 'it':
      return t('Italian');
    case 'pt':
      return t('Portuguese');
    case 'nl':
      return t('Dutch');
    case 'cs':
      return t('Czech');
    case 'uk':
      return t('Ukrainian');
  }
}

/** The words selected, as a model is handed them: a block to a line. */
export function selectedText(editor: Editor, from: number, to: number): string {
  return editor.state.doc.textBetween(from, to, '\n\n', ' ');
}

interface Held {
  from: number;
  to: number;
  left: number;
  top: number;
}

/** A highlight's note open in its card: hovered, or pinned by a press. */
export interface OpenNote {
  id: string;
  left: number;
  top: number;
  pinned: boolean;
}

export interface DocumentSelectionToolsProps {
  editor: Editor;
  documentId: string;
  /** The chat's chosen model, which Translate asks too; empty where there is none. */
  modelId: string;
  /** Whether the chat can take a turn now: a model is chosen and it is not answering. */
  canAsk: boolean;
  /** The document's own language, which Translate starts away from. */
  language: string;
  /** The desk the sheets are on: where a highlight is hovered. */
  scope: RefObject<HTMLDivElement | null>;
  onExplain: (text: string) => void;
  onSummarise: (text: string) => void;
}

/**
 * Which highlight's note is open: the one the pointer is over, or the one
 * pressed, which stays open until a press elsewhere. The editor's and the
 * view's, so a note reads the same in both.
 */
export function useNoteHover(scope: RefObject<HTMLDivElement | null>) {
  const [noteOpen, setNoteOpen] = useState<OpenNote | null>(null);
  // A highlight shows its note while the pointer is over it, and a press on it keeps the card open.
  useEffect(() => {
    const desk = scope.current;
    if (desk === null) return;
    const at = (mark: Element) => {
      const box = mark.getBoundingClientRect();
      return { left: box.left, top: box.bottom };
    };
    const over = (event: MouseEvent) => {
      const mark = (event.target as Element | null)?.closest?.('mark[data-note-id]');
      if (mark === null || mark === undefined) return;
      const id = mark.getAttribute('data-note-id') ?? '';
      setNoteOpen((held) => (held?.pinned ? held : { id, ...at(mark), pinned: false }));
    };
    const out = (event: MouseEvent) => {
      const from = (event.target as Element | null)?.closest?.('mark[data-note-id]');
      if (from === null || from === undefined) return;
      const into = event.relatedTarget as Element | null;
      if (into?.closest?.('[data-testid="document-note-card"]') || into?.closest?.('mark[data-note-id]') === from) return;
      setNoteOpen((held) => (held?.pinned ? held : null));
    };
    const pressed = (event: MouseEvent) => {
      const mark = (event.target as Element | null)?.closest?.('mark[data-note-id]');
      if (mark === null || mark === undefined) return;
      setNoteOpen({ id: mark.getAttribute('data-note-id') ?? '', ...at(mark), pinned: true });
    };
    desk.addEventListener('mouseover', over);
    desk.addEventListener('mouseout', out);
    desk.addEventListener('click', pressed);
    return () => {
      desk.removeEventListener('mouseover', over);
      desk.removeEventListener('mouseout', out);
      desk.removeEventListener('click', pressed);
    };
  }, [scope]);
  return [noteOpen, setNoteOpen] as const;
}

/**
 * What a selection offers, in a small bar over it: Explain and Summarise ask
 * the document's chat about the words and change nothing; Translate opens a
 * card with the translation and a Replace that puts it in place as one step
 * undo goes back over; Highlight marks the words and asks for a note. And the
 * card a highlight's note is read, changed and taken off in, open while the
 * pointer is over the highlight and pinned by a press on it.
 */
export function DocumentSelectionTools({ editor, documentId, modelId, canAsk, language, scope, onExplain, onSummarise }: DocumentSelectionToolsProps) {
  const [translating, setTranslating] = useState<Held | null>(null);
  const [noteOpen, setNoteOpen] = useNoteHover(scope);
  const [, redraw] = useState(0);

  // The bar follows the selection; the editor's own events are what say it moved.
  useEffect(() => {
    const moved = () => redraw((at) => at + 1);
    editor.on('selectionUpdate', moved);
    editor.on('focus', moved);
    editor.on('blur', moved);
    editor.on('update', moved);
    return () => {
      editor.off('selectionUpdate', moved);
      editor.off('focus', moved);
      editor.off('blur', moved);
      editor.off('update', moved);
    };
  }, [editor]);

  /*
   * Whether the selection is still being made: the mouse button held down after
   * a press in the text, or Shift held from the keyboard. The bar waits for it
   * to settle - the button let go, Shift let go - rather than jumping along
   * under the pointer while the words are being swept over.
   */
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    // Read at the event rather than bound to the editor's element, which is not there until the paper has mounted it.
    const inText = (event: Event) => event.target instanceof Node && !editor.isDestroyed && editor.view.dom.contains(event.target);
    const pressed = (event: MouseEvent) => {
      if (event.button === 0 && inText(event)) setSelecting(true);
    };
    const shifted = (event: KeyboardEvent) => {
      if (event.key === 'Shift' && inText(event)) setSelecting(true);
    };
    // The button may be let go anywhere, the text or not.
    const released = (event: MouseEvent) => {
      if (event.button === 0) setSelecting(false);
    };
    const unshifted = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setSelecting(false);
    };
    const gone = () => setSelecting(false);
    window.addEventListener('mousedown', pressed, true);
    window.addEventListener('keydown', shifted, true);
    window.addEventListener('mouseup', released, true);
    window.addEventListener('keyup', unshifted, true);
    window.addEventListener('blur', gone);
    return () => {
      window.removeEventListener('mousedown', pressed, true);
      window.removeEventListener('keydown', shifted, true);
      window.removeEventListener('mouseup', released, true);
      window.removeEventListener('keyup', unshifted, true);
      window.removeEventListener('blur', gone);
    };
  }, [editor]);

  const { from, to, empty } = editor.state.selection;
  const words = empty ? '' : selectedText(editor, from, to);
  const showing = editor.isEditable && editor.isFocused && !selecting && !empty && words.trim() !== '' && translating === null;
  let place: { left: number; top: number } | null = null;
  if (showing) {
    const start = editor.view.coordsAtPos(from);
    place = { left: start.left, top: start.top };
  }

  const highlight = () => {
    const id = newNoteId();
    editor.chain().focus().setMark('note', { id, note: '' }).run();
    const start = editor.view.coordsAtPos(to);
    setNoteOpen({ id, left: editor.view.coordsAtPos(from).left, top: start.bottom, pinned: true });
  };

  const button = (label: string, act: () => void, testid: string, disabled = false) => (
    <button
      type="button"
      className={styles.selectionButton}
      // The selection stays where it is: a press here does not take the caret from the words.
      onMouseDown={(event) => event.preventDefault()}
      onClick={act}
      disabled={disabled}
      data-testid={testid}
    >
      {label}
    </button>
  );

  return (
    <>
      {place !== null && (
        <div className={styles.selectionMenu} style={{ left: place.left, top: place.top }} role="toolbar" aria-label={t('Selection')} data-testid="document-selection-menu">
          {button(t('Explain'), () => onExplain(words), 'document-selection-explain', !canAsk)}
          {button(t('Summarise'), () => onSummarise(words), 'document-selection-summarise', !canAsk)}
          {button(t('Translate'), () => {
            const start = editor.view.coordsAtPos(to);
            setTranslating({ from, to, left: editor.view.coordsAtPos(from).left, top: start.bottom });
          }, 'document-selection-translate', modelId === '')}
          {button(t('Highlight'), highlight, 'document-selection-highlight')}
        </div>
      )}
      {translating !== null && (
        <TranslateCard
          editor={editor}
          documentId={documentId}
          modelId={modelId}
          language={language}
          held={translating}
          onClose={() => {
            setTranslating(null);
            editor.commands.focus();
          }}
        />
      )}
      {noteOpen !== null && (
        <NoteCard
          key={noteOpen.id}
          editor={editor}
          open={noteOpen}
          onPin={() => setNoteOpen({ ...noteOpen, pinned: true })}
          onClose={() => setNoteOpen(null)}
        />
      )}
    </>
  );
}

/** The other language a document's words are most likely wanted in: Polish for English, English for anything else. */
function awayFrom(language: string): TranslationLanguage {
  return language === 'en' ? 'pl' : 'en';
}

interface TranslateCardProps {
  editor: Editor;
  documentId: string;
  modelId: string;
  language: string;
  held: Held;
  onClose: () => void;
}

/** The selection, translated by the chat's model into the language picked, and put in its place by Replace. */
function TranslateCard({ editor, documentId, modelId, language, held, onClose }: TranslateCardProps) {
  // The language picked last is the one offered next, for whoever uses the editor.
  const [remembered, remember] = useSieve('document-editor.translate');
  const into: TranslationLanguage = (TRANSLATION_LANGUAGES as readonly string[]).includes(remembered) ? (remembered as TranslationLanguage) : awayFrom(language);
  const [translated, setTranslated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const text = selectedText(editor, held.from, held.to);

  /*
   * The request for this language, kept across the effect running twice: in
   * development React mounts the card, unmounts it and mounts it again, and each
   * mount asked the model - two calls, two different answers, every line twice
   * in the session.
   */
  const asking = useRef<{ language: string; answer: Promise<string> } | null>(null);

  useEffect(() => {
    const controller = { left: false };
    setTranslated(null);
    setError(null);
    if (asking.current?.language !== into) asking.current = { language: into, answer: ask() };
    asking.current.answer
      .then((answer) => {
        if (!controller.left) setTranslated(answer);
      })
      .catch((cause: unknown) => {
        if (!controller.left) setError(cause instanceof Error ? cause.message : t('The model could not answer.'));
      });
    return () => {
      controller.left = true;
    };
    // Asked again only when the language changes; the selection is the one the card was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [into]);

  function ask(): Promise<string> {
    const doc = editor.state.doc;
    const before = doc.textBetween(Math.max(0, held.from - SENT_AROUND), held.from, '\n', ' ');
    const after = doc.textBetween(held.to, Math.min(doc.content.size, held.to + SENT_AROUND), '\n', ' ');
    return translateDocumentText(documentId, modelId, { text, language: into, before, after });
  }

  // A press outside the card, or Escape, closes it.
  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target !== null && (card.current?.contains(target) || target.closest('[role="listbox"]'))) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  function replace() {
    if (translated === null) return;
    const { state } = editor;
    const start = state.doc.resolve(held.from);
    const end = state.doc.resolve(held.to);
    const tr = state.tr;
    if (start.sameParent(end)) {
      // Within one paragraph the words go in as words, with the marks the first of them had.
      const marks = state.doc.nodeAt(held.from)?.marks ?? start.marks();
      tr.replaceWith(held.from, held.to, state.schema.text(translated.replace(/\s*\n+\s*/g, ' '), marks));
      editor.view.dispatch(tr);
    } else {
      // Across paragraphs, a paragraph of the translation for each of its own.
      const paragraphs = translated.split(/\n{2,}/).map((one) => one.trim()).filter((one) => one !== '');
      editor
        .chain()
        .insertContentAt(
          { from: held.from, to: held.to },
          paragraphs.map((one) => ({ type: 'paragraph', content: [{ type: 'text', text: one.replace(/\s*\n\s*/g, ' ') }] })),
        )
        .run();
    }
    onClose();
  }

  return (
    <div ref={card} className={styles.card} style={{ left: held.left, top: held.top + 4 }} role="dialog" aria-label={t('Translate')} data-testid="document-translate">
      <div className={styles.cardRow}>
        <span className={styles.cardTitle}>{t('Translate into')}</span>
        <Select
          className={`${form.input} ${form.select} ${styles.cardSelect}`}
          value={into}
          onChange={(picked) => remember(picked)}
          aria-label={t('Translate into')}
          data-testid="document-translate-language"
        >
          {TRANSLATION_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </Select>
      </div>
      {error !== null ? (
        <p className={form.error} role="alert" data-testid="document-translate-error">
          {error}
        </p>
      ) : translated === null ? (
        <div className={styles.cardWaiting}>
          <Loader label={t('Translating…')} delay={0} size={16} />
        </div>
      ) : (
        <textarea
          className={styles.cardText}
          value={translated}
          onChange={(event) => setTranslated(event.target.value)}
          aria-label={t('Translation')}
          data-testid="document-translate-result"
        />
      )}
      <div className={styles.cardActions}>
        <button type="button" className={form.ghost} onClick={onClose} data-testid="document-translate-close">
          {t('Close')}
        </button>
        <button type="button" className={form.filled} onClick={replace} disabled={translated === null || translated.trim() === ''} data-testid="document-translate-replace">
          {t('Replace')}
        </button>
      </div>
    </div>
  );
}

export interface NoteCardProps {
  editor: Editor;
  open: OpenNote;
  onPin: () => void;
  onClose: () => void;
}

/**
 * A highlight's note: read while hovered, written and kept when the card closes, and the highlight taken off.
 * In an editor that is not editable - the view - it is read and nothing else.
 */
export function NoteCard({ editor, open, onPin, onClose }: NoteCardProps) {
  const noteOf = () => {
    let found: string | null = null;
    editor.state.doc.descendants((node) => {
      if (found !== null) return false;
      const mark = node.marks.find((one) => one.type.name === 'note' && one.attrs.id === open.id);
      if (mark !== undefined) found = (mark.attrs.note as string | null) ?? '';
      return found === null;
    });
    return found;
  };
  const kept = noteOf();
  const [draft, setDraft] = useState(kept ?? '');
  const card = useRef<HTMLDivElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const held = useRef({ draft, kept });
  held.current = { draft, kept };

  const close = () => {
    const now = held.current;
    // What was typed is written once, as the card closes: one step undo goes back over, not one per letter.
    if (now.kept !== null && now.draft.trim() !== now.kept && editor.isEditable) setNote(editor, open.id, now.draft.trim());
    onClose();
  };
  const closing = useRef(close);
  closing.current = close;

  useEffect(() => {
    if (open.pinned && kept === '' && editor.isEditable) area.current?.focus();
    // Only as it is pinned: a hovered card does not take the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.pinned]);

  useEffect(() => {
    if (!open.pinned) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target !== null && (card.current?.contains(target) || target.closest(`mark[data-note-id="${CSS.escape(open.id)}"]`))) return;
      closing.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open.pinned, open.id]);

  // A highlight undone or deleted while its card is open leaves nothing to show.
  if (kept === null) return null;

  const editable = editor.isEditable;
  return (
    <div
      ref={card}
      className={styles.card}
      style={{ left: open.left, top: open.top }}
      role="dialog"
      aria-label={t('Note')}
      onMouseDown={() => {
        if (!open.pinned) onPin();
      }}
      onMouseLeave={() => {
        if (!open.pinned) onClose();
      }}
      data-testid="document-note-card"
      data-pinned={open.pinned ? '' : undefined}
    >
      {editable ? (
        <textarea
          ref={area}
          className={styles.cardText}
          value={draft}
          maxLength={NOTE_LENGTH}
          placeholder={t('Write a note')}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            if (!open.pinned) onPin();
          }}
          aria-label={t('Note')}
          data-testid="document-note-text"
        />
      ) : (
        <p className={styles.cardNote} data-testid="document-note-text">
          {kept === '' ? t('No note') : kept}
        </p>
      )}
      {editable && (
        <div className={styles.cardActions}>
          <button
            type="button"
            className={form.ghost}
            onClick={() => {
              removeNote(editor, open.id);
              onClose();
            }}
            data-testid="document-note-remove"
          >
            {t('Remove highlight')}
          </button>
          <button type="button" className={form.filled} onClick={close} data-testid="document-note-done">
            {t('Done')}
          </button>
        </div>
      )}
    </div>
  );
}
