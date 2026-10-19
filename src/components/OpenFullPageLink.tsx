import { t } from '../i18n';
import styles from './OpenFullPageLink.module.css';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';

/**
 * The way from a quick edit to the component's own page, which holds what a
 * panel has no room for - what uses it, its history, its log.
 *
 * A new tab rather than this one: the panel is opened over a workflow being
 * drawn, and leaving the editor to read a Used by list would ask about unsaved
 * changes, or lose the place on the canvas.
 */
export function OpenFullPageLink({ to }: { to: string }) {
  return (
    <a className={styles.link} href={to} target="_blank" rel="noreferrer" data-open-full-page="">
      <OpenDefinitionIcon />
      {t('Open page')}
    </a>
  );
}
