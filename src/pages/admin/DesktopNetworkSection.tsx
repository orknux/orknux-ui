import { useEffect, useState } from 'react';

import { fetchDesktopNetwork, setDesktopNetwork } from '../../api/desktopNetwork';
import type { DesktopNetwork, DesktopNetworkMode } from '../../api/desktopNetwork';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import styles from './DesktopNetworkSection.module.css';

/** The shortest password the server takes; it refuses a shorter one in its own words as well. */
const SHORTEST_PASSWORD = 12;
/** How often to ask whether the server is back, while the desktop app starts it again. */
const BACK_EVERY_MS = 1000;

/**
 * Admin › Settings › Network access, on the desktop app only.
 *
 * Whether the app is reached from this computer alone, with nobody signing in,
 * or from the network, with everybody signing in. Its own Apply rather than the
 * page's Save: applying it starts the server again, which is a different thing
 * to agree to than changing a number. Going to the network sets the password
 * the person here will sign in with, under the account named beside it, so the
 * restart does not lock them out of what they just locked.
 */
export function DesktopNetworkSection() {
  const [held, setHeld] = useState<DesktopNetwork | null>(null);
  const [mode, setMode] = useState<DesktopNetworkMode>('LOCAL');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [applying, setApplying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    fetchDesktopNetwork()
      .then((found) => {
        if (abandoned || found === null) return;
        setHeld(found);
        setMode(found.chosen);
      })
      .catch(() => undefined);
    return () => {
      abandoned = true;
    };
  }, []);

  // Not the desktop app's server: there is no such setting to draw.
  if (held === null) return null;

  const exposing = mode === 'EXPOSED';
  const changed = mode !== held.chosen || (exposing && password !== '');
  const tooShort = exposing && password.length < SHORTEST_PASSWORD;
  const mismatch = exposing && repeat !== password;
  const ready = changed && !(exposing && (tooShort || mismatch)) && !applying && !waiting;

  /** Asks the server until it answers again, then reloads onto it. */
  function waitForReturn() {
    setWaiting(true);
    const ask = () => {
      fetch('/api/auth/method', { credentials: 'include' })
        .then((answer) => {
          if (answer.ok) window.location.reload();
          else window.setTimeout(ask, BACK_EVERY_MS);
        })
        .catch(() => window.setTimeout(ask, BACK_EVERY_MS));
    };
    // A moment for the server to go before asking whether it is back.
    window.setTimeout(ask, BACK_EVERY_MS * 3);
  }

  async function apply() {
    if (!ready) return;
    setApplying(true);
    setError(null);
    try {
      const saved = await setDesktopNetwork(mode, exposing ? password : undefined);
      setHeld(saved);
      setPassword('');
      setRepeat('');
      if (saved.restartRequired && saved.restarts) waitForReturn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div data-testid="desktop-network">
      <h2 id="network-access" className={page.sectionHeading}>{t('Network access')}</h2>

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.settingLabel}>{t('Who can reach this app')}</span>
          <div className={styles.choices} role="radiogroup" aria-label={t('Who can reach this app')}>
            <label className={styles.choice}>
              <input type="radio" name="desktop-network" checked={mode === 'LOCAL'} onChange={() => setMode('LOCAL')} />
              {t('This computer only, and nobody signs in')}
            </label>
            <label className={styles.choice}>
              <input type="radio" name="desktop-network" checked={mode === 'EXPOSED'} onChange={() => setMode('EXPOSED')} />
              {t('Anyone on the network, and everybody signs in')}
            </label>
          </div>
        </div>
      </div>

      {exposing && (
        <div className={page.setting}>
          <div className={page.settingText}>
            <span className={page.settingLabel}>{tf('Password for {account}', { account: held.account })}</span>
            <p className={page.settingNote}>{tf('You sign in as {account} with it once the app starts again.', { account: held.account })}</p>
            <div className={styles.passwords}>
              <input
                id="desktop-network-password"
                className={page.input}
                type="password"
                autoComplete="new-password"
                placeholder={tf('At least {count} characters', { count: SHORTEST_PASSWORD })}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <input
                id="desktop-network-repeat"
                className={page.input}
                type="password"
                autoComplete="new-password"
                placeholder={t('The same again')}
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
              />
            </div>
            {password !== '' && tooShort && (
              <p className={page.noticeError} role="alert">{tf('At least {count} characters', { count: SHORTEST_PASSWORD })}</p>
            )}
            {repeat !== '' && mismatch && <p className={page.noticeError} role="alert">{t('The two passwords differ')}</p>}
            {held.addresses.length > 0 && (
              <p className={page.settingNote}>
                {t('Others open it at')} {held.addresses.map((address) => <code key={address}>{address} </code>)}
              </p>
            )}
          </div>
        </div>
      )}

      {error !== null && <p className={page.noticeError} role="alert">{error}</p>}
      <div className={styles.actions}>
        <span className={page.settingNote}>
          {waiting ? t('Starting again… this page reloads when it is back.') : t('Applying it starts the app again.')}
        </span>
        <button type="button" className={page.primaryButton} disabled={!ready} onClick={() => void apply()} data-testid="desktop-network-apply">
          {applying ? t('Applying…') : t('Apply and restart')}
        </button>
      </div>
    </div>
  );
}
