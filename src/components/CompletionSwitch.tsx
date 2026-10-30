import { useEffect, useState } from 'react';

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
 * The Auto-completion switch of an editor's toolbar, and with no completion
 * model the place to choose one: a tinted dropdown of the workspace's chat
 * models rather than a switch drawn on that could suggest nothing. Where there
 * is nothing to choose, or this person may not choose, it is disabled and says
 * so, as the setting belongs to whoever administers the workspace.
 */
export function CompletionSwitch({
  workspaceId, completing, pause, onToggle, onChosen, className, onClassName, testId,
}: CompletionSwitchProps) {
  const [models, setModels] = useState<Model[] | null>(null);
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

  if (models === null || models.length === 0 || refusal !== null) {
    return (
      <button
        type="button"
        className={`${className} ${styles.missing}`}
        disabled
        aria-pressed={false}
        title={refusal ?? t('Auto-completion needs a completion model, chosen in the workspace settings')}
        data-testid={testId}
      >
        {t('Auto-completion')}
      </button>
    );
  }

  return (
    <span className={styles.choosing} title={t('Auto-completion needs a completion model, chosen in the workspace settings')}>
      <ModelPicker
        id={`${testId}-model`}
        className={`${className} ${styles.missing} ${styles.chooser}`}
        value=""
        models={models}
        required
        none={t('Auto-completion: choose a model')}
        onChange={(modelId) => {
          setWorkspaceCompletionModel(workspaceId, modelId)
            .then((workspace) => onChosen(workspace.completionPauseMillis))
            .catch((failure: unknown) => setRefusal(failure instanceof Error ? failure.message : String(failure)));
        }}
      />
    </span>
  );
}
