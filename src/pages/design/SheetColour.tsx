import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './DocumentTools.module.css';

/**
 * The colours offered for a cell's words: mid tones, which read on the grid in
 * either theme, plus black and white. Values the sheet stores, not the
 * interface's own - a colour in a sheet is the sheet's, the same in every
 * theme and in its .xlsx - so these are not tokens.
 */
export const SHEET_TEXT_COLOURS = ['#000000', '#ffffff', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0'];

/** The colours offered behind a cell: the pale fills a spreadsheet offers first, and a few strong ones for a header. */
export const SHEET_FILL_COLOURS = ['#fff2cc', '#fce4d6', '#e2efda', '#ddebf7', '#ede7f6', '#f4cccc', '#d9d9d9', '#ffd966', '#4472c4', '#38761d'];

export interface SheetColourProps {
  /** What the button says it does: the words' colour or the fill. */
  label: string;
  /** What is drawn over the bar of the colour now. */
  mark: ReactNode;
  colours: string[];
  /** The colour of the selected cell; null for none. */
  now: string | null;
  disabled: boolean;
  onPick: (colour: string | null) => void;
  /** Names the button `{testid}`, the palette `{testid}-menu`, each swatch `{testid}-swatch` and the way back `{testid}-none`. */
  testid: string;
  /** What taking the colour away is called: the default colour, or no fill. */
  none: string;
}

/**
 * A colour for the selected cells, as the document editor's format bar picks
 * one: the mark drawn over a bar of the colour the selected cell has, and a
 * palette under it with a way back to none and a picker for any other. The
 * palette's own looks are the document's, so the two bars read as one product.
 */
export function SheetColour({ label, mark, colours, now, disabled, onPick, testid, none }: SheetColourProps) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

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

  const pick = (colour: string | null) => {
    onPick(colour);
    setOpen(false);
  };

  return (
    <div className={styles.colourHolder} ref={holder}>
      <button
        type="button"
        className={`${shell.tool} ${styles.colourTool}`}
        // The grid keeps the focus, so the keys go on moving the selection after a colour is picked.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-expanded={open}
        title={label}
        aria-label={label}
        data-testid={testid}
      >
        {mark}
        <span className={styles.colourBar} style={now === null ? undefined : { background: now }} data-testid={`${testid}-now`} />
      </button>
      {open && (
        <div className={styles.colourMenu} role="menu" aria-label={label} data-testid={`${testid}-menu`}>
          <div className={styles.swatches}>
            {colours.map((colour) => (
              <button
                key={colour}
                type="button"
                role="menuitemradio"
                aria-checked={now === colour}
                className={`${styles.swatch} ${now === colour ? styles.swatchOn : ''}`}
                style={{ background: colour }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(colour)}
                title={colour}
                aria-label={colour}
                data-testid={`${testid}-swatch`}
                data-colour={colour}
              />
            ))}
          </div>
          <div className={styles.colourRow}>
            <button type="button" className={styles.colourPlain} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(null)} data-testid={`${testid}-none`}>
              {none}
            </button>
            <label className={styles.colourCustom} title={t('Another colour')}>
              <input
                type="color"
                value={now ?? '#000000'}
                onChange={(event) => onPick(event.target.value)}
                aria-label={t('Another colour')}
                data-testid={`${testid}-custom`}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
