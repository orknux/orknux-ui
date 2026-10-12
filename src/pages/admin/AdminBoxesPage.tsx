import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchBoxes, boxKindLabel } from '../../api/boxes';
import type { Box } from '../../api/boxes';
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
import styles from './AdminBoxesPage.module.css';
import { t, tf } from '../../i18n';

export interface AdminBoxesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

type BoxOrder = 'NAME' | 'KIND' | 'HEALTH' | 'SESSIONS' | 'FREE' | 'LABEL';

/**
 * The boxes this installation can give an agent a session in.
 *
 * The local box is a row only while it is switched on - the server lists it
 * then and not otherwise - so the list is what an agent could be given today.
 * Health is a remote box's alone: the local one is inside this server, and a
 * dot saying the server can reach itself would be a dot that is always green.
 */
export function AdminBoxesPage({ session, onSignOut }: AdminBoxesPageProps) {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, ascending, sortBy] = useTableSort<BoxOrder>('admin-boxes', 'NAME', true, ['SESSIONS', 'FREE']);

  useEffect(() => {
    let current = true;
    fetchBoxes()
      .then((found) => {
        if (current) setBoxes(found);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : t('Could not load the boxes.'));
      });
    return () => {
      current = false;
    };
  }, []);

  const rows = ordered(
    boxes ?? [],
    (box) => {
      switch (order) {
        case 'KIND':
          return box.kind;
        case 'HEALTH':
          return box.health?.status ?? null;
        case 'SESSIONS':
          return box.capacity?.active ?? box.activeSessions;
        case 'FREE':
          return box.capacity?.free ?? null;
        case 'LABEL':
          return box.label;
        default:
          return box.name;
      }
    },
    ascending,
    (box) => box.name,
  );

  return (
    <AppShell user={shellUser(session)} onSignOut={onSignOut} sidebar={<AdminSidebar active="boxes" />}>
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            <span className={styles.titleWithHint}>
              {t('Boxes')}
              <FieldHint label={t('Boxes')}>
                {t('A box is a sandbox an agent opens a session in, with a filesystem and commands. The local box runs inside this server and is switched in Admin Settings; a remote box is another Orkbox reached by its address and API token. An agent is granted boxes by label on its page.')}
              </FieldHint>
            </span>
          </h1>
          <p className={styles.subtitle}>{t('Sandboxes agents can run commands in.')}</p>
        </div>
        <Link className={styles.addBox} to="/admin/boxes/new">
          <img src={plusIcon} alt="" width={14} height={14} />
          {t('Add box')}
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
          <ColumnHeader
            label={t('Free sessions')}
            order="FREE"
            current={order}
            ascending={ascending}
            onSort={sortBy}
            className={styles.colFree}
          />
          <ColumnHeader label={t('Label')} order="LABEL" current={order} ascending={ascending} onSort={sortBy} className={styles.colLabel} />
          <div className={styles.colActions} />
        </div>

        {boxes === null && error === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
            {error}
          </p>
        )}
        {boxes !== null && boxes.length === 0 && <p className={styles.notice}>{t('No boxes yet.')}</p>}

        {rows.map((box) => (
          <div className={styles.row} key={box.id} data-box-row={box.id} data-box-kind={box.kind}>
            <div className={styles.colName}>
              <Link className={styles.name} to={`/admin/boxes/${encodeURIComponent(box.id)}`}>
                {box.name}
              </Link>
              {box.address !== null && <span className={styles.address}>{box.address}</span>}
            </div>
            <div className={styles.colKind} data-box-cell="kind">
              {boxKindLabel(box.kind)}
            </div>
            <div className={styles.colHealth} data-box-cell="health" title={healthTitle(box)}>
              {box.health === null ? (
                <span className={styles.none}>—</span>
              ) : (
                <>
                  <span
                    className={box.health.status === 'UP' ? styles.dotUp : styles.dotDown}
                    data-box-health={box.health.status}
                    aria-hidden="true"
                  />
                  <span className={styles.healthLabel}>{box.health.status === 'UP' ? t('Up') : t('Down')}</span>
                </>
              )}
            </div>
            <div className={styles.colSessions} data-box-cell="sessions">
              {box.capacity !== null ? (
                <span
                  title={tf('{busy} running a command, {idle} idle - open with nothing running, not counted against the limit', {
                    busy: box.capacity.busy,
                    idle: box.capacity.idle,
                  })}
                >
                  <span data-box-busy>{tf('{n} working', { n: box.capacity.busy })}</span>
                  <span className={styles.none} data-box-idle>
                    {' · '}
                    {tf('{n} idle', { n: box.capacity.idle })}
                  </span>
                </span>
              ) : box.activeSessions === null ? (
                <span className={styles.none}>—</span>
              ) : (
                box.activeSessions
              )}
            </div>
            <div
              className={styles.colFree}
              data-box-cell="free"
              title={box.capacity === null ? undefined : tf('{free} more of the {max} that may work at once', { free: box.capacity.free, max: box.capacity.max })}
            >
              {box.capacity === null ? (
                <span className={styles.none}>—</span>
              ) : (
                <>
                  <span className={box.capacity.free === 0 ? styles.full : undefined}>{box.capacity.free}</span>
                  <span className={styles.none}> / {box.capacity.max}</span>
                </>
              )}
            </div>
            <div className={styles.colLabel} data-box-cell="label">
              {box.label === null || box.label === '' ? (
                <span className={styles.none}>—</span>
              ) : (
                <span className={styles.labelTag}>{box.label}</span>
              )}
            </div>
            <div className={styles.colActions}>
              <Link
                className={styles.rowAction}
                to={`/admin/boxes/${encodeURIComponent(box.id)}`}
                aria-label={`${t('Edit')} ${box.name}`}
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

/** What the health dot means, said short on hover. */
function healthTitle(box: Box): string | undefined {
  if (box.health === null) return undefined;
  if (box.health.status === 'UP') return t('Healthy: ready to take sessions');
  return box.health.detail === null
    ? t('Unhealthy: cannot take sessions right now')
    : tf('Unhealthy: {reason}', { reason: box.health.detail });
}
