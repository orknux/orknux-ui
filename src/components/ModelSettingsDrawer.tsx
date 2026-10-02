import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { Model } from '../api/models';
import { DrawerEdge } from './DrawerWidth';
import { Loader } from './Loader';
import {
  ModelDetailsFields,
  ModelQuotaFields,
  ModelThrottleFields,
  ModelWindowFields,
  useModelForm,
} from './ModelForm';
import own from './ModelForm.module.css';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import { PanelClose, panelEscape } from './PanelClose';
import styles from './Dialog.module.css';
import { t } from '../i18n';

export interface ModelSettingsDrawerProps {
  /** Beside the page, as the workflow editor asks for, or over it. */
  placement?: 'modal' | 'panel';
  open: boolean;
  workspaceId: string;
  /** The model the dialog holds; null draws the frame with nothing in it. */
  modelId: string | null;
  onClose: () => void;
  /** The model as the save left it. */
  onSaved: (model: Model) => void;
}

/**
 * A model's settings beside the workflow graph - what an image or decision
 * node's model picker opens, the way an agent node's picker opens the agent.
 *
 * The form is the model page's own (`ModelForm`), so what is edited here is
 * exactly what the page edits and is saved by the same three mutations. The two
 * things the page has and this has not are its usage figures and its Danger
 * Zone; the mark beside the heading opens the page for those, in a tab of its
 * own so the graph stays where it is.
 */
export function ModelSettingsDrawer({ open, workspaceId, modelId, onClose, onSaved, placement = 'modal' }: ModelSettingsDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      if (placement === 'panel') dialog.show();
      else dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles.dialogWide} ${placement === 'panel' ? styles.dialogPanel : ''}`}
      onCancel={onClose}
      onClose={onClose}
      onKeyDown={panelEscape(placement, onClose)}
      data-testid="model-drawer"
    >
      <DrawerEdge placement={placement} />
      <div className={styles.body}>
        <header className={styles.header}>
          <span className={styles.titleRow}>
            <h2 className={styles.title}>{t('Model Settings')}</h2>
            {modelId !== null && (
              <Link
                className={styles.jump}
                to={`/workspace/${workspaceId}/models/${modelId}`}
                target="_blank"
                rel="noreferrer"
                title={t('Opens the model\'s settings in a new tab')}
                aria-label={t('Open the model\'s settings')}
              >
                <OpenDefinitionIcon />
              </Link>
            )}
          </span>
          {placement === 'panel' && <PanelClose onClose={onClose} />}
        </header>

        {/*
          Mounted only while open, and keyed by the model it holds, which is
          what resets it: the form reads its fields as it loads, so a node
          switched to another model starts the form over on that one.
        */}
        {open && modelId !== null && (
          <ModelDrawerForm key={modelId} workspaceId={workspaceId} modelId={modelId} onSaved={onSaved} onCancel={onClose} />
        )}
      </div>
    </dialog>
  );
}

interface ModelDrawerFormProps {
  workspaceId: string;
  modelId: string;
  onSaved: (model: Model) => void;
  onCancel: () => void;
}

/** The page's sections, one column, in the page's order, with the Save at the foot. */
function ModelDrawerForm({ workspaceId, modelId, onSaved, onCancel }: ModelDrawerFormProps) {
  const form = useModelForm(workspaceId, modelId);
  const { model, loadError, saveError, saving } = form;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updated = await form.save();
    if (updated !== null) onSaved(updated);
  }

  if (loadError !== null) {
    return (
      <p className={styles.error} role="alert">
        {loadError}
      </p>
    );
  }
  if (model === null) return <Loader />;

  return (
    <form className={own.narrow} onSubmit={(event) => void handleSubmit(event)}>
      <ModelDetailsFields form={form} />

      <h3 className={own.heading}>{form.draws ? t('Price') : t('Context Window')}</h3>
      <ModelWindowFields form={form} />

      <h3 className={own.heading}>{t('Quotas & Limits')}</h3>
      <ModelQuotaFields form={form} />

      <h3 className={own.heading}>{t('Throttle')}</h3>
      <ModelThrottleFields form={form} />

      {saveError !== null && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={saving}>
          {t('Cancel')}
        </button>
        <button type="submit" className={styles.filled} disabled={saving}>
          {saving ? t('Saving…') : t('Save Changes')}
        </button>
      </div>
    </form>
  );
}
