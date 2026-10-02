import { useEffect, useState } from 'react';

import {
  clearLogLevel,
  fetchLogLevels,
  resetLogLevels,
  ROOT_LOGGER,
  setLogFollowSeconds,
  setLogLevel,
  setLogRootRevertMinutes,
} from '../../api/logLevels';
import type { LoggerLevel, LogLevels } from '../../api/logLevels';
import trashIcon from '../../assets/trash-2.svg';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import styles from './LogLevelsSection.module.css';

/** A write the page's one Save sends, alongside its own numbers. */
export type PendingWrite = () => Promise<void>;

export interface LogLevelsSectionProps {
  /** Told which of this section's numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
}

/**
 * Admin -> Settings -> Logging. Issue #591.
 *
 * A level is a switch, not a number: it applies the moment it is chosen, on
 * every server, the way the toggles on this page do. The two numbers under it
 * go out with the page's Save like every other number here.
 */
export function LogLevelsSection({ onPending }: LogLevelsSectionProps) {
  const [levels, setLevels] = useState<LogLevels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');
  const [addLevel, setAddLevel] = useState('DEBUG');
  const [confirming, setConfirming] = useState(false);
  /** The two numbers as typed: a half-typed number is not a setting. */
  const [revertMinutes, setRevertMinutes] = useState('');
  const [followSeconds, setFollowSeconds] = useState('');

  function hold(answer: LogLevels) {
    setLevels(answer);
    setRevertMinutes(String(answer.rootRevertMinutes));
    setFollowSeconds(String(answer.followSeconds));
  }

  useEffect(() => {
    let abandoned = false;
    fetchLogLevels()
      .then((answer) => {
        if (!abandoned) hold(answer);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the log levels.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    if (levels === null) {
      onPending([]);
      return;
    }
    const writes: PendingWrite[] = [];
    const minutes = revertMinutes.trim();
    if (minutes !== '' && Number(minutes) !== levels.rootRevertMinutes) {
      writes.push(async () => hold(await setLogRootRevertMinutes(Number(minutes))));
    }
    const seconds = followSeconds.trim();
    if (seconds !== '' && Number(seconds) !== levels.followSeconds) {
      writes.push(async () => hold(await setLogFollowSeconds(Number(seconds))));
    }
    onPending(writes);
  }, [levels, revertMinutes, followSeconds, onPending]);

  async function apply(change: () => Promise<LogLevels>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      hold(await change());
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function choose(logger: LoggerLevel, level: string) {
    void apply(() => (level === '' ? clearLogLevel(logger.name) : setLogLevel(logger.name, level)));
  }

  async function add() {
    const name = adding.trim();
    if (name === '') return;
    if (await apply(() => setLogLevel(name, addLevel))) setAdding('');
  }

  const root = levels?.loggers.find((logger) => logger.name === ROOT_LOGGER) ?? null;
  const others = levels?.loggers.filter((logger) => logger.name !== ROOT_LOGGER) ?? [];

  return (
    <>
      <h2 id="logging" className={page.sectionHeading}>
        <span className={page.headingWithHint}>
          {t('Logging')}
          <FieldHint label={t('Logging')}>
            {t('A level applies at once on every server and is kept across restarts. Choosing the configured level hands a logger back to the configuration file, where ORKNUX_LOG_LEVEL_ROOT and ORKNUX_LOG_LEVEL set the defaults.')}
          </FieldHint>
        </span>
      </h2>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {root !== null && levels !== null && (
        <div className={page.setting} data-logger={ROOT_LOGGER}>
          <div className={page.settingText}>
            <span className={page.labelWithHint}>
              <p className={page.settingLabel}>{t('Root level')}</p>
              <FieldHint label={t('Root level')}>
                {t('Below INFO, the root goes back to its configured level on its own once the time limit below has passed, so a forgotten DEBUG does not fill a disk.')}
              </FieldHint>
            </span>
            {root.revertsAt !== null && (
              <p className={styles.reverts}>
                {tf('Goes back to {level} at {time}.', {
                  level: root.defaultLevel ?? 'INFO',
                  time: new Date(root.revertsAt).toLocaleTimeString(),
                })}
              </p>
            )}
          </div>
          <div className={styles.controls}>
            <LevelSelect
              id="log-level-root"
              logger={root}
              levels={levels.levels.filter((level) => level !== 'INHERIT')}
              disabled={busy}
              onChoose={(level) => choose(root, level)}
            />
            <span className={styles.effective}>{root.effectiveLevel}</span>
            <span className={styles.removeSpace} aria-hidden />
          </div>
        </div>
      )}

      {levels !== null &&
        others.map((logger) => (
          <div key={logger.name} className={page.setting} data-logger={logger.name}>
            <div className={page.settingText}>
              <p className={styles.loggerName}>{logger.name}</p>
            </div>
            <div className={styles.controls}>
              <LevelSelect
                logger={logger}
                levels={levels.levels}
                disabled={busy}
                onChoose={(level) => choose(logger, level)}
              />
              <span className={styles.effective}>{logger.effectiveLevel}</span>
              {/* The configuration's own loggers cannot leave the list; they go back to it instead. */}
              {logger.defaultLevel !== null && <span className={styles.removeSpace} aria-hidden />}
              {logger.defaultLevel === null && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => choose(logger, '')}
                  disabled={busy}
                  aria-label={tf('Remove the logger {name}', { name: logger.name })}
                >
                  <img src={trashIcon} alt="" width={16} height={16} />
                </button>
              )}
            </div>
          </div>
        ))}

      {levels !== null && (
        <div className={page.setting}>
          <div className={styles.addRow}>
            <input
              id="log-logger-name"
              className={styles.nameInput}
              list="log-logger-suggestions"
              value={adding}
              placeholder="org.hibernate.SQL"
              maxLength={100}
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void add();
              }}
              disabled={busy}
              aria-label={t('Logger name')}
            />
            <datalist id="log-logger-suggestions">
              {levels.suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <select
              id="log-logger-level"
              className={styles.select}
              value={addLevel}
              onChange={(event) => setAddLevel(event.target.value)}
              disabled={busy}
              aria-label={t('Level for the new logger')}
            >
              {levels.levels.map((level) => (
                <option key={level} value={level}>
                  {level === 'INHERIT' ? t('Inherit') : level}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void add()}
              disabled={busy || adding.trim() === ''}
            >
              {t('Add logger')}
            </button>
          </div>
        </div>
      )}

      {levels !== null && (
        <>
          <div className={page.setting}>
            <div className={page.settingText}>
              <span className={page.labelWithHint}>
                <p className={page.settingLabel}>{t('How long the root may stay below INFO')}</p>
                <FieldHint label={t('How long the root may stay below INFO')}>
                  {t('After this many minutes a root set to DEBUG or TRACE goes back to its configured level.')}
                </FieldHint>
              </span>
            </div>
            <div className={page.retention}>
              <input
                id="log-root-revert-minutes"
                className={page.input}
                type="number"
                min={1}
                max={1440}
                value={revertMinutes}
                onChange={(event) => setRevertMinutes(event.target.value)}
                disabled={busy}
                aria-label={t('How long the root may stay below INFO')}
              />
              <span className={page.retentionUnit}>{t('minutes')}</span>
            </div>
          </div>
          <div className={page.setting}>
            <div className={page.settingText}>
              <span className={page.labelWithHint}>
                <p className={page.settingLabel}>{t('How often servers re-read the levels')}</p>
                <FieldHint label={t('How often servers re-read the levels')}>
                  {t('How quickly the other replicas follow a level chosen here.')}
                </FieldHint>
              </span>
            </div>
            <div className={page.retention}>
              <input
                id="log-follow-seconds"
                className={page.input}
                type="number"
                min={5}
                max={3600}
                value={followSeconds}
                onChange={(event) => setFollowSeconds(event.target.value)}
                disabled={busy}
                aria-label={t('How often servers re-read the levels')}
              />
              <span className={page.retentionUnit}>{t('seconds')}</span>
            </div>
          </div>
          <div className={page.setting}>
            <div className={page.settingText}>
              <p className={page.settingLabel}>{t('Every level back to the configuration')}</p>
            </div>
            <button
              type="button"
              id="log-levels-reset"
              className={styles.secondaryButton}
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              {t('Reset to defaults')}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        subject={confirming ? t('Logging') : null}
        kind="resetLogLevels"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          hold(await resetLogLevels());
          setConfirming(false);
        }}
      />
    </>
  );
}

/** A logger's level: what was chosen here, or the configuration's, which is the empty value. */
function LevelSelect({
  id,
  logger,
  levels,
  disabled,
  onChoose,
}: {
  id?: string;
  logger: LoggerLevel;
  levels: string[];
  disabled: boolean;
  onChoose: (level: string) => void;
}) {
  return (
    <select
      id={id}
      className={styles.select}
      value={logger.level ?? ''}
      onChange={(event) => onChoose(event.target.value)}
      disabled={disabled}
      aria-label={tf('Level of {name}', { name: logger.name })}
    >
      <option value="">{tf('As configured ({level})', { level: logger.defaultLevel ?? t('Inherit') })}</option>
      {levels.map((level) => (
        <option key={level} value={level}>
          {level === 'INHERIT' ? t('Inherit') : level}
        </option>
      ))}
    </select>
  );
}
