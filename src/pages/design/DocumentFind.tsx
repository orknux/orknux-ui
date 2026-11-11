import type { Editor } from '@tiptap/core';
import { SearchQuery, findNext, findPrev, replaceAll, replaceNext, setSearchState } from 'prosemirror-search';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import searchIcon from '../../assets/search.svg';
import { t, tf } from '../../i18n';
import { matches, useFindShortcut } from '../../session/shortcut';
import styles from './DocumentEditorPage.module.css';

export interface DocumentFindProps {
  editor: Editor | null;
  /** Whether Replace is offered: the editor's, not the view's. */
  replacing: boolean;
  /** Where the keystroke is listened for: Find opens while focus is inside it. */
  scope: React.RefObject<HTMLElement | null>;
  /** Whether the bar under the box - the count, the steps, the options - is showing. */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Where in the toolbar the box is drawn; it is always there, and typing in it opens the bar. */
  slot: HTMLElement | null;
}

/** Every match of a query, in order, by walking it through the document. */
function allMatches(editor: Editor, query: SearchQuery): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  let from = 0;
  for (;;) {
    const next = query.findNext(editor.state, from);
    if (next === null || next.to <= from && next.from === next.to) break;
    found.push({ from: next.from, to: next.to });
    from = next.to > next.from ? next.to : next.from + 1;
    if (from > editor.state.doc.content.size) break;
  }
  return found;
}

/**
 * Find - and in the editor Replace - within the open document, through
 * prosemirror-search: every match marked across every page, "2 of 7", Enter
 * and Shift+Enter to step through them with the page scrolled to each, and
 * Match case and Whole word. Its keystroke is the browser's own find, which it
 * keeps from opening while the document has focus.
 *
 * The box itself sits in the toolbar, always showing, so finding is typing
 * rather than first finding the button that opens a place to type; what goes
 * with a query - the count, the steps, Match case and Replace - opens under
 * it once there is one.
 */
export function DocumentFind({ editor, replacing, scope, open, onOpen, slot }: DocumentFindProps) {
  const findKey = useFindShortcut();
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [found, setFound] = useState<{ count: number; at: number }>({ count: 0, at: 0 });
  const box = useRef<HTMLInputElement | null>(null);

  // The browser's find, while the document is what has focus.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (!matches(event, findKey)) return;
      const within = scope.current?.contains(document.activeElement) || scope.current?.contains(event.target as Node);
      if (!within && !open) return;
      event.preventDefault();
      onOpen(true);
      window.requestAnimationFrame(() => box.current?.select());
    };
    window.addEventListener('keydown', pressed);
    return () => window.removeEventListener('keydown', pressed);
  }, [findKey, scope, open, onOpen]);

  /** The query as typed, put on the document so its matches are marked. */
  function apply(next: { text?: string; replacement?: string; caseSensitive?: boolean; wholeWord?: boolean }) {
    if (editor === null) return;
    const query = new SearchQuery({
      search: next.text ?? text,
      replace: next.replacement ?? replacement,
      caseSensitive: next.caseSensitive ?? caseSensitive,
      wholeWord: next.wholeWord ?? wholeWord,
    });
    editor.view.dispatch(setSearchState(editor.state.tr, query));
    count(query);
  }

  function count(query: SearchQuery) {
    if (editor === null || !query.valid) {
      setFound({ count: 0, at: 0 });
      return;
    }
    const all = allMatches(editor, query);
    const { from, to } = editor.state.selection;
    const at = all.findIndex((one) => one.from === from && one.to === to);
    setFound({ count: all.length, at: at + 1 });
  }

  function step(back: boolean) {
    if (editor === null) return;
    (back ? findPrev : findNext)(editor.state, editor.view.dispatch);
    scrollToSelection();
    apply({});
  }

  /** The match brought into view, wherever on the pages it is; the page scrolls, not the editor. */
  function scrollToSelection() {
    if (editor === null) return;
    const at = editor.view.domAtPos(editor.state.selection.from);
    const node = at.node instanceof HTMLElement ? at.node : at.node.parentElement;
    node?.scrollIntoView({ block: 'center' });
  }

  function close() {
    onOpen(false);
    setText('');
    if (editor !== null) editor.view.dispatch(setSearchState(editor.state.tr, new SearchQuery({ search: '' })));
    setFound({ count: 0, at: 0 });
    editor?.commands.focus();
  }

  const input = (
    <label className={styles.findBox}>
      <img src={searchIcon} alt="" width={14} height={14} />
      <input
        ref={box}
        type="search"
        className={styles.findBoxInput}
        value={text}
        disabled={editor === null}
        onChange={(event) => {
          setText(event.target.value);
          apply({ text: event.target.value });
          if (event.target.value !== '') onOpen(true);
          else if (open) close();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            step(event.shiftKey);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        placeholder={t('Find in document')}
        aria-label={t('Find in document')}
        data-testid="document-find-input"
      />
    </label>
  );

  return (
    <>
      {slot !== null && createPortal(input, slot)}
      {open && (slot !== null ? createPortal(panel(styles.findUnder), slot) : panel(styles.find))}
    </>
  );

  /** The options, the steps and replacing: dropped down under the box where it has one, over the page where it has not. */
  function panel(placed: string) {
    return (
    <div className={placed} role="search" data-testid="document-find">
      <span className={styles.findCount} data-testid="document-find-count">
        {text === ''
          ? ''
          : found.count === 0
            ? t('No matches')
            : found.at === 0
              ? tf('{count} matches', { count: found.count })
              : tf('{at} of {count}', { at: found.at, count: found.count })}
      </span>
      <button type="button" className={styles.findButton} onClick={() => step(true)} disabled={found.count === 0} title={t('Previous match')} aria-label={t('Previous match')} data-testid="document-find-previous">
        ↑
      </button>
      <button type="button" className={styles.findButton} onClick={() => step(false)} disabled={found.count === 0} title={t('Next match')} aria-label={t('Next match')} data-testid="document-find-next">
        ↓
      </button>
      <label className={styles.findOption}>
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => {
            setCaseSensitive(event.target.checked);
            apply({ caseSensitive: event.target.checked });
          }}
          data-testid="document-find-case"
        />
        {t('Match case')}
      </label>
      <label className={styles.findOption}>
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(event) => {
            setWholeWord(event.target.checked);
            apply({ wholeWord: event.target.checked });
          }}
          data-testid="document-find-whole"
        />
        {t('Whole word')}
      </label>
      {replacing && (
        <>
          <input
            className={styles.findInput}
            value={replacement}
            onChange={(event) => {
              setReplacement(event.target.value);
              apply({ replacement: event.target.value });
            }}
            placeholder={t('Replace with')}
            aria-label={t('Replace with')}
            data-testid="document-replace-input"
          />
          <button
            type="button"
            className={styles.findButton}
            onClick={() => {
              if (editor === null) return;
              replaceNext(editor.state, editor.view.dispatch);
              apply({});
            }}
            disabled={found.count === 0}
            data-testid="document-replace"
          >
            {t('Replace')}
          </button>
          <button
            type="button"
            className={styles.findButton}
            onClick={() => {
              if (editor === null) return;
              replaceAll(editor.state, editor.view.dispatch);
              apply({});
            }}
            disabled={found.count === 0}
            data-testid="document-replace-all"
          >
            {t('Replace all')}
          </button>
        </>
      )}
      <button type="button" className={styles.findButton} onClick={close} title={t('Close')} aria-label={t('Close')} data-testid="document-find-close">
        ×
      </button>
    </div>
    );
  }
}
