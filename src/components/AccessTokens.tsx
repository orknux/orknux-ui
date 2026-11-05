import { useEffect, useState } from 'react';
import { createUserToken,
  fetchMcpTools, deleteUserToken, fetchMyTokens, fetchUserTokens } from '../api/users';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import closeIcon from '../assets/x.svg';
import type { McpTool, UserToken } from '../api/users';
import { fetchWorkspaces } from '../api/workspaces';
import { timeAgo } from '../api/tools';
import { t, tf } from '../i18n';
import { CopyButton } from './CopyButton';
import styles from './AccessTokens.module.css';
import { Select } from './Select';

/** How the catalogue names an entry that stands for every tool of one MCP server; see McpLentTools.catalog. */
const SERVER_SUFFIX = '__*';

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
  /**
   * What the next token may do: read and write, read, or Custom - chosen MCP
   * tools and no others. Asked here because it cannot be changed once made.
   */
  const [mode, setMode] = useState<'write' | 'read' | 'custom'>('write');
  /** Custom: every MCP tool there is, and which are ticked. */
  const [catalog, setCatalog] = useState<McpTool[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Custom: what the tool list is narrowed to, by name or by what a tool does. */
  const [toolSearch, setToolSearch] = useState('');
  useEffect(() => {
    if (mode !== 'custom' || catalog !== null) return;
    fetchMcpTools()
      .then((found) => {
        setCatalog(found);
        // Starts as Read-only would: every tool that reads, none that writes.
        setPicked(new Set(found.filter((one) => one.readOnly).map((one) => one.name)));
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the tools.')));
  }, [mode, catalog]);
  /**
   * Custom: whether it reaches every workspace its owner sees or only the ones
   * ticked. Every one is the default, as a token always was; Only these is a
   * list held by the server, so a workspace made later is not reached.
   */
  const [reach, setReach] = useState<'all' | 'some'>('all');
  const [places, setPlaces] = useState<{ id: string; name: string }[] | null>(null);
  const [placesPicked, setPlacesPicked] = useState<Set<string>>(new Set());
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

  const wantsPlaces = mode === 'custom' || (tokens ?? []).some((one) => one.workspaces !== null);
  useEffect(() => {
    if (!wantsPlaces || places !== null) return;
    fetchWorkspaces(0, 500)
      .then((found) => setPlaces(found.content.map((one) => ({ id: one.id, name: one.name }))))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the workspaces.')));
  }, [wantsPlaces, places]);

  /** What the next token cannot be made without, for Custom. */
  const customIncomplete = mode === 'custom' && (picked.size === 0 || (reach === 'some' && placesPicked.size === 0));

  /** A token's workspaces by name where they are known, by id where not. */
  const placeNames = (ids: string[]) => ids.map((id) => places?.find((one) => one.id === id)?.name ?? `#${id}`);

  async function mint() {
    if (busy || name.trim() === '' || customIncomplete) return;
    setBusy(true);
    setError(null);
    try {
      const made = await createUserToken(
        name.trim(),
        userId,
        mode === 'read',
        mode === 'custom' ? [...picked] : undefined,
        mode === 'custom' && reach === 'some' ? [...placesPicked] : undefined,
      );
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
          {/* A table: what each token is called, what it may do, and when it was made and last used. */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Access')}</th>
                <th>{t('Created')}</th>
                <th>{t('Last used')}</th>
                <th className={styles.revoke}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id} data-testid="access-token">
                  <td className={styles.name}>{token.name}</td>
                  <td>
                    <span
                      className={token.readOnly || token.tools !== null ? `${styles.access} ${styles.accessRead}` : styles.access}
                      data-token-access={token.tools !== null ? 'custom' : token.readOnly ? 'read' : 'write'}
                      title={token.tools !== null ? token.tools.join(', ') : undefined}
                    >
                      {token.tools !== null
                        ? tf('Custom: {count} tools', { count: String(token.tools.length) })
                        : token.readOnly ? t('Read-only') : t('Read and write')}
                    </span>
                    {(token.tools ?? []).some((one) => one.endsWith(SERVER_SUFFIX)) && (
                      <strong
                        className={styles.serverBadge}
                        data-token-servers=""
                        title={(token.tools ?? []).filter((one) => one.endsWith(SERVER_SUFFIX)).map((one) => one.slice(0, -SERVER_SUFFIX.length)).join(', ')}
                      >
                        {t('Whole MCP server')}
                      </strong>
                    )}
                    {token.workspaces !== null && (
                      <span
                        className={`${styles.access} ${styles.accessRead} ${styles.accessPlaces}`}
                        data-token-workspaces={token.workspaces.length}
                        title={placeNames(token.workspaces).join(', ')}
                      >
                        {token.workspaces.length === 1
                          ? placeNames(token.workspaces)[0]
                          : tf('{count} workspaces', { count: String(token.workspaces.length) })}
                      </span>
                    )}
                  </td>
                  <td className={styles.when}>{timeAgo(token.createdAt)}</td>
                  <td className={styles.when}>{token.lastUsedAt === null ? t('never used') : timeAgo(token.lastUsedAt)}</td>
                  <td className={styles.revoke}>
                    <button
                      type="button"
                      className={styles.textButton}
                      aria-label={tf('Revoke {name}', { name: token.name })}
                      onClick={() => void revoke(token)}
                    >{t('Revoke')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {/*
          Drawn as the page's own inputs are, with the chevron every select in
          the app carries: the browser's bare select read as a label or a
          button, nothing saying it opened.
        */}
        <span className={styles.accessWrap}>
          <Select
            className={`${inputClassName} ${styles.accessPicker}`}
            value={mode}
            aria-label={t('What the token may do')}
            data-testid="token-access"
            onChange={(chosen) => setMode(chosen === 'read' ? 'read' : chosen === 'custom' ? 'custom' : 'write')}
            chevron={false}
          >
            <option value="write">{t('Read and write')}</option>
            <option value="read">{t('Read-only')}</option>
            <option value="custom">{t('Custom')}</option>
          </Select>
          <img className={styles.accessChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
        </span>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => void mint()}
          disabled={busy || name.trim() === '' || customIncomplete}
        >{t('Generate Token')}</button>
      </div>

      {/*
        Custom: the MCP tools this token may call, the ones that read apart
        from the ones that change something. Outside MCP it is held to reading.
      */}
      {mode === 'custom' && (
        <div className={styles.custom} data-testid="token-custom">
          {/*
            Which workspaces it reaches: every one its owner sees, or only the
            ticked ones. Held to some, it administers no installation, so an
            administrator's token cannot reach the rest through Admin either.
          */}
          <fieldset className={styles.customGroup} data-testid="token-workspaces">
            <legend className={styles.customHead}>
              <span className={styles.customAll}>{t('Workspaces')}</span>
            </legend>
            <div className={styles.reach}>
              <label className={styles.customAll}>
                <input type="radio" name="token-reach" checked={reach === 'all'} onChange={() => setReach('all')} data-testid="token-reach-all" />
                {t('Every workspace you can see')}
              </label>
              <label className={styles.customAll}>
                <input type="radio" name="token-reach" checked={reach === 'some'} onChange={() => setReach('some')} data-testid="token-reach-some" />
                {t('Only these')}
                {reach === 'some' && places !== null && (
                  <span className={styles.customCount}>{`${placesPicked.size} / ${places.length}`}</span>
                )}
              </label>
            </div>
            {reach === 'some' && (places === null ? (
              <p className={styles.note}>{t('Loading…')}</p>
            ) : (
              <div className={styles.customList}>
                {places.map((one) => (
                  <label key={one.id} className={styles.customTool}>
                    <input
                      type="checkbox"
                      checked={placesPicked.has(one.id)}
                      onChange={() =>
                        setPlacesPicked((held) => {
                          const next = new Set(held);
                          if (next.has(one.id)) next.delete(one.id);
                          else next.add(one.id);
                          return next;
                        })
                      }
                      data-testid={`token-workspace-${one.id}`}
                    />
                    <span className={styles.placeName}>{one.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          <p className={styles.note}>
            {t('The MCP tools this token may call, and no others. Through the API it may only read.')}
          </p>
          {/* Two hundred tools and more: found by a word of their name or of what they do. */}
          <input
            className={`${inputClassName ?? ''} ${styles.customSearch}`}
            type="search"
            value={toolSearch}
            placeholder={t('Search the tools')}
            aria-label={t('Search the tools')}
            onChange={(event) => setToolSearch(event.target.value)}
            data-testid="token-tool-search"
          />
          {catalog === null ? (
            <p className={styles.note}>{t('Loading…')}</p>
          ) : (
            ([['read', t('Reading')], ['write', t('Changing')]] as const).map(([kind, heading]) => {
              const said = toolSearch.trim().toLowerCase();
              const whole = catalog.filter((one) => (kind === 'read') === one.readOnly);
              // What is shown is what the box ticks: a search narrows the select-all too.
              const group = said === '' ? whole : whole.filter((one) => one.name.toLowerCase().includes(said) || one.summary.toLowerCase().includes(said));
              if (said !== '' && group.length === 0) return null;
              const all = group.length > 0 && group.every((one) => picked.has(one.name));
              return (
                <fieldset key={kind} className={styles.customGroup} data-testid={`token-custom-${kind}`}>
                  <legend className={styles.customHead}>
                    <label className={styles.customAll}>
                      <input
                        type="checkbox"
                        checked={all}
                        onChange={() =>
                          setPicked((held) => {
                            const next = new Set(held);
                            group.forEach((one) => (all ? next.delete(one.name) : next.add(one.name)));
                            return next;
                          })
                        }
                      />
                      {heading} <span className={styles.customCount}>{`${whole.filter((one) => picked.has(one.name)).length} / ${whole.length}`}</span>
                    </label>
                  </legend>
                  <div className={styles.customList}>
                    {group.map((one) => (
                      <label
                        key={one.name}
                        className={one.name.endsWith(SERVER_SUFFIX) ? `${styles.customTool} ${styles.customServer}` : styles.customTool}
                        title={one.summary}
                        data-mcp-server={one.name.endsWith(SERVER_SUFFIX) ? '' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(one.name)}
                          onChange={() =>
                            setPicked((held) => {
                              const next = new Set(held);
                              if (next.has(one.name)) next.delete(one.name);
                              else next.add(one.name);
                              return next;
                            })
                          }
                          data-testid={`token-tool-${one.name}`}
                        />
                        <span className={styles.customName}>
                          {one.name}
                          {/*
                            Not one tool but a whole other MCP server: every tool it
                            offers now, and every one it adds later, is this token's.
                          */}
                          {one.name.endsWith(SERVER_SUFFIX) && (
                            <strong className={styles.serverBadge}>{t('Whole MCP server')}</strong>
                          )}
                        </span>
                        <span className={styles.customSummary}>{one.summary}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })
          )}
        </div>
      )}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* The one time it is ever on screen. */}
      {minted !== null && (
        <div className={styles.secret} data-testid="token-secret">
          <div className={styles.secretTop}>
            <p className={styles.secretHead}>{t('Copy it now - it is not shown again.')}</p>
            {/* Closed once copied; the secret is gone from the page with it, as the notice says. */}
            <button
              type="button"
              className={styles.secretClose}
              aria-label={t('Dismiss')}
              title={t('Dismiss')}
              data-testid="token-dismiss"
              onClick={() => setMinted(null)}
            >
              <img src={closeIcon} alt="" width={14} height={14} />
            </button>
          </div>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{minted}</code>
            <CopyButton text={minted} label={t('Copy the token')} testId="token-copy" />
          </div>
        </div>
      )}
    </div>
  );
}
