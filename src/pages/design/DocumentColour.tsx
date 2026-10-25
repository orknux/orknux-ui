import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './DocumentTools.module.css';

/**
 * The colours offered for words, on white paper. Values the document stores,
 * not the interface's own: a colour in a document is the document's, the same
 * in either theme and in every export, so these are not tokens.
 */
export const TEXT_COLOURS = ['#1f1f23', '#6b6b74', '#c00000', '#e36c09', '#b8860b', '#2e7d32', '#00838f', '#1d4ed8', '#6a1b9a', '#ad1457'];

/** The colour of the words at the caret, or of the selection where it is one colour; null for the ordinary one. */
function colourAt(editor: Editor): string | null {
  return (editor.getAttributes('textStyle').color as string | null | undefined) ?? null;
}

export interface DocumentColourProps {
  editor: Editor | null;
  disabled: boolean;
}

/** The format bar's text colour: the letter drawn over a bar of the colour at the caret, and a palette under it. */
export function DocumentColour({ editor, disabled }: DocumentColourProps) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);
  const now = editor === null ? null : colourAt(editor);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !holder.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  const paint = (colour: string | null) => {
    if (editor === null) return;
    if (colour === null) editor.chain().focus().unsetColor().removeEmptyTextStyle().run();
    else editor.chain().focus().setColor(colour).run();
    setOpen(false);
  };

  return (
    <div className={styles.colourHolder} ref={holder}>
      <button
        type="button"
        className={`${shell.tool} ${styles.colourTool}`}
        // The selection stays where it is while the palette is open.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-expanded={open}
        title={t('Text colour')}
        aria-label={t('Text colour')}
        data-testid="document-colour"
      >
        <span className={styles.colourLetter}>A</span>
        <span className={styles.colourBar} style={now === null ? undefined : { background: now }} data-testid="document-colour-now" />
      </button>
      {open && (
        <div className={styles.colourMenu} role="menu" aria-label={t('Text colour')} data-testid="document-colour-menu">
          <div className={styles.swatches}>
            {TEXT_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                role="menuitemradio"
                aria-checked={now === colour}
                className={`${styles.swatch} ${now === colour ? styles.swatchOn : ''}`}
                style={{ background: colour }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => paint(colour)}
                title={colour}
                aria-label={colour}
                data-testid="document-colour-swatch"
                data-colour={colour}
              />
            ))}
          </div>
          <div className={styles.colourRow}>
            <button
              type="button"
              className={styles.colourPlain}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => paint(null)}
              data-testid="document-colour-default"
            >
              {t('Default colour')}
            </button>
            <label className={styles.colourCustom} title={t('Another colour')}>
              <input
                type="color"
                value={now ?? '#000000'}
                onChange={(event) => editor?.chain().setColor(event.target.value).run()}
                aria-label={t('Another colour')}
                data-testid="document-colour-custom"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
