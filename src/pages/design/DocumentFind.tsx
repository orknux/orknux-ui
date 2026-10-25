import type { Editor } from '@tiptap/core';
import { SearchQuery, findNext, findPrev, replaceAll, replaceNext, setSearchState } from 'prosemirror-search';
import { useEffect, useRef, useState } from 'react';

import { t, tf } from '../../i18n';
import { matches, useFindShortcut } from '../../session/shortcut';
import styles from './DocumentEditorPage.module.css';

export interface DocumentFindProps {
  editor: Editor | null;
  /** Whether Replace is offered: the editor's, not the view's. */
  replacing: boolean;
  /** Where the keystroke is listened for: Find opens while focus is inside it. */
  scope: React.RefObject<HTMLElement | null>;
  /** Opened from the toolbar's button. */
  open: boolean;
  onOpen: (open: boolean) => void;
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
 */
export function DocumentFind({ editor, replacing, scope, open, onOpen }: DocumentFindProps) {
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

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => box.current?.focus());
  }, [open]);

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

  if (!open) return null;

  return (
    <div className={styles.find} role="search" data-testid="document-find">
      <input
        ref={box}
        className={styles.findInput}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          apply({ text: event.target.value });
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
