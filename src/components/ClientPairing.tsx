import { useCallback, useEffect, useRef, useState } from 'react';

import { disconnectClient, fetchMyClients, startClientPairing } from '../api/clients';
import type { ClientPairingCode, ConnectedClient } from '../api/clients';
import { timeAgo } from '../api/tools';
import { CopyButton } from './CopyButton';
import table from './AccessTokens.module.css';
import styles from './ClientPairing.module.css';
import { t, tf } from '../i18n';

/** How often the list is asked again while a code is out: a pairing should show within a moment of the client trading it. */
const WHILE_PAIRING_MS = 2_000;
/** And otherwise, so "last used" moves while the page is open. */
const AT_REST_MS = 30_000;

export interface ClientPairingButtonProps {
  className?: string;
  /**
   * For the Claude Code guide: the link handed over inside the sentence to
   * paste into Claude Code, which tells it what to do with it.
   */
  forClaudeCode?: boolean;
  /** Told when a code is shown and when it is gone, so a list beside it can watch for the client arriving. */
  onPairing?: (pairing: boolean) => void;
}

/**
 * Connecting an Orknux client - the Chrome extension, Orknux for Windows, the
 * Claude Code plugin - with a one-time code rather than an access token, which
 * any account may do, a directory's included. The code is shown with how long
 * it has left; the client trades it once for a credential of its own.
 */
export function ClientPairingButton({ className, onPairing, forClaudeCode = false }: ClientPairingButtonProps) {
  const [issued, setIssued] = useState<ClientPairingCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (issued === null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [issued]);

  const left = issued === null ? 0 : Math.max(0, Math.round((Date.parse(issued.expiresAt) - now) / 1000));
  const showing = issued !== null && left > 0;
  useEffect(() => {
    onPairing?.(showing);
  }, [showing, onPairing]);

  const make = () => {
    setError(null);
    startClientPairing().then(
      (code) => {
        setIssued(code);
        setNow(Date.now());
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : t('That did not work.')),
    );
  };

  return (
    <div className={styles.pairing} data-testid="client-pairing">
      {showing ? (
        <>
          {/*
            One thing to copy: the server and the code together, which every
            client takes as it is. The code alone stays readable beside it, for a
            client that asks for it in its own field.
          */}
          <span className={styles.issued}>
            <code className={styles.link} data-testid="client-pairing-link">
              {forClaudeCode ? claudeCodeSentence(linkOf(issued.code)) : linkOf(issued.code)}
            </code>
            <CopyButton
              text={forClaudeCode ? claudeCodeSentence(linkOf(issued.code)) : linkOf(issued.code)}
              label={forClaudeCode ? t('Copy it') : t('Copy the link')}
            />
          </span>
          <span className={styles.left}>
            {forClaudeCode
              ? tf('Paste it into Claude Code within {minutes}:{seconds}. It works once.', {
                  minutes: Math.floor(left / 60),
                  seconds: String(left % 60).padStart(2, '0'),
                })
              : tf('Paste it into the client within {minutes}:{seconds}. It works once.', {
                  minutes: Math.floor(left / 60),
                  seconds: String(left % 60).padStart(2, '0'),
                })}
          </span>
          {/*
            The code on its own, with a copy of its own: a client that asks for the
            code in a field of its own - the Chrome extension, Orknux for Windows -
            wants it alone, not the link around it.
          */}
          <span className={styles.codeRow}>
            <span className={styles.left}>{t('Code')}</span>
            <code className={styles.codeAlone} data-testid="client-pairing-code">{issued.code}</code>
            <CopyButton text={issued.code} label={t('Copy the code')} testId="client-pairing-copy-code" />
          </span>
        </>
      ) : (
        <button type="button" className={className ?? styles.button} onClick={make} data-testid="client-pairing-start">
          {issued === null ? t('Connect a client') : t('Make a new code')}
        </button>
      )}
      {error !== null && <span className={styles.error} role="alert">{error}</span>}
    </div>
  );
}

/** The pairing link for [code] on this server: what a client is given to connect with. */
export function linkOf(code: string): string {
  return `${window.location.origin}/pair/${code}`;
}

/** What is pasted into Claude Code: the link, and what to do with it, in words it acts on. */
function claudeCodeSentence(link: string): string {
  return `Connect to Orknux with this pairing link: ${link}`;
}

/**
 * The clients the signed-in person has connected, as a table like the access
 * tokens above it, and the button that pairs another. It keeps itself current:
 * quickly while a code is out, so the client shows up the moment it pairs and
 * the code gives way, and slowly otherwise, and again when the tab is looked at.
 */
export function ConnectedClients({ buttonClassName }: { buttonClassName?: string }) {
  const [clients, setClients] = useState<ConnectedClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [arrived, setArrived] = useState<string | null>(null);
  // Remounting the button is how a code that has been used is put away.
  const [round, setRound] = useState(0);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(
    () =>
      fetchMyClients().then(
        (list) => {
          setError(null);
          setClients(list);
          const before = known.current;
          known.current = new Set(list.map((one) => one.id));
          const added = before === null ? undefined : list.find((one) => !before.has(one.id));
          if (added !== undefined) {
            setArrived(added.name);
            setRound((n) => n + 1);
          }
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : t('That did not work.')),
      ),
    [],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), pairing ? WHILE_PAIRING_MS : AT_REST_MS);
    const looked = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', looked);
    window.addEventListener('focus', looked);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', looked);
      window.removeEventListener('focus', looked);
    };
  }, [load, pairing]);

  const onPairing = useCallback((now: boolean) => {
    setPairing(now);
    if (now) setArrived(null);
  }, []);

  return (
    <div className={table.tokens} data-testid="connected-clients-section">
      {clients === null ? null : clients.length === 0 ? (
        <p className={table.note}>{t('No clients connected with a code yet.')}</p>
      ) : (
        <div className={table.list}>
          <table className={table.table} data-testid="connected-clients">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Client')}</th>
                <th>{t('Last used')}</th>
                <th className={table.revoke}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((one) => (
                <tr key={one.id} data-testid="connected-client">
                  <td className={table.name}>{one.name}</td>
                  <td className={table.when}>{one.client}</td>
                  <td className={table.when}>{one.lastUsedAt === null ? t('never used') : timeAgo(one.lastUsedAt)}</td>
                  <td className={table.revoke}>
                    <button
                      type="button"
                      className={table.textButton}
                      aria-label={tf('Disconnect {name}', { name: one.name })}
                      onClick={() =>
                        disconnectClient(one.id).then(
                          () => load(),
                          (cause: unknown) => setError(cause instanceof Error ? cause.message : t('That did not work.')),
                        )
                      }
                    >
                      {t('Disconnect')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {arrived !== null && (
        <p className={table.note} role="status" data-testid="client-paired">
          {tf('{name} is connected.', { name: arrived })}
        </p>
      )}
      <div className={clients !== null && clients.length > 0 ? styles.after : undefined}>
        <ClientPairingButton key={round} className={buttonClassName} onPairing={onPairing} />
      </div>
      {error !== null && <p className={table.error} role="alert">{error}</p>}
    </div>
  );
}
