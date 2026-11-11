import { useEffect, useMemo, useState } from 'react';

import { fetchClientUses } from '../../api/clientUse';
import type { ClientUse } from '../../api/clientUse';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { t } from '../../i18n';
import styles from './AdminReportsPage.module.css';
import own from './ClientsReport.module.css';
import { formatDate, Picker, Tile } from './reportParts';

/** Which product a row is, as the report groups them. */
export type ClientProduct = 'chrome' | 'windows' | 'linux' | 'terminal' | 'claude' | 'other';

export function productOf(use: ClientUse): ClientProduct {
  if (use.kind === 'BROWSER') return 'chrome';
  if (use.kind === 'SHELL') return 'terminal';
  if (use.kind === 'CLAUDE') return 'claude';
  const said = `${use.client ?? ''} ${use.name}`.toLowerCase();
  if (said.includes('windows')) return 'windows';
  if (said.includes('linux')) return 'linux';
  return 'other';
}

export function productLabel(product: ClientProduct): string {
  switch (product) {
    case 'chrome':
      return t('Chrome extension');
    case 'windows':
      return t('Orknux for Windows');
    case 'linux':
      return t('Orknux for Linux');
    case 'terminal':
      return t('Orknux Shell (terminal)');
    case 'claude':
      return t('Claude Code plugin');
    default:
      return t('Other client');
  }
}

const PRODUCTS: ClientProduct[] = ['chrome', 'windows', 'linux', 'terminal'];

/**
 * Who uses which Orknux client: the Chrome extension, Orknux for Windows and
 * for Linux, and Orknux Shell in a terminal. A client is written down when it
 * asks the server for work, so one that is installed and never connected is
 * not here.
 */
export function ClientsReport() {
  const [uses, setUses] = useState<ClientUse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('30');
  const [product, setProduct] = useState<ClientProduct | ''>('');

  useEffect(() => {
    fetchClientUses()
      .then(setUses)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not read the report.')));
  }, []);

  const since = days === 'all' ? 0 : Date.now() - Number(days) * 86_400_000;
  const inPeriod = useMemo(
    () => (uses ?? []).filter((one) => new Date(one.lastSeen).getTime() >= since),
    [uses, since],
  );
  const shown = inPeriod.filter((one) => product === '' || productOf(one) === product);
  const people = (which: ClientProduct) => new Set(inPeriod.filter((one) => productOf(one) === which).map((one) => one.username)).size;

  return (
    <section className={styles.card}>
      <div className={styles.reportHead}>
        <div className={styles.lead}>
          <h2 className={`${styles.sectionHeading} ${styles.headingWithHint}`}>
            {t('Clients')}
            <FieldHint label={t('Clients')}>
              {t('Who uses the Chrome extension, Orknux for Windows and for Linux, and Orknux Shell in a terminal. A client is listed once it has connected to this server.')}
            </FieldHint>
          </h2>
        </div>
        <div className={styles.filters}>
          <Picker label={t('Period')} value={days} onChange={setDays}>
            <option value="7">{t('Last 7 days')}</option>
            <option value="30">{t('Last 30 days')}</option>
            <option value="90">{t('Last 90 days')}</option>
            <option value="365">{t('Last 12 months')}</option>
            <option value="all">{t('All time')}</option>
          </Picker>
          <Picker label={t('Client')} value={product} onChange={(value) => setProduct(value as ClientProduct | '')}>
            <option value="">{t('All clients')}</option>
            {[...PRODUCTS, 'claude' as const].map((one) => (
              <option key={one} value={one}>{productLabel(one)}</option>
            ))}
          </Picker>
        </div>
      </div>

      {uses !== null && (
        <div className={styles.tiles} data-testid="clients-tiles">
          {PRODUCTS.map((one) => (
            <Tile key={one} label={productLabel(one)} value={String(people(one))}>
              {people(one) === 1 ? t('person in this period') : t('people in this period')}
            </Tile>
          ))}
        </div>
      )}

      {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
      {uses === null && error === null && <p className={styles.notice}><Loader /></p>}
      {uses !== null && shown.length === 0 && <p className={styles.notice}>{t('No client has connected in this period.')}</p>}

      {shown.length > 0 && (
        <div className={styles.tableBox}>
          <table className={styles.table} data-testid="clients-table">
            <thead>
              <tr>
                <th>{t('Person')}</th>
                <th>{t('Client')}</th>
                <th>{t('Computer')}</th>
                <th>{t('Version')}</th>
                <th>{t('First seen')}</th>
                <th>{t('Last seen')}</th>
                <th>{t('Now')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((one) => (
                <tr key={`${one.username} ${one.kind} ${one.name}`} data-testid="client-row" data-client={productOf(one)}>
                  <td>
                    {one.displayName ?? one.username}
                    {one.displayName !== null && one.displayName !== one.username && (
                      <span className={styles.muted}>{` ${one.username}`}</span>
                    )}
                  </td>
                  <td>{productLabel(productOf(one))}</td>
                  {/* A desktop client's own name for its computer; a browser's system, read off what it says it is. */}
                  <td className={one.computer ? undefined : styles.muted}>{one.computer ?? '—'}</td>
                  <td className={styles.muted}>{one.version ?? '—'}</td>
                  <td className={styles.muted}>{formatDate(one.firstSeen)}</td>
                  <td className={styles.muted}>{formatDate(one.lastSeen)}</td>
                  <td>
                    {one.connected ? (
                      <span className={own.connected} data-testid="client-connected">{t('Connected')}</span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
