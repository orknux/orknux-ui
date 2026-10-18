import { Markdown } from './Markdown';
import styles from './ConnectionGuide.module.css';
import type { PluginConnectionType } from '../api/integrations';
import { tf } from '../i18n';

export interface ConnectionGuideProps {
  /** The plugin kind chosen, or null where the connection is not one. */
  kind: PluginConnectionType | null;
  /**
   * Open from the start. The dialog that creates a connection opens it, since
   * setting one up is what it is for; the connection's own page folds it, since
   * somebody back there has usually done it already.
   */
  open?: boolean;
}

/**
 * How to set up a connection of a plugin's kind, as the plugin wrote it.
 *
 * A kind like AnkiConnect is not a URL and a key and nothing more: an add-on
 * has to be installed and running, an address bound, a proxy rule written. The
 * plugin that knows says so in its declaration, and this shows it beside the
 * fields it is about rather than in a README nobody opens from a form.
 */
export function ConnectionGuide({ kind, open = false }: ConnectionGuideProps) {
  const guide = kind?.guide?.trim();
  if (kind === null || guide === undefined || guide === '') return null;
  return (
    <details className={styles.guide} open={open} data-testid="connection-guide">
      <summary className={styles.summary}>{tf('Setting up {kind}', { kind: kind.label })}</summary>
      <div className={styles.body}>
        <Markdown lineBreaks={false}>{guide}</Markdown>
      </div>
    </details>
  );
}
