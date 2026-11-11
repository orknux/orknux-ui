import { useEffect, useRef, useState } from 'react';

import type { BorderSide } from '../../api/sheets';
import borderAllIcon from '../../assets/border-all.svg';
import borderBottomIcon from '../../assets/border-bottom.svg';
import borderLeftIcon from '../../assets/border-left.svg';
import borderNoneIcon from '../../assets/border-none.svg';
import borderOuterIcon from '../../assets/border-outer.svg';
import borderRightIcon from '../../assets/border-right.svg';
import borderTopIcon from '../../assets/border-top.svg';
import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import tools from './DocumentTools.module.css';
import styles from './SheetBorders.module.css';
import type { BorderChoice } from './sheetGrid';

export interface SheetBordersProps {
  /** The sides the cell in focus has a line on, so the bar says what is there. */
  sides: BorderSide[];
  disabled: boolean;
  /** A border chosen; `off` where it was already there, which takes it away again. */
  onPick: (choice: BorderChoice, off: boolean) => void;
}

const CHOICES: { choice: BorderChoice; icon: string; label: () => string }[] = [
  { choice: 'all', icon: borderAllIcon, label: () => t('All borders') },
  { choice: 'outer', icon: borderOuterIcon, label: () => t('Outer borders') },
  { choice: 'top', icon: borderTopIcon, label: () => t('Top border') },
  { choice: 'bottom', icon: borderBottomIcon, label: () => t('Bottom border') },
  { choice: 'left', icon: borderLeftIcon, label: () => t('Left border') },
  { choice: 'right', icon: borderRightIcon, label: () => t('Right border') },
  { choice: 'none', icon: borderNoneIcon, label: () => t('No borders') },
];

/**
 * The cells' borders, as icons on the format bar: one button showing whether
 * the cell in focus has any, opening the seven a spreadsheet offers - each
 * marked where the cell has it, and pressed again to take it away, as Bold is.
 */
export function SheetBorders({ sides, disabled, onPick }: SheetBordersProps) {
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

  const has = (side: BorderSide) => sides.includes(side);
  const on = (choice: BorderChoice): boolean =>
    choice === 'none' ? sides.length === 0 : choice === 'all' || choice === 'outer' ? sides.length === 4 : has(choice);
  const shown = sides.length === 4 ? borderAllIcon : sides.length === 0 ? borderNoneIcon : (CHOICES.find((one) => has(one.choice as BorderSide))?.icon ?? borderOuterIcon);

  return (
    <div className={tools.colourHolder} ref={holder}>
      <button
        type="button"
        className={`${shell.tool} ${sides.length > 0 ? styles.marked : ''}`}
        // The grid keeps the focus, so the keys go on moving the selection after a border is picked.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-expanded={open}
        aria-pressed={sides.length > 0}
        title={t('Borders')}
        aria-label={t('Borders')}
        data-testid="sheet-borders"
        data-sides={sides.join(' ')}
      >
        <img src={shown} alt="" width={16} height={16} />
      </button>
      {open && (
        <div className={`${tools.colourMenu} ${styles.menu}`} role="menu" aria-label={t('Borders')} data-testid="sheet-borders-menu">
          {CHOICES.map(({ choice, icon, label }) => {
            const pressed = on(choice);
            return (
              <button
                key={choice}
                type="button"
                role="menuitemcheckbox"
                aria-checked={pressed}
                className={`${shell.tool} ${pressed ? styles.marked : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(choice, pressed && choice !== 'none');
                  setOpen(false);
                }}
                title={label()}
                aria-label={label()}
                data-testid={`sheet-border-${choice}`}
              >
                <img src={icon} alt="" width={16} height={16} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
