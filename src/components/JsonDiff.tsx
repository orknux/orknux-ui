import { useEffect, useRef } from 'react';

import { EDITOR_FONT_FAMILY, EDITOR_FONT_SIZE, editorTheme, monaco } from './monaco';
import styles from './JsonDiff.module.css';
import { t } from '../i18n';

const LINE_HEIGHT = 20;
/** Tall enough to read a whole agent, short enough to leave the page around it. */
const MAX_LINES = 40;

export interface JsonDiffProps {
  /** The version before; null where none is kept, and the JSON is shown alone. */
  before: string | null;
  after: string;
}

/**
 * Two versions of a component as JSON, with what changed between them marked.
 *
 * Monaco's own diff editor, read-only and inline: a history row is narrow, and
 * side by side would halve a line that is already a long JSON string. Unchanged
 * stretches fold away, so a save that touched one grant reads as that grant.
 */
export function JsonDiff({ before, after }: JsonDiffProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current === null) return;
    const original = monaco.editor.createModel(before ?? after, 'json');
    const modified = monaco.editor.createModel(after, 'json');
    const diff = monaco.editor.createDiffEditor(host.current, {
      theme: editorTheme(),
      readOnly: true,
      originalEditable: false,
      renderSideBySide: false,
      automaticLayout: true,
      fontFamily: EDITOR_FONT_FAMILY,
      fontSize: EDITOR_FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      hideUnchangedRegions: { enabled: before !== null, contextLineCount: 2, minimumLineCount: 4 },
      renderOverviewRuler: false,
      ariaLabel: t('This version as JSON, with what changed'),
    });
    diff.setModel({ original, modified });

    /*
     * As tall as what it draws, up to a ceiling: a fixed box either cuts a
     * long agent off or leaves a short skill floating in empty space.
     */
    const fit = () => {
      const lines = diff.getModifiedEditor().getContentHeight();
      if (host.current !== null) host.current.style.height = `${Math.min(lines, MAX_LINES * LINE_HEIGHT) + 4}px`;
    };
    const sized = diff.getModifiedEditor().onDidContentSizeChange(fit);
    fit();

    return () => {
      sized.dispose();
      diff.dispose();
      original.dispose();
      modified.dispose();
    };
  }, [before, after]);

  return <div ref={host} className={styles.diff} data-json-diff="" />;
}
