import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchTins, tinKindLabel } from '../../api/tins';
import type { Tin } from '../../api/tins';
import type { SessionUser } from '../../api/session';
import plusIcon from '../../assets/plus.svg';
import settingsIcon from '../../assets/settings.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { ordered, useTableSort } from '../../components/tableSort';
import { shellUser } from '../../session/user';
import styles from './AdminTinsPage.module.css';
import { t } from '../../i18n';

export interface AdminTinsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

type TinOrder = 'NAME' | 'KIND' | 'HEALTH' | 'SESSIONS' | 'LABEL';

/**
 * The tins this installation can give an agent a session in.
 *
 * The local tin is a row only while it is switched on - the server lists it
 * then and not otherwise - so the list is what an agent could be given today.
 * Health is a remote tin's alone: the local one is inside this server, and a
 * dot saying the server can reach itself would be a dot that is always green.
 */
export function AdminTinsPage({ session, onSignOut }: AdminTinsPageProps) {
  const [tins, setTins] = useState<Tin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, ascending, sortBy] = useTableSort<TinOrder>('admin-tins', 'NAME', true, ['SESSIONS']);

  useEffect(() => {
    let current = true;
    fetchTins()
      .then((found) => {
        if (current) setTins(found);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : t('Could not load the tins.'));
      });
    return () => {
      current = false;
    };
  }, []);

  const rows = ordered(
    tins ?? [],
    (tin) => {
      switch (order) {
        case 'KIND':
          return tin.kind;
        case 'HEALTH':
          return tin.health?.status ?? null;
        case 'SESSIONS':
          return tin.activeSessions;
        case 'LABEL':
          return tin.label;
        default:
          return tin.name;
      }
    },
    ascending,
    (tin) => tin.name,
  );

  return (
    <AppShell user={shellUser(session)} onSignOut={onSignOut} sidebar={<AdminSidebar active="tins" />}>
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            <span className={styles.titleWithHint}>
              {t('Tins')}
              <FieldHint label={t('Tins')}>
                {t('A tin is a sandbox an agent opens a session in, with a filesystem and commands. The local tin runs inside this server and is switched in Admin Settings; a remote tin is another orktin reached by its address and API token. An agent is granted tins by label on its page.')}
              </FieldHint>
            </span>
          </h1>
          <p className={styles.subtitle}>{t('Sandboxes agents can run commands in.')}</p>
        </div>
        <Link className={styles.addTin} to="/admin/tins/new">
          <img src={plusIcon} alt="" width={14} height={14} />
          {t('Add tin')}
        </Link>
      </header>

      <section className={styles.card}>
        <div className={styles.tableHeader}>
          <ColumnHeader label={t('Name')} order="NAME" current={order} ascending={ascending} onSort={sortBy} className={styles.colName} />
          <ColumnHeader label={t('Type')} order="KIND" current={order} ascending={ascending} onSort={sortBy} className={styles.colKind} />
          <ColumnHeader label={t('Health')} order="HEALTH" current={order} ascending={ascending} onSort={sortBy} className={styles.colHealth} />
          <ColumnHeader
            label={t('Active sessions')}
            order="SESSIONS"
            current={order}
            ascending={ascending}
            onSort={sortBy}
            className={styles.colSessions}
          />
          <ColumnHeader label={t('Label')} order="LABEL" current={order} ascending={ascending} onSort={sortBy} className={styles.colLabel} />
          <div className={styles.colActions} />
        </div>

        {tins === null && error === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
            {error}
          </p>
        )}
        {tins !== null && tins.length === 0 && <p className={styles.notice}>{t('No tins yet.')}</p>}

        {rows.map((tin) => (
          <div className={styles.row} key={tin.id} data-tin-row={tin.id} data-tin-kind={tin.kind}>
            <div className={styles.colName}>
              <Link className={styles.name} to={`/admin/tins/${encodeURIComponent(tin.id)}`}>
                {tin.name}
              </Link>
              {tin.address !== null && <span className={styles.address}>{tin.address}</span>}
            </div>
            <div className={styles.colKind} data-tin-cell="kind">
              {tinKindLabel(tin.kind)}
            </div>
            <div className={styles.colHealth} data-tin-cell="health" title={tin.health?.detail ?? undefined}>
              {tin.health === null ? (
                <span className={styles.none}>—</span>
              ) : (
                <>
                  <span
                    className={tin.health.status === 'UP' ? styles.dotUp : styles.dotDown}
                    data-tin-health={tin.health.status}
                    aria-hidden="true"
                  />
                  <span className={styles.healthLabel}>{tin.health.status === 'UP' ? t('Up') : t('Down')}</span>
                </>
              )}
            </div>
            <div className={styles.colSessions} data-tin-cell="sessions">
              {tin.activeSessions === null ? <span className={styles.none}>—</span> : tin.activeSessions}
            </div>
            <div className={styles.colLabel} data-tin-cell="label">
              {tin.label === null || tin.label === '' ? (
                <span className={styles.none}>—</span>
              ) : (
                <span className={styles.labelTag}>{tin.label}</span>
              )}
            </div>
            <div className={styles.colActions}>
              <Link
                className={styles.rowAction}
                to={`/admin/tins/${encodeURIComponent(tin.id)}`}
                aria-label={`${t('Edit')} ${tin.name}`}
                title={t('Edit')}
              >
                <img src={settingsIcon} alt="" width={14} height={14} />
              </Link>
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
