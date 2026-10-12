import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  LOCAL_BOX_ID,
  createBox,
  deleteBox,
  fetchBox,
  fetchBoxInfo,
  fetchBoxLabels,
  fetchBoxSessions,
  revealBoxToken,
  testBoxConnection,
  boxKindLabel,
  updateBox,
} from '../../api/boxes';
import type { Box, BoxConnectionTest, BoxInfo, BoxInput, BoxRemoteSession, BoxRuntime } from '../../api/boxes';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { BackLink } from '../../components/BackLink';
import { FieldHint } from '../../components/FieldHint';
import { RevealToggle } from '../../components/RevealToggle';
import { Loader } from '../../components/Loader';
import { duration } from '../workspace/WorkspaceWatchersPage';
import { shellUser } from '../../session/user';
import styles from './AdminBoxPage.module.css';
import { t, tf } from '../../i18n';
import { zoned } from '../../session/timeZone';

export interface AdminBoxPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** A value a box may not have said, drawn as a dash rather than as "null". */
function said(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function list(values: string[] | null | undefined): string {
  return values === null || values === undefined || values.length === 0 ? '—' : values.join(', ');
}

function yesNo(value: boolean | null): string {
  return value === null ? '—' : value ? t('Yes') : t('No');
}

/**
 * One box: registered here for the first time, or looked at and edited
 * afterwards.
 *
 * A page rather than a dialog for the reason the other admin forms are pages:
 * a box holds a token somebody pastes out of another window, and has an address
 * worth coming back to. Below the form is everything the box says about itself
 * - its version, its limits, each runtime it offers - and the sessions it holds
 * now, because "what is this box doing" is the next question after "does it
 * answer".
 *
 * The local box is the same page with less to edit: it is inside this server,
 * so it has no address or token, and its limits are installation settings
 * rather than fields here. Only its label is its own.
 */
export function AdminBoxPage({ session, onSignOut }: AdminBoxPageProps) {
  const { boxId } = useParams();
  const navigate = useNavigate();
  const adding = boxId === undefined;

  const [box, setBox] = useState<Box | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  /** What is typed in the token box. Empty keeps what is stored, unless clearing was asked for. */
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  /** Whether the token box shows what is in it. */
  const [shown, setShown] = useState(false);
  const [knownLabels, setKnownLabels] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<BoxConnectionTest | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [info, setInfo] = useState<BoxInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<BoxRemoteSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const local = box?.kind === 'LOCAL' || boxId === LOCAL_BOX_ID;

  const fill = useCallback((found: Box) => {
    setBox(found);
    setName(found.name);
    setAddress(found.address ?? '');
    setLabel(found.label ?? '');
    setToken('');
    setClearToken(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchBoxLabels()
      .then((labels) => {
        if (current) setKnownLabels(labels);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (boxId === undefined) return;
    let current = true;
    fetchBox(boxId)
      .then((found) => {
        if (!current) return;
        if (found === null) {
          setLoadError(t('That box no longer exists.'));
          return;
        }
        fill(found);
      })
      .catch((cause: unknown) => {
        if (current) setLoadError(cause instanceof Error ? cause.message : t('Could not load the box.'));
      });
    return () => {
      current = false;
    };
  }, [boxId, fill]);

  /*
   * What the box says about itself and what it holds, asked separately from
   * the box's own row: a box that cannot be reached is still a row that can be
   * edited - which is how an address gets mended - so a refusal here is drawn
   * where the details would be and nowhere else.
   */
  const loadDetails = useCallback(() => {
    if (boxId === undefined) return;
    setInfoError(null);
    setSessionsError(null);
    fetchBoxInfo(boxId)
      .then((answer) => setInfo(answer))
      .catch((cause: unknown) => {
        setInfo(null);
        setInfoError(cause instanceof Error ? cause.message : t('Could not ask the box.'));
      });
    fetchBoxSessions(boxId)
      .then((answer) => setSessions(answer))
      .catch((cause: unknown) => {
        setSessions(null);
        setSessionsError(cause instanceof Error ? cause.message : t('Could not ask the box.'));
      });
  }, [boxId]);

  useEffect(loadDetails, [loadDetails]);

  /* A box with no label is no agent's, so a label is asked for up front. */
  const complete = !local && name.trim() !== '' && address.trim() !== '' && label.trim() !== '';
  /** What is still missing, said on hover over a Save that will not press. */
  const missing = [
    name.trim() === '' ? t('Name') : null,
    address.trim() === '' ? t('Address') : null,
    label.trim() === '' ? t('Label') : null,
  ].filter((one): one is string => one !== null);

  /**
   * Shows or hides the token. A held token is fetched only when asked for, and
   * that is written to the audit log; it then sits in the box like a typed one.
   */
  async function toggleReveal() {
    if (shown) {
      setShown(false);
      return;
    }
    if (token === '' && !clearToken && box?.hasToken === true && boxId !== undefined) {
      try {
        const held = await revealBoxToken(boxId);
        if (held !== null) setToken(held);
      } catch (cause) {
        setTestError(cause instanceof Error ? cause.message : t('Could not show the token.'));
        return;
      }
    }
    setShown(true);
  }

  /** The token as a save sends it: null keeps the stored one, "" clears it. */
  function tokenSent(): string | null {
    if (clearToken) return '';
    return token === '' ? null : token;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const input: BoxInput = local
      ? { name: box?.name ?? name, label: label.trim() === '' ? null : label.trim() }
      : {
          name: name.trim(),
          label: label.trim() === '' ? null : label.trim(),
          address: address.trim(),
          token: tokenSent(),
        };

    try {
      if (boxId === undefined) {
        const created = await createBox(input);
        navigate(`/admin/boxes/${encodeURIComponent(created.id)}`);
        return;
      }
      fill(await updateBox(boxId, input));
      setSaved(true);
      loadDetails();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the box.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (testing || address.trim() === '') return;
    setTesting(true);
    setTested(null);
    setTestError(null);
    try {
      /*
       * What is in the boxes, saved or not. An empty token box on a box that
       * holds one asks the server to use the stored token, so changing only the
       * address can be tried before it is saved.
       */
      const typed = clearToken ? null : token === '' ? null : token;
      const storedFor = !adding && typed === null && !clearToken ? (boxId ?? null) : null;
      setTested(await testBoxConnection(address.trim(), typed, storedFor));
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t('Could not test the connection.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (boxId === undefined || saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBox(boxId);
      navigate('/admin/boxes');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not delete the box.'));
      setSaving(false);
    }
  }

  const called = adding ? t('Add box') : (box?.name ?? '…');

  return (
    <AppShell
      title={adding ? t('New box') : box?.name}
      user={shellUser(session)}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="boxes" />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to="/admin/boxes" label={t('Boxes')} />
          <Link className={styles.crumbLink} to="/admin/boxes">
            {t('Boxes')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{called}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{called}</h1>
          {/* Save beside the title, as on the other settings pages: the form is long and the details follow it. */}
          {/* The local box has nothing of its own to save: its label is fixed and its settings are Admin Settings. */}
          {loadError === null && !local && (adding || box !== null) && (
            <div className={styles.headerActions}>
              {/*
                The title is on a wrapper, and the disabled button lets the
                pointer through to it: a disabled control receives no mouse
                events, so a title on it - or on a parent it covers - never shows.
              */}
              <span
                className={styles.saveWrap}
                title={missing.length > 0 ? tf('Fill in: {fields}', { fields: missing.join(', ') }) : undefined}
                data-box-save-blocked={missing.length > 0 ? 'true' : undefined}
              >
                <button type="submit" form="box-form" className={styles.primaryButton} disabled={!complete || saving} data-box-save="">
                  {saving ? t('Saving…') : adding ? t('Add box') : t('Save')}
                </button>
              </span>
            </div>
          )}
        </div>
        {box !== null && (
          <p className={styles.subtitle} data-box-kind={box.kind}>
            {boxKindLabel(box.kind)}
          </p>
        )}
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
          <Link className={styles.crumbLink} to="/admin/boxes">
            {t('Back to Boxes')}
          </Link>
        </section>
      ) : !adding && box === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <form id="box-form" className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('Box')}</h2>
            <div className={styles.divider} />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="box-name">
                {t('Name')} {!local && <span className={styles.required}>*</span>}
              </label>
              <input
                id="box-name"
                name="boxName"
                className={styles.input}
                type="text"
                placeholder={t('e.g. build sandbox')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={local}
                autoFocus={adding}
                required={!local}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="box-address">
                  {t('Address')} {!local && <span className={styles.required}>*</span>}
                </label>
                <FieldHint label={t('Address')}>
                  {local
                    ? t('The local box runs inside this server, so there is nothing to reach and no token to hold.')
                    : t('Where the Orkbox answers, with its scheme - http://sandbox.internal:8090. Reached through the proxy rules under Networking like anything else this server talks to.')}
                </FieldHint>
              </span>
              {local ? (
                <input
                  id="box-address"
                  className={`${styles.input} ${styles.inputMono}`}
                  type="text"
                  value={t('In-process')}
                  data-box-address="in-process"
                  readOnly
                  disabled
                />
              ) : (
                <input
                  id="box-address"
                  name="boxAddress"
                  className={`${styles.input} ${styles.inputMono}`}
                  type="url"
                  placeholder="http://sandbox.internal:8090"
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setTested(null);
                  }}
                  required
                />
              )}
            </div>

            {!local && (
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <label className={styles.label} htmlFor="box-token">
                    {t('API token')}
                  </label>
                  <FieldHint label={t('API token')}>
                    {t('Stored encrypted; the eye shows it. Leaving the field empty keeps whatever is already stored.')}
                  </FieldHint>
                </span>
                <div className={styles.secretRow}>
                <input
                  id="box-token"
                  name="boxToken"
                  className={`${styles.input} ${styles.inputMono}`}
                  type={shown ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={box?.hasToken === true ? t('Stored; type to replace') : t('Optional')}
                  value={token}
                  data-box-token-held={box?.hasToken === true ? 'true' : 'false'}
                  onChange={(event) => {
                    setToken(event.target.value);
                    setClearToken(false);
                    setTested(null);
                  }}
                  disabled={clearToken}
                />
                <RevealToggle shown={shown} onToggle={() => void toggleReveal()} label={t('API token')} />
                </div>
                {box?.hasToken === true && (
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={clearToken}
                      onChange={(event) => {
                        setClearToken(event.target.checked);
                        if (event.target.checked) setToken('');
                      }}
                    />
                    <span>{t('Remove the stored token')}</span>
                  </label>
                )}
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="box-label">
                  {t('Label')} {!local && <span className={styles.required}>*</span>}
                </label>
                <FieldHint label={t('Label')}>
                  {t('What an agent is granted this box by. Several boxes may share a label, and an agent holding it may be given any of them.')}
                </FieldHint>
              </span>
              <input
                id="box-label"
                name="boxLabel"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                list="box-label-suggestions"
                spellCheck={false}
                placeholder={t('e.g. build')}
                value={label}
                required={!local}
                readOnly={local}
                onChange={(event) => setLabel(event.target.value)}
              />
              <datalist id="box-label-suggestions">
                {knownLabels.map((one) => (
                  <option key={one} value={one} />
                ))}
              </datalist>
            </div>

            {local && (
              <Link className={styles.settingsLink} to="/admin/settings#boxes" data-box-settings-link="">
                {t('Local box settings')}
              </Link>
            )}
          </section>

          <div className={styles.footer}>
            <div className={styles.status} data-box-test-result={tested === null ? undefined : tested.ok ? 'ok' : 'failed'}>
              {error !== null ? (
                <span className={styles.statusFailed} role="alert">
                  {error}
                </span>
              ) : testError !== null ? (
                <span className={styles.statusFailed} role="alert">
                  {testError}
                </span>
              ) : tested !== null ? (
                <>
                  <span className={`${styles.dot} ${tested.ok ? styles.dotUp : styles.dotDown}`} aria-hidden="true" />
                  <span className={tested.ok ? styles.statusOk : styles.statusFailed}>
                    {tested.ok && tested.version !== null
                      ? tf('{message} (version {version})', { message: tested.message, version: tested.version })
                      : tested.message}
                  </span>
                </>
              ) : (
                saved && <span className={styles.statusOk}>{t('Saved.')}</span>
              )}
            </div>
            <div className={styles.buttons}>
              {!local && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleTest()}
                  disabled={testing || address.trim() === ''}
                  data-box-test=""
                >
                  {testing ? t('Testing…') : t('Test connection')}
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      {!adding && box !== null && (
        <>
          <section className={styles.card} data-box-details="">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{t('Details')}</h2>
              <button type="button" className={styles.secondaryButton} onClick={loadDetails}>
                {t('Refresh')}
              </button>
            </div>
            <div className={styles.divider} />
            {infoError !== null ? (
              <p className={styles.loadError} role="alert" data-box-info-error="">
                {infoError}
              </p>
            ) : info === null ? (
              <Loader />
            ) : (
              <>
                <dl className={styles.facts}>
                  <Fact name={t('Version')} value={info.version} />
                  <Fact name={t('Service')} value={info.name} />
                  <Fact name={t('Default runtime')} value={info.defaultRuntime} />
                  <Fact name={t('Default lifetime')} value={duration(info.defaultTtlSeconds)} />
                  <Fact name={t('Longest lifetime')} value={duration(info.maxTtlSeconds)} />
                  <Fact name={t('Idle timeout')} value={duration(info.defaultIdleTimeoutSeconds)} />
                  <Fact name={t('Sessions at most')} value={String(info.maxSessions)} />
                  {info.runtimes.map((runtime) => (
                    <RuntimeFacts key={runtime.name} runtime={runtime} />
                  ))}
                </dl>
              </>
            )}
          </section>

          <section className={styles.card} data-box-sessions="">
            <h2 className={styles.cardTitle}>{t('Sessions')}</h2>
            <div className={styles.divider} />
            {sessionsError !== null ? (
              <p className={styles.loadError} role="alert">
                {sessionsError}
              </p>
            ) : sessions === null ? (
              <Loader />
            ) : sessions.length === 0 ? (
              <p className={styles.empty}>{t('No sessions.')}</p>
            ) : (
              <div className={styles.table}>
                <div className={styles.tableHead}>
                  <span className={styles.colId}>{t('Session')}</span>
                  <span className={styles.colStatus}>{t('Agent')}</span>
                  <span className={styles.colRuntime}>{t('Runtime')}</span>
                  <span className={styles.colWhen}>{t('Last activity')}</span>
                  <span className={styles.colWhen}>{t('Expires')}</span>
                  <span className={styles.colRuns}>{t('Commands')}</span>
                </div>
                {sessions.map((one) => (
                  <div key={one.id} className={styles.tableRow} data-box-session={one.id}>
                    <span className={`${styles.colId} ${styles.mono}`} title={one.labels === '{}' ? undefined : one.labels}>
                      {/* A session an agent here opened links to its conversation, with the box's log open. */}
                      {one.orknuxSessionUrl !== null ? (
                        <Link to={one.orknuxSessionUrl} className={styles.sessionLink} data-box-session-link="">
                          {one.id}
                        </Link>
                      ) : (
                        one.id
                      )}
                    </span>
                    <span className={styles.colStatus} title={one.status}>
                      <span className={`${styles.dot} ${one.active ? styles.dotUp : styles.dotIdle}`} aria-hidden="true" />{' '}
                      {one.agentName ?? (one.orknuxSessionId === null ? t('another client') : '—')}
                    </span>
                    <span className={styles.colRuntime} title={one.image ?? undefined}>
                      {one.runtime === null ? '—' : one.image === null ? one.runtime : `${one.runtime} · ${one.image}`}
                    </span>
                    <span className={styles.colWhen} title={one.lastActivityAt}>
                      {timeAgo(one.lastActivityAt)}
                    </span>
                    <span className={styles.colWhen} title={one.expiresAt ?? undefined}>
                      {one.expiresAt === null ? '—' : new Date(one.expiresAt).toLocaleString(undefined, zoned())}
                    </span>
                    <span className={styles.colRuns}>
                      {one.runningExecutions} / {one.totalExecutions}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* The local box is switched off in Admin Settings rather than removed. */}
      {!adding && loadError === null && box !== null && !local && (
        <section className={styles.dangerCard}>
          <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
          <div className={styles.divider} />
          <div className={styles.dangerRow}>
            <div className={styles.dangerText}>
              <span className={styles.dangerTitle}>{t('Delete box')}</span>
              <span className={styles.dangerNote}>
                {confirmingDelete
                  ? tf('Delete {name}? Agents holding its label lose it.', { name: box.name })
                  : t('Remove this box from the installation')}
              </span>
            </div>
            {confirmingDelete ? (
              <div className={styles.buttons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  {t('Keep')}
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => void handleDelete()}
                  disabled={saving}
                  data-box-delete-confirm=""
                >
                  {saving ? t('Deleting…') : t('Delete box')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
                data-box-delete=""
              >
                {t('Delete box')}
              </button>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Fact({ name, value }: { name: string; value: string }) {
  /* A fact the runtime does not have - an image on the local runtime, say - is left out, not drawn as a dash. */
  if (/^[—\s/]*$/.test(value)) return null;
  return (
    <div className={styles.fact}>
      <dt className={styles.factName}>{name}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}

/**
 * One runtime the box offers, as more rows of the same sheet: a Runtime row
 * saying which and whether it can run anything, then every limit it has.
 */
function RuntimeFacts({ runtime }: { runtime: BoxRuntime }) {
  return (
    <>
      <div className={styles.fact} data-box-runtime={runtime.name}>
        <dt className={styles.factName}>{t('Runtime')}</dt>
        <dd className={styles.factValue}>
          <span className={styles.runtimeValue} title={runtime.unavailableReason ?? undefined}>
            <span className={`${styles.dot} ${runtime.available ? styles.dotUp : styles.dotDown}`} aria-hidden="true" />
            {runtime.name}
            <span className={styles.runtimeState}>{runtime.available ? t('available') : said(runtime.unavailableReason)}</span>
          </span>
        </dd>
      </div>
      <Fact name={t('Operating system')} value={runtime.os} />
      <Fact name={t('Working directory')} value={said(runtime.workdir)} />
      <Fact name={t('Shell')} value={runtime.shell.join(' ')} />
      <Fact name={t('Default image')} value={said(runtime.defaultImage)} />
      <Fact name={t('Images')} value={list(runtime.images)} />
      <Fact name={t('Network modes')} value={list(runtime.networkModes)} />
      <Fact name={t('Caches')} value={list(runtime.caches)} />
      <Fact name={t('CPUs, default / most')} value={`${said(runtime.defaultCpus)} / ${said(runtime.maxCpus)}`} />
      <Fact name={t('Memory MB, default / most')} value={`${said(runtime.defaultMemoryMb)} / ${said(runtime.maxMemoryMb)}`} />
      <Fact name={t('Disk limit enforced')} value={yesNo(runtime.diskLimitEnforced)} />
    </>
  );
}
