import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';

import { useSieve } from '../../components/sieve';
import { t } from '../../i18n';
import { headingsOf, highlightsOf } from './documentExtensions';
import styles from './DocumentTools.module.css';

export interface DocumentSideProps {
  editor: Editor;
  /** The desk that scrolls: where the section in view is read off. */
  scope: RefObject<HTMLDivElement | null>;
  /** Counts every change to the document, so the lists are read again. */
  tick: number;
}

/** How far below the top of the desk a heading counts as the section being read. A layout, not a behaviour. */
const READING_LINE = 48;

/**
 * The column left of the sheets: the document's headings to jump to, the
 * section in view marked as it scrolls, and its highlights with their notes.
 * The column, and each of its two sections, folds away - remembered for
 * whoever uses the editor, as the image editor's layers panel is.
 */
export function DocumentSide({ editor, scope, tick }: DocumentSideProps) {
  const [side, rememberSide] = useSieve('document-editor.side');
  const [outlineFold, rememberOutline] = useSieve('document-editor.outline');
  const [notesFold, rememberNotes] = useSieve('document-editor.highlights');
  const open = side !== 'closed';
  const outlineOpen = outlineFold !== 'closed';
  const notesOpen = notesFold !== 'closed';

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headings = useMemo(() => headingsOf(editor.state.doc), [editor, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const highlights = useMemo(() => highlightsOf(editor.state.doc), [editor, tick]);
  const least = headings.reduce((most, one) => Math.min(most, one.level), 6);

  // The section in view: the last heading above the reading line, read again as the desk scrolls.
  const [current, setCurrent] = useState<number | null>(null);
  useEffect(() => {
    const desk = scope.current;
    if (desk === null || !open || !outlineOpen) return;
    const read = () => {
      const line = desk.getBoundingClientRect().top + READING_LINE;
      let at: number | null = null;
      for (const heading of headings) {
        const dom = editor.view.nodeDOM(heading.pos);
        if (!(dom instanceof HTMLElement)) continue;
        if (dom.getBoundingClientRect().top <= line) at = heading.pos;
        else break;
      }
      setCurrent(at ?? headings[0]?.pos ?? null);
    };
    read();
    desk.addEventListener('scroll', read, { passive: true });
    return () => desk.removeEventListener('scroll', read);
  }, [editor, scope, headings, open, outlineOpen]);

  /** The caret to [from] - or the words from..to selected - and the desk scrolled to put it at the top. */
  const jump = (from: number, to?: number) => {
    const { state } = editor;
    const selection = to === undefined ? TextSelection.near(state.doc.resolve(from)) : TextSelection.create(state.doc, from, to);
    editor.view.dispatch(state.tr.setSelection(selection));
    editor.view.focus();
    // The desk scrolled so the place sits just under its top, where the outline reads the section in view.
    const desk = scope.current;
    if (desk !== null) desk.scrollBy({ top: editor.view.coordsAtPos(from).top - desk.getBoundingClientRect().top - READING_LINE / 2 });
  };

  if (!open) {
    return (
      <div className={styles.sideFolded} data-testid="document-side" data-folded="">
        <button
          type="button"
          className={styles.sideToggle}
          onClick={() => rememberSide('')}
          title={t('Show the outline')}
          aria-label={t('Show the outline')}
          aria-expanded={false}
          data-testid="document-side-toggle"
        >
          »
        </button>
      </div>
    );
  }

  return (
    <aside className={styles.side} aria-label={t('Outline')} data-testid="document-side">
      <div className={styles.sideHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => rememberOutline(outlineOpen ? 'closed' : '')}
          aria-expanded={outlineOpen}
          data-testid="document-outline-toggle"
        >
          <span className={styles.chevron} aria-hidden="true">
            {outlineOpen ? '▾' : '▸'}
          </span>
          {t('Outline')}
        </button>
        <button
          type="button"
          className={styles.sideToggle}
          onClick={() => rememberSide('closed')}
          title={t('Hide the outline')}
          aria-label={t('Hide the outline')}
          aria-expanded
          data-testid="document-side-toggle"
        >
          «
        </button>
      </div>
      {outlineOpen && (
        <nav className={styles.sideList} aria-label={t('Outline')} data-testid="document-outline">
          {headings.length === 0 ? (
            <p className={styles.sideEmpty}>{t('No headings yet')}</p>
          ) : (
            headings.map((heading) => (
              <button
                key={heading.pos}
                type="button"
                className={`${styles.outlineItem} ${current === heading.pos ? styles.outlineCurrent : ''}`}
                style={{ paddingLeft: `calc(var(--space-8) + ${(heading.level - least) * 12}px)` }}
                onClick={() => jump(heading.pos + 1)}
                aria-current={current === heading.pos ? 'location' : undefined}
                title={heading.text}
                data-testid="document-outline-item"
                data-level={heading.level}
              >
                {heading.text.trim() === '' ? t('Untitled heading') : heading.text}
              </button>
            ))
          )}
        </nav>
      )}

      <div className={styles.sideHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => rememberNotes(notesOpen ? 'closed' : '')}
          aria-expanded={notesOpen}
          data-testid="document-highlights-toggle"
        >
          <span className={styles.chevron} aria-hidden="true">
            {notesOpen ? '▾' : '▸'}
          </span>
          {t('Highlights')}
          {highlights.length > 0 && <span className={styles.sideCount}>{highlights.length}</span>}
        </button>
      </div>
      {notesOpen && (
        <div className={styles.sideList} data-testid="document-highlights">
          {highlights.length === 0 ? (
            <p className={styles.sideEmpty}>{t('No highlights yet')}</p>
          ) : (
            highlights.map((one) => (
              <button
                key={one.id}
                type="button"
                className={styles.highlightItem}
                onClick={() => jump(one.from, one.to)}
                title={one.note === '' ? undefined : one.note}
                data-testid="document-highlight-item"
                data-note-id={one.id}
              >
                <span className={styles.highlightText}>{one.text}</span>
                {one.note !== '' && <span className={styles.highlightNote}>{one.note}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
