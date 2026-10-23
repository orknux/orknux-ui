import { useEffect, useRef, useState } from 'react';

import { applyIntegrationTemplate, fetchIntegrationTemplates } from '../api/integrations';
import type { IntegrationImport, IntegrationKind, IntegrationTemplate } from '../api/integrations';
import { t } from '../i18n';
import styles from './Dialog.module.css';
// The same list a template of models is picked from, so the two read as one feature.
import own from './ModelTemplatesDialog.module.css';

export interface IntegrationTemplatesDialogProps {
  workspaceId: string;
  /** Which card asked: the templates holding that kind are offered. */
  kind: IntegrationKind;
  open: boolean;
  onClose: () => void;
  /** A template was used; what it made, and what now needs a credential. */
  onUsed: (done: IntegrationImport) => void;
}

/**
 * Use a template of connections or MCP servers, from the Integrations page.
 * Issue #646. A template is made from a row's Save as template and holds the
 * settings without the credentials, so using one makes the rows and names
 * the ones that need a credential given again - as a template of models does
 * with its keys.
 */
export function IntegrationTemplatesDialog({ workspaceId, kind, open, onClose, onUsed }: IntegrationTemplatesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [templates, setTemplates] = useState<IntegrationTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setError(null);
      setTemplates(null);
      dialog.showModal();
      fetchIntegrationTemplates()
        .then((all) => setTemplates(all.filter((one) => (kind === 'CONNECTION' ? one.connections : one.mcpServers).length > 0)))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the templates.')));
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, kind]);

  async function use(template: IntegrationTemplate) {
    setBusy(true);
    setError(null);
    try {
      onUsed(await applyIntegrationTemplate(workspaceId, template.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not use the template.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose} data-testid="integration-templates-dialog">
      <div className={styles.body}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Use a template')}</h2>
        </header>
        {templates === null && error === null && <p className={styles.dialogMessage}>{t('Loading…')}</p>}
        {templates !== null && templates.length === 0 && (
          <p className={styles.dialogMessage}>
            {kind === 'CONNECTION' ? t('No templates of connections are published yet.') : t('No templates of MCP servers are published yet.')}
          </p>
        )}
        {templates !== null && templates.length > 0 && (
          <ul className={own.list} data-testid="integration-templates">
            {templates.map((template) => (
              <li key={template.id} className={own.row} data-integration-template={template.name}>
                <span className={own.text}>
                  <span className={own.name}>{template.name}</span>
                  <span className={own.models}>{template.description ?? [...template.connections, ...template.mcpServers].join(', ')}</span>
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
