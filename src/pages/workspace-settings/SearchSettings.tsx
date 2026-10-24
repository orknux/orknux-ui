import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchWorkspaceSearch,
  revealWorkspaceSearchKey,
  saveWorkspaceSearch,
  type WorkspaceSearch,
} from '../../api/search';
import { FieldHint } from '../../components/FieldHint';
import { SecretField, useSecretField } from '../../components/SecretField';
import type { SecretFieldHandle, SecretSource } from '../../components/SecretField';
import { t } from '../../i18n';
import { useWorkspaceVariables } from '../workspace/workspaceVariables';
import styles from './SearchSettings.module.css';
import { Select } from '../../components/Select';

/**
 * The search section's draft: what is on screen, whether it differs from what
 * the server holds, and how to write it.
 *
 * Held by the page rather than by the section, because the section has no Save
 * of its own. It used to - an engine saved the moment it was picked and a key
 * behind a "Save key" button - which made it the one part of a settings page
 * that did not wait for Save Changes, and left anybody looking at the page
 * unable to tell which of their changes had been kept. Now the page's strip
 * writes it with everything else, and Discard puts it back.
 */
export interface SearchSettingsHandle {
  /** What the server holds; null until it has answered. */
  held: WorkspaceSearch | null;
  /** The section's own trouble - reading it, revealing the key - said inside it. */
  failure: string | null;
  engine: string;
  composeAnswer: boolean;
  key: SecretFieldHandle;
  /** The workspace's secrets, for the key's Reference tab. */
  options: { value: string; label: string; hint: string }[];
  /** Whether anything differs from what was loaded or last saved. */
  dirty: boolean;
  setEngine: (next: string) => void;
  setComposeAnswer: (next: boolean) => void;
  /** The key field was used: typed in, pointed, or switched between its two sources. */
  keyEdited: () => void;
  chooseSource: (next: SecretSource) => void;
  /** Writes what changed; throws the server's refusal for the page to show at its button. */
  save: () => Promise<void>;
  /** Back to what the server holds. */
  discard: () => void;
  /** Fetches the stored key into the field, behind its Show. */
  reveal: () => Promise<void>;
}

/**
 * The search section's state, for the page that draws it.
 *
 * `onChange` is called on every edit, which is how a page that keeps its own
 * list of what was touched hears about this one.
 */
export function useSearchSettings(workspaceId: string, onChange?: () => void): SearchSettingsHandle {
  const [held, setHeld] = useState<WorkspaceSearch | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [engine, setEngineDraft] = useState('');
  const [composeAnswer, setComposeDraft] = useState(false);
  const [dirty, setDirty] = useState(false);
  /** Only a key somebody touched is sent: an untouched field leaves the stored one alone. */
  const [keyTouched, setKeyTouched] = useState(false);
  const key = useSecretField({ stored: false });
  const keyNow = useRef(key);
  keyNow.current = key;
  const { variables, refresh: refreshVariables } = useWorkspaceVariables(workspaceId);

  function apply(found: WorkspaceSearch) {
    setHeld(found);
    setEngineDraft(found.engine);
    setComposeDraft(found.composeAnswer);
    keyNow.current.reset({ stored: found.keySet, variable: found.apiKeyVariableId });
    setDirty(false);
    setKeyTouched(false);
  }

  useEffect(() => {
    // An answer for a workspace this page has since left is dropped, not applied.
    let live = true;
    fetchWorkspaceSearch(workspaceId)
      .then((answer) => { if (live) apply(answer); })
      .catch((cause: unknown) => {
        if (live) setFailure(cause instanceof Error ? cause.message : t('The search settings could not be read.'));
      });
    return () => { live = false; };
    // apply reads the field through a ref, so the workspace is the only thing this waits on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function edited() {
    setDirty(true);
    setFailure(null);
    onChange?.();
  }

  /*
   * Only secrets: a value is read with the variable listing, so the server
   * refuses one as a credential and offering it would only teach that by a
   * failed save. The one already read stays in the list while the list loads.
   */
  const options = useMemo(() => {
    const secrets = variables
      .filter((variable) => variable.kind === 'SECRET')
      .map((variable) => ({ value: variable.id, label: variable.name, hint: variable.catalogName }));
    const reading = held?.apiKeyVariableId ?? null;
    const called = held?.apiKeyVariableName ?? null;
    if (reading === null || called === null || secrets.some((option) => option.value === reading)) return secrets;
    return [{ value: reading, label: called, hint: held?.apiKeyVariableCatalog ?? '' }, ...secrets];
  }, [variables, held]);

  return {
    held,
    failure,
    engine,
    composeAnswer,
    key,
    options,
    dirty,
    setEngine(next) {
      setEngineDraft(next);
      edited();
    },
    setComposeAnswer(next) {
      setComposeDraft(next);
      edited();
    },
    keyEdited() {
      setKeyTouched(true);
      edited();
    },
    chooseSource(next) {
      key.choose(next);
      // Somebody about to point at a secret has often just been to Variables to make it.
      if (next === 'VARIABLE') refreshVariables();
      setKeyTouched(true);
      edited();
    },
    async save() {
      if (!dirty || held === null) return;
      if (keyTouched && key.unchosen) throw new Error(t('Choose the workspace secret the search key is read from.'));
      const sending = keyTouched ? key.sending : null;
      apply(
        await saveWorkspaceSearch(workspaceId, {
          ...(engine !== held.engine ? { engine } : {}),
          ...(composeAnswer !== held.composeAnswer ? { composeAnswer } : {}),
          ...(sending === null
            ? {}
            : 'variable' in sending
              ? { apiKeyVariableId: sending.variable }
              : { apiKey: sending.value }),
        }),
      );
    },
    discard() {
      if (held !== null) apply(held);
      setFailure(null);
    },
    async reveal() {
      try {
        key.show((await revealWorkspaceSearchKey(workspaceId)) ?? '');
      } catch (cause: unknown) {
        setFailure(cause instanceof Error ? cause.message : t('Could not reveal the credentials.'));
      }
    },
  };
}

/**
 * What this workspace searches the web with. Issue #510.
 *
 * Its own section rather than a row in the general form, because it is two
 * decisions that belong together - which index, and the key for it - and
 * neither means anything without the other. A key with no engine is unused and
 * an engine with no key is a tool that refuses every call.
 *
 * **The key is a secret field like every other**: masked when stored, shown on
 * request through the same recorded reveal a connection's credentials use, and
 * either its own copy or a workspace secret it reads. Nothing here saves: the
 * page's Save Changes writes it, through the handle the page holds.
 */
export function SearchSettings({ search, workspaceId }: { search: SearchSettingsHandle; workspaceId: string }) {
  const { held } = search;

  if (held === null) {
    return (
      <section className={styles.card}>
        <h2 id="search" className={styles.heading}>{t('Search')}</h2>
        <p className={styles.note}>{search.failure ?? t('Reading…')}</p>
      </section>
    );
  }

  const chosen = held.engines.find((one) => one.name === search.engine);

  return (
    <section className={styles.card}>
      <h2 id="search" className={styles.heading}>
        {t('Search')}
        <FieldHint label={t('Search')}>
          {t('What this workspace searches the web with. An agent given the search tools uses this key, and the bill goes to whoever set it.')}
        </FieldHint>
      </h2>

      <div className={styles.field}>
        {/* What each index is for sits behind the (?), not under the box. */}
        <span className={styles.labelRow}>
          <label className={styles.label} htmlFor="search-engine">{t('Engine')}</label>
          {chosen !== undefined && <FieldHint label={t('Engine')}>{chosen.description}</FieldHint>}
        </span>
        <Select
          id="search-engine"
          className={styles.select}
          value={search.engine}
          onChange={(picked) => search.setEngine(picked)}
        >
          {held.engines.map((one) => (
            <option key={one.name} value={one.name}>{one.title}</option>
          ))}
        </Select>
      </div>

      <SecretField
        id="search-key"
        label={t('API key')}
        hint={t('The server makes the call, so the key never reaches a model.')}
        field={search.key}
        options={search.options}
        variablesPath={`/workspace/${workspaceId}/variables`}
        placeholder={t('Paste the key')}
        onSource={search.chooseSource}
        onValue={search.keyEdited}
        onVariable={search.keyEdited}
        onReveal={() => void search.reveal()}
        broken={
          held.apiKeyVariableMissing
            ? t('The workspace secret this key was read from is gone. Choose another, or give it a key of its own.')
            : null
        }
      />

      {/* Only tavily composes one, so the switch is only drawn where it means something. */}
      {search.engine === 'tavily' && (
        <div className={`${styles.field} ${styles.labelRow}`}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={search.composeAnswer}
              onChange={(event) => search.setComposeAnswer(event.target.checked)}
            />
            {t('Also compose a short answer over the results')}
          </label>
          <FieldHint label={t('Also compose a short answer over the results')}>
            {t('Costs more than a plain search.')}
          </FieldHint>
        </div>
      )}

      {search.failure !== null && <p className={styles.error} role="alert">{search.failure}</p>}
    </section>
  );
}
