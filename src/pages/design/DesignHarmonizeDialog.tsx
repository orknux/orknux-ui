import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchDesignHarmonizeOptions } from '../../api/artifacts';
import type { HarmonizeOptions } from '../../api/artifacts';
import type { Model } from '../../api/models';
import styles from '../../components/Dialog.module.css';
import { t } from '../../i18n';

export interface DesignHarmonizeDialogProps {
  open: boolean;
  workspaceId: string;
  /** The workspace's image models, and its upscale models standing for their Stable Diffusion WebUIs. */
  models: Model[];
  /** The model the editor holds for this picture: where the choice starts. */
  defaultModelId: string;
  /** The picture's own prompt, to start from. */
  prompt: string;
  onClose: () => void;
  /** Throwing shows the reason in the dialog and leaves it open. */
  onHarmonize: (modelId: string, prompt: string, strength: number | null, checkpoint: string | null) => Promise<void>;
}

/** The bounds the server holds Harmonize's strength to. */
const LEAST = 0.05;
const MOST = 0.9;

/**
 * Redraws the whole picture lightly, so the seams a Magic edit left blend: a
 * model, what the picture is of, and - where the model takes one - how
 * strongly. A WebUI also offers its checkpoints, asked of it now.
 */
export function DesignHarmonizeDialog({ open, workspaceId, models, defaultModelId, prompt, onClose, onHarmonize }: DesignHarmonizeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modelId, setModelId] = useState('');
  const [described, setDescribed] = useState('');
  const [options, setOptions] = useState<HarmonizeOptions | null>(null);
  const [strength, setStrength] = useState(0.3);
  const [checkpoint, setCheckpoint] = useState('');
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setError(null);
      setSubmitting(false);
      setDescribed(prompt);
      setModelId(models.some((one) => one.id === defaultModelId) ? defaultModelId : (models[0]?.id ?? ''));
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Each model says whether it takes a strength, and a WebUI which checkpoints it has: asked whenever the model changes.
  useEffect(() => {
    if (!open || modelId === '') return;
    let left = false;
    setOptions(null);
    setUnreachable(null);
    setCheckpoint('');
    fetchDesignHarmonizeOptions(workspaceId, modelId)
      .then((offered) => {
        if (left) return;
        setOptions(offered);
        setStrength(offered.strength);
        setUnreachable(offered.reason);
        setCheckpoint(offered.preferredCheckpoint ?? offered.checkpoints[0] ?? '');
      })
      .catch((cause) => {
        if (left) return;
        setUnreachable(cause instanceof Error ? cause.message : t('Could not ask the server.'));
      });
    return () => {
      left = true;
    };
  }, [open, modelId, workspaceId]);

  const webUi = options?.strengthTaken === true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modelId === '' || options === null || described.trim() === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onHarmonize(modelId, described.trim(), webUi ? strength : null, webUi && checkpoint !== '' ? checkpoint : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not ask for it.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose} data-testid="harmonize-dialog">
      <form className={styles.body} onSubmit={submit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Harmonize')}</h2>
        </header>
        {models.length === 0 ? (
          <p className={styles.dialogMessage} data-testid="harmonize-none">
            {t('There is no image model in this workspace to redraw the picture with.')}
          </p>
        ) : (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harmonize-model">{t('Model')}</label>
              <select
                id="harmonize-model"
                className={`${styles.input} ${styles.select}`}
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                data-testid="harmonize-model"
              >
                {models.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </select>
              {unreachable !== null && (
                <p className={styles.error} role="alert" data-testid="harmonize-unreachable">
                  {unreachable}
                </p>
              )}
            </div>
            {webUi && options.checkpoints.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="harmonize-checkpoint">{t('Checkpoint')}</label>
                <select
                  id="harmonize-checkpoint"
                  className={`${styles.input} ${styles.select}`}
                  value={checkpoint}
                  onChange={(event) => setCheckpoint(event.target.value)}
                  data-testid="harmonize-checkpoint"
                >
                  {options.checkpoints.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harmonize-prompt">{t('Prompt')}</label>
              <textarea
                id="harmonize-prompt"
                className={`${styles.input} ${styles.textarea}`}
                rows={3}
                value={described}
                onChange={(event) => setDescribed(event.target.value)}
                data-testid="harmonize-prompt"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harmonize-strength">{t('Strength')}</label>
              <input
                id="harmonize-strength"
                className={styles.input}
                type="number"
                min={LEAST}
                max={MOST}
                step={0.05}
                value={strength}
                onChange={(event) => setStrength(Number(event.target.value))}
                disabled={!webUi}
                data-testid="harmonize-strength"
              />
              {options !== null && !webUi && (
                <p className={styles.fieldNote} data-testid="harmonize-strength-note">
                  {t("This model's edit endpoint takes no strength; it redraws as it judges.")}
                </p>
              )}
            </div>
          </div>
        )}
        {error !== null && (
          <p className={styles.error} role="alert" data-testid="harmonize-error">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="submit"
            className={styles.filled}
            disabled={modelId === '' || options === null || described.trim() === '' || (webUi && !(strength >= LEAST && strength <= MOST)) || submitting}
            data-testid="harmonize-submit"
          >
            {t('Harmonize')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
