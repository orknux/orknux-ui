import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { applyModelTemplate, fetchModelTemplates, publishModelTemplate } from '../api/models';
import type { ModelImport, ModelTemplate } from '../api/models';
import { t } from '../i18n';
import styles from './Dialog.module.css';
import own from './ModelTemplatesDialog.module.css';

export type ModelTemplatesMode =
  | { kind: 'use' }
  /** The models to publish: the ones the list below shows, as Export takes them. */
  | { kind: 'publish'; modelIds: string[] };

export interface ModelTemplatesDialogProps {
  workspaceId: string;
  /** Null while closed. */
  mode: ModelTemplatesMode | null;
  onClose: () => void;
  /** A template was read in; what it brought, as an import says it. */
  onUsed: (done: ModelImport) => void;
  /** A template was published. */
  onPublished: (made: ModelTemplate) => void;
}

/**
 * Models as templates: published from one workspace's Models page, offered on
 * every workspace's. A template of models holds the models file an export
 * writes - providers and models, never a key - so using one is that import.
 */
export function ModelTemplatesDialog({ workspaceId, mode, onClose, onUsed, onPublished }: ModelTemplatesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [templates, setTemplates] = useState<ModelTemplate[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (mode !== null && !dialog.open) {
      setError(null);
      setName('');
      setDescription('');
      setTemplates(null);
      dialog.showModal();
      if (mode.kind === 'use') {
        fetchModelTemplates()
          .then(setTemplates)
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the templates.')));
      }
    } else if (mode === null && dialog.open) {
      dialog.close();
    }
  }, [mode]);

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

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode?.kind !== 'publish') return;
    setBusy(true);
    setError(null);
    try {
      onPublished(await publishModelTemplate(workspaceId, mode.modelIds, name.trim(), description.trim() === '' ? null : description.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not publish the template.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose} data-testid="model-templates-dialog">
      {mode?.kind === 'publish' ? (
        <form className={styles.body} onSubmit={(event) => void publish(event)}>
          <header className={styles.header}>
            <h2 className={styles.title}>{t('Publish as template')}</h2>
          </header>
          <p className={styles.dialogMessage}>
            {mode.modelIds.length === 1 ? t('1 model, with its provider and without any key.') : `${mode.modelIds.length} ${t('models, with their providers and without any key.')}`}
          </p>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="model-template-name">{t('Name')}</label>
            <input id="model-template-name" className={styles.input} value={name} required autoFocus onChange={(event) => setName(event.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="model-template-description">
              {t('Description')} <span className={styles.optional}>{t('optional')}</span>
            </label>
            <input id="model-template-description" className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          {error !== null && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>{t('Cancel')}</button>
            <button type="submit" className={styles.filled} disabled={busy || name.trim() === ''}>{t('Publish')}</button>
          </div>
        </form>
      ) : (
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
      )}
    </dialog>
  );
}
