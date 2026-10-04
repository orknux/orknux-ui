import { useEffect, useState } from 'react';
import { createUserToken, deleteUserToken, fetchMyTokens, fetchUserTokens } from '../api/users';
import type { UserToken } from '../api/users';
import { timeAgo } from '../api/tools';
import { t, tf } from '../i18n';
import { CopyButton } from './CopyButton';
import styles from './AccessTokens.module.css';

export interface AccessTokensProps {
  /**
   * Whose tokens: a user's id, from the admin user page, or absent for the
   * person signed in, from Preferences. Issue #2.
   */
  userId?: string;
  /** The page's own text box and button, so the row looks like the rest of its card. */
  inputClassName: string;
  buttonClassName: string;
}

/**
 * Access tokens - listed with when each was last used, made with a name, and
 * revoked - for one user. Shared by Admin -> Users and Preferences, so the two
 * cannot drift into two sets of rules; the server applies the same ones to
 * both, with the signed-in person allowed only their own. Issue #2.
 *
 * The secret is on screen once, beside a copy button, and nowhere ever again.
 */
export function AccessTokens({ userId, inputClassName, buttonClassName }: AccessTokensProps) {
  const [tokens, setTokens] = useState<UserToken[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown once, and then never again by anybody. */
  const [minted, setMinted] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    (userId === undefined ? fetchMyTokens() : fetchUserTokens(userId))
      .then((found) => {
        if (current) setTokens(found);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setTokens([]);
        setError(cause instanceof Error ? cause.message : t('Could not load the tokens.'));
      });
    return () => {
      current = false;
    };
  }, [userId]);

  async function mint() {
    if (busy || name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const made = await createUserToken(name.trim(), userId);
      setTokens((held) => [...(held ?? []), made.token]);
      setMinted(made.secret);
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not make the token.'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: UserToken) {
    setError(null);
    try {
      await deleteUserToken(token.id);
      setTokens((held) => (held ?? []).filter((one) => one.id !== token.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not revoke the token.'));
    }
  }

  return (
    <div className={styles.tokens} data-testid="access-tokens">
      {tokens === null ? null : tokens.length === 0 ? (
        <p className={styles.note}>{t('No tokens yet.')}</p>
      ) : (
        <div className={styles.list}>
          {tokens.map((token) => (
            <div key={token.id} className={styles.token} data-testid="access-token">
              <span className={styles.name}>{token.name}</span>
              <span className={styles.when}>
                {token.lastUsedAt === null ? t('never used') : tf('used {when}', { when: timeAgo(token.lastUsedAt) })}
              </span>
              <button
                type="button"
                className={styles.textButton}
                aria-label={tf('Revoke {name}', { name: token.name })}
                onClick={() => void revoke(token)}
              >{t('Revoke')}</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.row}>
        <input
          className={inputClassName}
          type="text"
          value={name}
          placeholder={t('What is it for?')}
          aria-label={t('Token name')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void mint();
          }}
        />
        <button
          type="button"
          className={buttonClassName}
          onClick={() => void mint()}
          disabled={busy || name.trim() === ''}
        >{t('Generate Token')}</button>
      </div>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* The one time it is ever on screen. */}
      {minted !== null && (
        <div className={styles.secret} data-testid="token-secret">
          <p className={styles.secretHead}>{t('Copy it now - it is not shown again.')}</p>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{minted}</code>
            <CopyButton text={minted} label={t('Copy the token')} testId="token-copy" />
          </div>
        </div>
      )}
    </div>
  );
}
