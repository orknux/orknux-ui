import { useParams } from 'react-router-dom';

import { Attribution } from '../../components/Attribution';
import { CopyButton } from '../../components/CopyButton';
import { OrknuxMark } from '../../components/OrknuxMark';
import { LoginSky } from './LoginSky';
import styles from './LoginPage.module.css';
import pairing from '../../components/ClientPairing.module.css';
import { t } from '../../i18n';

/**
 * Where a pairing link lands when somebody opens it in a browser instead of
 * pasting it into a client. The link is for the Chrome extension, Orknux for
 * Windows, the Claude Code plugin or Orknux Shell, so this says so and hands it back to be
 * copied, rather than sending them to sign in or to a page that is not there.
 *
 * Reached without being anybody, like the password pages: the link may well be
 * opened on the machine the client is being set up on, signed in or not.
 */
export function PairLinkPage() {
  const { code = '' } = useParams();
  const link = `${window.location.origin}/pair/${code}`;
  return (
    <main className={styles.page}>
      <LoginSky />
      <div className={styles.card} data-testid="pair-link-page">
        <header className={styles.header}>
          <div className={styles.logomark}>
            <span className={styles.logoIcon}>
              <OrknuxMark />
            </span>
            <p className={styles.wordmark}>orknux</p>
          </div>
          <div className={styles.headings}>
            <h1 className={styles.title}>{t('Pairing link')}</h1>
            <p className={styles.subtitle}>
              {t('This link connects an Orknux client to this server. It is pasted into the client, not opened here.')}
            </p>
          </div>
        </header>
        <span className={pairing.issued}>
          <code className={pairing.link}>{link}</code>
          <CopyButton text={link} label={t('Copy the link')} />
        </span>
        <ul className={pairing.where}>
          <li>{t('Chrome extension: open its side panel, paste the link into Server, and press Connect.')}</li>
          <li>{t('Orknux for Windows: paste the link into Server, and press Connect.')}</li>
          <li>{t('Claude Code: paste the link into the conversation and ask it to connect to Orknux.')}</li>
          <li>{t('Orknux Shell: run orknux with the link, or paste it where it asks for a server.')}</li>
        </ul>
        <p className={styles.subtitle}>{t('It works once, for a few minutes. If it has run out, make a new one in Orknux: Preferences › Connected clients › Connect a client.')}</p>
        <Attribution />
      </div>
    </main>
  );
}
