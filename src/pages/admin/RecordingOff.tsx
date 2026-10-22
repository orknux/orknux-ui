import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { t } from '../../i18n';
import styles from './AdminReportsPage.module.css';

/**
 * One line over a report whose recording is switched off: what is off, and a
 * link to the switch in Admin Settings' Reports section. Nothing is drawn while
 * it is on - the caller only renders this when something is off.
 */
export function RecordingOff({ report, setting, action, children }: {
  /** Which report this is, for the checks that look for the line. */
  report: string;
  /** The id of the switch's row in Admin Settings, which the link lands on. */
  setting: string;
  /** The link's words: "Turn it on in Settings", or "them" where the sentence names several. */
  action?: string;
  /** What is off, as a sentence. */
  children: ReactNode;
}) {
  return (
    <p className={styles.recordingOff} data-recording-off={report}>
      {children}{' '}
      <Link className={styles.recordingOffLink} to={`/admin/settings#${setting}`}>
        {action ?? t('Turn it on in Settings')}
      </Link>
    </p>
  );
}
