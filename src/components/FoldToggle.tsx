import chevronDownIcon from '../assets/chevron-down.svg';
import { showAllLabel, tokenCount } from '../api/chat';
import { t } from '../i18n';
import styles from './FoldToggle.module.css';

interface FoldToggleProps {
  text: string;
  open: boolean;
  onToggle: () => void;
  /** What is folded, for a screen reader: "the arguments", "the result". Left out, the size says it. */
  what?: string;
}

/**
 * The control that opens a long block and folds it again: an icon at the top
 * right of the block, with how much it holds beside it.
 *
 * A link under the text read "Show all 74,883 characters (~18,721 tokens)" and
 * moved to the far end of whatever it had just opened, so closing a block meant
 * finding the link again. The icon stays where it was.
 */
export function FoldToggle({ text, open, onToggle, what }: FoldToggleProps) {
  const label = open
    ? what === undefined
      ? t('Show less')
      : `Show less of ${what}`
    : what === undefined
      ? showAllLabel(text)
      : `Show all of ${what}`;
  return (
    <div className={styles.bar}>
      <span className={styles.size} data-fold-size="">
        {text.length.toLocaleString('en-US')} chars · ~{tokenCount(Math.round(text.length / 4))} tokens
      </span>
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-label={label}
        aria-expanded={open}
        title={open ? t('Collapse') : t('Expand')}
        data-fold-toggle=""
      >
        <img src={chevronDownIcon} alt="" className={open ? styles.up : undefined} />
      </button>
    </div>
  );
}
