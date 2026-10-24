import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchDesignHarmonizeOptions } from '../../api/artifacts';
import type { HarmonizeOptions } from '../../api/artifacts';
import type { Model } from '../../api/models';
import styles from '../../components/Dialog.module.css';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import { Select } from '../../components/Select';

export interface DesignHarmonizeDialogProps {
  open: boolean;
  workspaceId: string;
  /** The workspace's upscale models, each standing for its Stable Diffusion WebUI. */
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
  const modelRef = useRef<HTMLButtonElement>(null);
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

  /*
   * The window's first stop is the model, not the (?) beside its title: opening
   * focuses the first thing it can, a focused hint opens, and it opened over
   * the form. The picker is drawn only once the models are in, so it is
   * focused then.
   */
  useEffect(() => {
    if (!open) return;
    const picker = modelRef.current;
    if (picker !== null) picker.focus();
    else if (document.activeElement instanceof HTMLElement && dialogRef.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }, [open, models.length]);

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
    if (modelId === '' || options === null || submitting) return;
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
          <h2 className={`${styles.title} ${styles.labelWithHint}`}>
            {t('Harmonize')}
            <FieldHint label={t('Harmonize')}>
              {t('Redraws the whole picture lightly, so the patches Magic edits left blend into one picture. Use it after a few edits, when their edges show.')}
            </FieldHint>
          </h2>
        </header>
        {models.length === 0 ? (
          <p className={styles.dialogMessage} data-testid="harmonize-none">
            {t('There is no Stable Diffusion WebUI in this workspace to redraw the picture with.')}
          </p>
        ) : (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harmonize-model">{t('Model')}</label>
              <Select
                id="harmonize-model"
                ref={modelRef}
                className={`${styles.input} ${styles.select}`}
                value={modelId}
                onChange={(picked) => setModelId(picked)}
                data-testid="harmonize-model"
              >
                {models.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </Select>
              {unreachable !== null && (
                <p className={styles.error} role="alert" data-testid="harmonize-unreachable">
                  {unreachable}
                </p>
              )}
            </div>
            {webUi && options.checkpoints.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="harmonize-checkpoint">{t('Checkpoint')}</label>
                <Select
                  id="harmonize-checkpoint"
                  className={`${styles.input} ${styles.select}`}
                  value={checkpoint}
                  onChange={(picked) => setCheckpoint(picked)}
                  data-testid="harmonize-checkpoint"
                >
                  {options.checkpoints.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harmonize-prompt">{t('Prompt')}</label>
              <textarea
                id="harmonize-prompt"
                className={`${styles.input} ${styles.textarea} ${styles.textareaAlone}`}
                rows={3}
                value={described}
                onChange={(event) => setDescribed(event.target.value)}
                data-testid="harmonize-prompt"
              />
            </div>
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="harmonize-strength">{t('Strength')}</label>
                <FieldHint label={t('Strength')}>
                  {t('How much the picture may change: low keeps it as it is and only smooths the seams, high redraws more of it. Start low.')}
                </FieldHint>
              </span>
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
            disabled={modelId === '' || options === null || (webUi && !(strength >= LEAST && strength <= MOST)) || submitting}
            data-testid="harmonize-submit"
          >
            {t('Harmonize')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
