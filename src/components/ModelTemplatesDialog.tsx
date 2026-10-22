import { useEffect, useRef, useState } from 'react';

import { applyModelTemplate, fetchModelTemplates } from '../api/models';
import type { ModelImport, ModelTemplate } from '../api/models';
import { t } from '../i18n';
import styles from './Dialog.module.css';
import own from './ModelTemplatesDialog.module.css';

export interface ModelTemplatesDialogProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  /** A template was read in; what it brought, as an import says it. */
  onUsed: (done: ModelImport) => void;
}

/**
 * Use a template of models: offered on every workspace's Models page. A
 * template is made from a model's own row, as every other component's is, and
 * holds the models file an export writes - the model and its provider, never a
 * key - so using one is that import.
 */
export function ModelTemplatesDialog({ workspaceId, open, onClose, onUsed }: ModelTemplatesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [templates, setTemplates] = useState<ModelTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setError(null);
      setTemplates(null);
      dialog.showModal();
      fetchModelTemplates()
        .then(setTemplates)
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the templates.')));
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function use(template: ModelTemplate) {
    setBusy(true);
    setError(null);
    try {
      onUsed(await applyModelTemplate(workspaceId, template.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not use the template.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose} data-testid="model-templates-dialog">
      <div className={styles.body}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Use a template')}</h2>
        </header>
        {templates === null && error === null && <p className={styles.dialogMessage}>{t('Loading…')}</p>}
        {templates !== null && templates.length === 0 && (
          <p className={styles.dialogMessage}>{t('No templates of models are published yet.')}</p>
        )}
        {templates !== null && templates.length > 0 && (
          <ul className={own.list} data-testid="model-templates">
            {templates.map((template) => (
              <li key={template.id} className={own.row}>
                <span className={own.text}>
                  <span className={own.name}>{template.name}</span>
                  <span className={own.models}>{template.description ?? template.models.join(', ')}</span>
                </span>
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => void use(template)} aria-label={`${t('Use')} ${template.name}`}>
                  {t('Use')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error !== null && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>{t('Close')}</button>
        </div>
      </div>
    </dialog>
  );
}
