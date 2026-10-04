import { useEffect, useRef, useState } from 'react';
import copyIcon from '../assets/copy.svg';
import { t } from '../i18n';
import { copyText } from './clipboard';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  /** What goes on the clipboard. */
  text: string;
  /** What the button is called to a screen reader: "Copy the token". */
  label: string;
  /** Extra class for the button, where a page lines it up with its own controls. */
  className?: string;
  /** For a check to find it. */
  testId?: string;
}

/**
 * The standard copy control: the copy icon, and a word beside it saying what
 * happened. Issue #589.
 *
 * Always says something. "Copied" when the text is on the clipboard, and that
 * it could not be copied when the browser refused both routes `copyText` has -
 * a button that is pressed and answers nothing is how nobody noticed copying
 * did nothing over plain http.
 */
export function CopyButton({ text, label, className, testId }: CopyButtonProps) {
  const [said, setSaid] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function press() {
    const copied = await copyText(text);
    setSaid(copied ? 'copied' : 'failed');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaid(null), copied ? 1500 : 4000);
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={className ? `${styles.button} ${className}` : styles.button}
        title={t('Copy')}
        aria-label={label}
        data-testid={testId}
        onClick={() => void press()}
      >
        <img src={copyIcon} alt="" width={14} height={14} />
      </button>
      <span className={said === 'failed' ? styles.failed : styles.copied} role="status">
        {said === 'copied' ? t('Copied') : said === 'failed' ? t('Could not copy - select it and copy by hand') : ''}
      </span>
    </span>
  );
}
