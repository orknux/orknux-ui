import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { clearSessionFlag, fetchSessionFlags } from '../../api/flags';
import type { SessionFlag } from '../../api/flags';
import { t } from '../../i18n';
import { flagStateLabel, flagTypeLabel } from '../admin/FlagsReport';
import styles from './SessionFlags.module.css';

/**
 * The flags agents raised on this session, for an installation administrator
 * and nobody else: the page draws this only for one, and the server answers
 * the query only to one. Nothing at all where the session carries none, so a
 * session page reads as it always did until something was flagged.
 */
export function SessionFlags({ sessionId }: { sessionId: string }) {
  const [flags, setFlags] = useState<SessionFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId === '') return undefined;
    let abandoned = false;
    fetchSessionFlags(sessionId)
      .then((found) => {
        if (!abandoned) setFlags(found);
      })
      .catch(() => {
        if (!abandoned) setFlags(null);
      });
    return () => {
      abandoned = true;
    };
  }, [sessionId]);

  if (flags === null || flags.length === 0) return null;

  async function clear(flag: SessionFlag) {
    try {
      const cleared = await clearSessionFlag(flag.id);
      setFlags((held) => held?.map((one) => (one.id === cleared.id ? cleared : one)) ?? held);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not clear the flag.'));
    }
  }

  return (
    <div className={styles.flags} data-testid="session-flags">
      <span className={styles.label}>
        {t('Flags')}
        <Link className={styles.report} to="/admin/reports?report=flags">{t('Open the report')}</Link>
      </span>
      <ul className={styles.list}>
        {flags.map((one) => (
          <li key={one.id} className={styles.flag} data-flag-state={one.state} data-testid="session-flag">
            <span className={one.type === 'SECURITY' ? styles.security : styles.technical}>{flagTypeLabel(one.type)}</span>
            <span className={styles.severity}>{`${one.severity} / 5`}</span>
            <span className={styles.note}>{one.note}</span>
            <span className={styles.meta}>
              {one.agentName}
              {' · '}
              {flagStateLabel(one.state)}
              {one.clearedBy !== null && ` · ${one.clearedBy}`}
            </span>
            {one.state === 'OPEN' && (
              <button type="button" className={styles.clear} onClick={() => void clear(one)}>
                {t('Clear flag')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error !== null && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
