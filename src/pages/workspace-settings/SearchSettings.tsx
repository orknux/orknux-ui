import { useEffect, useState } from 'react';
import { fetchWorkspaceSearch, saveWorkspaceSearch, type WorkspaceSearch } from '../../api/search';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import styles from './SearchSettings.module.css';

/**
 * What this workspace searches the web with. Issue #510.
 *
 * Its own section rather than a row in the general form, because it is two
 * decisions that belong together - which index, and the key for it - and
 * neither means anything without the other. A key with no engine is unused and
 * an engine with no key is a tool that refuses every call.
 *
 * **The key is write-only.** The server answers whether one is set and never
 * what it is, so this shows a filled box that stands for "there is a key here"
 * and offers to replace it. Anything else would mean the value travelling back
 * to a browser to be redrawn, which is the thing encrypting the column was for.
 */
export function SearchSettings({ workspaceId }: { workspaceId: string }) {
  const [held, setHeld] = useState<WorkspaceSearch | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** The key being typed, or null when nobody is replacing it. */
  const [typing, setTyping] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchWorkspaceSearch(workspaceId)
      .then((answer) => { if (live) setHeld(answer); })
      .catch((cause: unknown) => {
        if (live) setFailure(cause instanceof Error ? cause.message : t('The search settings could not be read.'));
      });
    return () => { live = false; };
  }, [workspaceId]);

  async function save(changes: { engine?: string; apiKey?: string; composeAnswer?: boolean }) {
    setSaving(true);
    setFailure(null);
    setSaved(false);
    try {
      setHeld(await saveWorkspaceSearch(workspaceId, changes));
      setTyping(null);
      setSaved(true);
    } catch (cause: unknown) {
      setFailure(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  if (held === null) {
    return (
      <section className={styles.card}>
        <h2 className={styles.heading}>{t('Search')}</h2>
        <p className={styles.note}>{failure ?? t('Reading…')}</p>
      </section>
    );
  }

  const chosen = held.engines.find((one) => one.name === held.engine);

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>
        {t('Search')}
        <FieldHint label={t('Search')}>
          {t('What this workspace searches the web with. An agent given the search tools uses this key, and the bill goes to whoever set it.')}
        </FieldHint>
      </h2>

      <div className={styles.field}>
        {/* What each index is for sits behind the (?), not under the box: a
            paragraph under a field is prose nobody reads twice. */}
        <span className={styles.labelRow}>
          <label className={styles.label} htmlFor="search-engine">{t('Engine')}</label>
          {chosen !== undefined && <FieldHint label={t('Engine')}>{chosen.description}</FieldHint>}
        </span>
        <select
          id="search-engine"
          className={styles.select}
          value={held.engine}
          disabled={saving}
          onChange={(event) => void save({ engine: event.target.value })}
        >
          {held.engines.map((one) => (
            <option key={one.name} value={one.name}>{one.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.labelRow}>
          <label className={styles.label} htmlFor="search-key">{t('API key')}</label>
          <FieldHint label={t('API key')}>
            {t('Kept encrypted and never shown again. The server makes the call, so the key never reaches a model.')}
          </FieldHint>
        </span>
        {held.keySet && typing === null ? (
          <div className={styles.set}>
            {/*
              What is here rather than what it is. The value never comes back
              from the server, so there is nothing to draw and nothing that
              could be copied out of this page.
            */}
            <span className={styles.setMark}>{t('A key is set')}</span>
            <button
              type="button"
              className={styles.secondary}
              disabled={saving}
              onClick={() => setTyping('')}
            >{t('Replace')}</button>
            <button
              type="button"
              className={styles.secondary}
              disabled={saving}
              onClick={() => void save({ apiKey: '' })}
            >{t('Remove')}</button>
          </div>
        ) : (
          <div className={styles.set}>
            <input
              id="search-key"
              className={styles.input}
              type="password"
              autoComplete="off"
              value={typing ?? ''}
              placeholder={t('Paste the key')}
              disabled={saving}
              onChange={(event) => setTyping(event.target.value)}
            />
            <button
              type="button"
              className={styles.secondary}
              disabled={saving || (typing ?? '').trim() === ''}
              onClick={() => void save({ apiKey: typing ?? '' })}
            >{t('Save key')}</button>
            {held.keySet && (
              <button
                type="button"
                className={styles.secondary}
                disabled={saving}
                onClick={() => setTyping(null)}
              >{t('Cancel')}</button>
            )}
          </div>
        )}
      </div>

      {/* Only tavily composes one, so the switch is only drawn where it means something. */}
      {held.engine === 'tavily' && (
        <div className={`${styles.field} ${styles.labelRow}`}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={held.composeAnswer}
              disabled={saving}
              onChange={(event) => void save({ composeAnswer: event.target.checked })}
            />
            {t('Also compose a short answer over the results')}
          </label>
          <FieldHint label={t('Also compose a short answer over the results')}>
            {t('Costs more than a plain search.')}
          </FieldHint>
        </div>
      )}

      {failure !== null && <p className={styles.error} role="alert">{failure}</p>}
      {saved && failure === null && <p className={`${styles.note} ${styles.saved}`}>{t('Saved.')}</p>}
    </section>
  );
}
