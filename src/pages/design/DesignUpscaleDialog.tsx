import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchDesignUpscaleAlgorithms } from '../../api/artifacts';
import type { Model } from '../../api/models';
import styles from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import { Select } from '../../components/Select';

export interface DesignUpscaleDialogProps {
  open: boolean;
  workspaceId: string;
  /** The workspace's upscale models: the only kind this offers. */
  models: Model[];
  /** The picture's own size, for saying what it will become. */
  width: number;
  height: number;
  onClose: () => void;
  /** Throwing shows the reason in the dialog and leaves it open. */
  onUpscale: (modelId: string, algorithm: string, scale: number) => Promise<void>;
}

/** How many times larger: what people ask a picture to become. */
const SCALES = [1.5, 2, 3, 4];

/**
 * Makes the picture larger: an upscale model, one of the algorithms its server
 * offers - asked of the server, since AUTOMATIC1111, Forge and SD.Next each
 * have their own - and how many times larger.
 */
export function DesignUpscaleDialog({ open, workspaceId, models, width, height, onClose, onUpscale }: DesignUpscaleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modelId, setModelId] = useState('');
  const [algorithms, setAlgorithms] = useState<string[] | null>(null);
  const [algorithm, setAlgorithm] = useState('');
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setError(null);
      setSubmitting(false);
      if (modelId === '' || !models.some((one) => one.id === modelId)) setModelId(models[0]?.id ?? '');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Each model's server has its own algorithms: asked again whenever the model changes.
  useEffect(() => {
    if (!open || modelId === '') return;
    let left = false;
    setAlgorithms(null);
    setUnreachable(null);
    fetchDesignUpscaleAlgorithms(workspaceId, modelId)
      .then((offered) => {
        if (left) return;
        setAlgorithms(offered.names);
        setUnreachable(offered.reason);
        setAlgorithm(offered.preferred !== null && offered.names.includes(offered.preferred) ? offered.preferred : (offered.names[0] ?? ''));
      })
      .catch((cause) => {
        if (left) return;
        setAlgorithms([]);
        setUnreachable(cause instanceof Error ? cause.message : t('Could not ask the server.'));
      });
    return () => {
      left = true;
    };
  }, [open, modelId, workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modelId === '' || algorithm === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUpscale(modelId, algorithm, scale);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not ask for it.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose} data-testid="upscale-dialog">
      <form className={styles.body} onSubmit={submit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Upscale')}</h2>
        </header>
        {models.length === 0 ? (
          <p className={styles.dialogMessage} data-testid="upscale-none">
            {t('There is no upscale model in this workspace. Add a Stable Diffusion WebUI provider and an Upscale model under it.')}
          </p>
        ) : (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="upscale-model">{t('Model')}</label>
              <Select
                id="upscale-model"
                className={`${styles.input} ${styles.select}`}
                value={modelId}
                onChange={(picked) => setModelId(picked)}
                data-testid="upscale-model"
              >
                {models.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </Select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="upscale-algorithm">{t('Algorithm')}</label>
              <Select
                id="upscale-algorithm"
                className={`${styles.input} ${styles.select}`}
                value={algorithm}
                onChange={(picked) => setAlgorithm(picked)}
                disabled={algorithms === null || algorithms.length === 0}
                data-testid="upscale-algorithm"
              >
                {algorithms === null && <option value="">{t('Asking the server…')}</option>}
                {(algorithms ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              {unreachable !== null && (
                <p className={styles.error} role="alert" data-testid="upscale-unreachable">
                  {unreachable}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="upscale-scale">{t('Scale')}</label>
              <Select
                id="upscale-scale"
                className={`${styles.input} ${styles.select}`}
                value={scale}
                onChange={(picked) => setScale(Number(picked))}
                data-testid="upscale-scale"
              >
                {SCALES.map((one) => (
                  <option key={one} value={one}>
                    {width > 0
                      ? tf('{scale}× - {width} × {height}', { scale: one, width: Math.round(width * one), height: Math.round(height * one) })
                      : `${one}×`}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
        {error !== null && (
          <p className={styles.error} role="alert">
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
            disabled={modelId === '' || algorithm === '' || submitting}
            data-testid="upscale-submit"
          >
            {t('Upscale')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
