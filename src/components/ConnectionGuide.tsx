import { useState } from 'react';
import { Markdown } from './Markdown';
import styles from './ConnectionGuide.module.css';
import type { PluginConnectionType } from '../api/integrations';
import { t, tf } from '../i18n';

export interface ConnectionGuideProps {
  /** The plugin kind chosen, or null where the connection is not one. */
  kind: PluginConnectionType | null;
  /**
   * Open from the start. The dialog that creates a connection opens it, since
   * setting one up is what it is for; the connection's own page folds it, since
   * somebody back there has usually done it already.
   */
  open?: boolean;
  /**
   * Beside the Add dialog's form: start this tall - the form's height - and
   * scroll as one box, dragged taller by its corner, rather than a short body.
   */
  height?: number;
}

/**
 * How to set up a connection of a plugin's kind, as the plugin wrote it.
 *
 * A kind like AnkiConnect is not a URL and a key and nothing more: an add-on
 * has to be installed and running, an address bound, a proxy rule written. The
 * plugin that knows says so in its declaration, and this shows it beside the
 * fields it is about rather than in a README nobody opens from a form.
 */
export function ConnectionGuide({ kind, open = false, height }: ConnectionGuideProps) {
  const fill = height !== undefined;
  const [expanded, setExpanded] = useState(open);
  const guide = kind?.guide?.trim();
  if (kind === null || guide === undefined || guide === '') return null;
  return (
    <details
      className={fill ? `${styles.guide} ${styles.filling}` : styles.guide}
      style={fill ? { height } : undefined}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      // Beside the form it is the column's whole content, so there is nothing to fold it into.
      onClick={fill ? (event) => { if ((event.target as HTMLElement).closest('summary')) event.preventDefault(); } : undefined}
      data-testid="connection-guide"
    >
      <summary className={styles.summary}>
        <span>{tf('Setting up {kind}', { kind: kind.label })}</span>
        {/* Said in words as well as by the marker, which is easy to miss at this size. */}
        {!fill && <span className={styles.toggle} aria-hidden="true">{expanded ? t('Collapse') : t('Expand')}</span>}
      </summary>
      <div className={styles.body}>
        <Markdown lineBreaks={false}>{guide}</Markdown>
      </div>
    </details>
  );
}
