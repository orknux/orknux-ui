import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { fetchModels } from '../api/models';
import type { Model } from '../api/models';
import { setWorkspaceCompletionModel } from '../api/workspaces';
import { t } from '../i18n';
import { ModelPicker } from './ModelPicker';
import styles from './CompletionSwitch.module.css';

export interface CompletionSwitchProps {
  workspaceId: string;
  /** Whether this person has it on. */
  completing: boolean;
  /** How long to wait after typing, which is also whether anything can be suggested: null is no model to ask. */
  pause: number | null;
  onToggle: () => void;
  /** A model was chosen here, so suggestions can start. */
  onChosen: (pause: number) => void;
  /** The switch's class and its class when on, from the editor's toolbar. */
  className: string;
  onClassName: string;
  testId: string;
}

/**
 * The Auto-completion switch of an editor's toolbar. With no completion model it
 * is greyed out, and hovering it offers to set one.
 *
 * Said in full and confirmed, because the choice is not this editor's: it is the
 * workspace's Completion Model, the one everybody there gets suggestions from,
 * and a dropdown on a toolbar reads as a setting of the page it is on. Refused
 * for somebody who does not administer the workspace, and the refusal is shown
 * where they were choosing.
 */
export function CompletionSwitch({
  workspaceId, completing, pause, onToggle, onChosen, className, onClassName, testId,
}: CompletionSwitchProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [setting, setSetting] = useState(false);
  const [chosen, setChosen] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (pause !== null || workspaceId === '') return;
    fetchModels(workspaceId)
      .then((found) => setModels(found.filter((model) => model.kind === 'CHAT')))
      .catch(() => setModels([]));
  }, [pause, workspaceId]);

  if (pause !== null) {
    return (
      <button
        type="button"
        className={`${className} ${completing ? onClassName : ''}`}
        onClick={onToggle}
        aria-pressed={completing}
        title={t('Auto-completion')}
        data-testid={testId}
      >
        {t('Auto-completion')}
      </button>
    );
  }

  function cancel() {
    setSetting(false);
    setChosen('');
    setRefusal(null);
  }

  function confirm() {
    if (chosen === '' || saving) return;
    setSaving(true);
    setRefusal(null);
    setWorkspaceCompletionModel(workspaceId, chosen)
      .then((workspace) => onChosen(workspace.completionPauseMillis))
      .catch((failure: unknown) => setRefusal(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setSaving(false));
  }

  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
  }

  return (
    <span className={styles.wrap} data-setting={setting ? '' : undefined}>
      <button
        type="button"
        className={`${className} ${styles.missing}`}
        disabled
        aria-pressed={false}
        title={t('Auto-completion needs a completion model, chosen in the workspace settings')}
        data-testid={testId}
      >
        {t('Auto-completion')}
      </button>
      {!setting && models.length > 0 && (
        <span className={styles.offer}>
          <span className={styles.offerCard}>
          <span className={styles.offerText} data-testid={`${testId}-why`}>
            {t('No completion model is set for this workspace, so nothing can be suggested.')}
          </span>
          <button type="button" className={styles.set} onClick={() => setSetting(true)} data-testid={`${testId}-set`}>
            {t('Set workspace completion model')}
          </button>
          </span>
        </span>
      )}
      {setting && (
        <div className={styles.dialog} role="dialog" aria-label={t('Set workspace completion model')} onKeyDown={keys} data-testid={`${testId}-dialog`}>
          <p className={styles.explain}>
            {t('This sets the Completion Model of the whole workspace: everybody in it gets suggestions from this model, in every editor and in chats.')}
          </p>
          <ModelPicker
            id={`${testId}-model`}
            className={styles.picker}
            value={chosen}
            models={models}
            required
            none={t('Choose a model')}
            onChange={setChosen}
          />
          {refusal !== null && <p className={styles.refusal} role="alert">{refusal}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={cancel} data-testid={`${testId}-cancel`}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className={styles.confirm}
              disabled={chosen === '' || saving}
              onClick={confirm}
              data-testid={`${testId}-confirm`}
            >
              {t('Set for the workspace')}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
