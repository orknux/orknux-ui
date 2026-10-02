import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { createModel, fetchProviders, modelKindLabel } from '../api/models';
import type { Model, ModelKind, ModelProvider } from '../api/models';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
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
  /**
   * The kinds a model made here may be, the one to offer first at the front.
   * Set while there is no `modelId`, the drawer makes a model rather than
   * drawing an empty frame: an image node offers IMAGE alone, a decision node
   * DECISION and CHAT.
   */
  creating?: ModelKind[] | null;
  /** The model as it was made; the frame then holds it as though opened on it. */
  onCreated?: (model: Model) => void;
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
 *
 * Opened from a node's New, it makes the model first - the few fields a model
 * cannot exist without - and then holds the one it made, as though opened on it.
 */
export function ModelSettingsDrawer({
  open,
  workspaceId,
  modelId,
  onClose,
  onSaved,
  creating = null,
  onCreated,
  placement = 'modal',
}: ModelSettingsDrawerProps) {
  const making = modelId === null && creating !== null && creating.length > 0;

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
            <h2 className={styles.title}>{making ? t('Create model') : t('Model Settings')}</h2>
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
        {open && making && (
          <ModelDrawerCreateForm
            key={creating.join()}
            workspaceId={workspaceId}
            kinds={creating}
            onCreated={(made) => onCreated?.(made)}
            onCancel={onClose}
          />
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

interface ModelDrawerCreateFormProps {
  workspaceId: string;
  kinds: ModelKind[];
  onCreated: (model: Model) => void;
  onCancel: () => void;
}

/** Whether a provider can hold a model of this kind: a decision model sits under a decision provider, and nothing else does. */
function holds(provider: ModelProvider, kind: ModelKind): boolean {
  return (provider.type === 'SYSTEM_ONE') === (kind === 'DECISION');
}

/**
 * A new model, made from a node's New the way an agent node makes an agent.
 *
 * Only what a model cannot be made without - where it is reached, what it is
 * called, what the provider calls it, and its kind, which the node decides.
 * Everything else starts at the Models page's defaults and is edited in this
 * same drawer once the model exists, because the drawer turns into its
 * settings the moment the save lands.
 */
function ModelDrawerCreateForm({ workspaceId, kinds, onCreated, onCancel }: ModelDrawerCreateFormProps) {
  const [providers, setProviders] = useState<ModelProvider[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<ModelKind>(kinds[0]);
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    fetchProviders(workspaceId)
      .then((held) => {
        if (abandoned) return;
        setProviders(held);
        /*
         * A decision node takes a decision model first, but one needs a
         * decision provider - a workspace without one is offered a chat model
         * rather than a form that cannot be saved.
         */
        const first = kinds.find((one) => held.some((provider) => holds(provider, one)));
        if (first !== undefined) setKind(first);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setLoadError(cause instanceof Error ? cause.message : t('Could not load the providers.'));
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  const usable = useMemo(() => (providers ?? []).filter((provider) => holds(provider, kind)), [providers, kind]);

  // A provider picked for one kind is not one to keep for a kind it cannot hold.
  useEffect(() => {
    if (!usable.some((provider) => provider.id === providerId)) setProviderId(usable[0]?.id ?? '');
  }, [usable, providerId]);

  const complete = providerId !== '' && name.trim() !== '' && modelId.trim() !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      onCreated(await createModel(providerId, { name: name.trim(), modelId: modelId.trim(), kind }));
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not add the model.'));
      setSaving(false);
    }
  }

  if (loadError !== null) {
    return (
      <p className={styles.error} role="alert">
        {loadError}
      </p>
    );
  }
  if (providers === null) return <Loader />;

  return (
    <form className={own.narrow} onSubmit={(event) => void handleSubmit(event)} data-testid="model-create">
      <div className={own.detailGrid}>
        <div className={own.detail}>
          <label className={own.detailLabel} htmlFor="new-model-kind">{t('Type')}</label>
          <div className={own.selectWrapper}>
            <select
              id="new-model-kind"
              className={`${own.input} ${own.select}`}
              value={kind}
              onChange={(event) => setKind(event.target.value as ModelKind)}
              disabled={kinds.length < 2}
            >
              {kinds.map((one) => (
                <option key={one} value={one}>{modelKindLabel(one)}</option>
              ))}
            </select>
            <img className={own.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
          </div>
        </div>
        <div className={own.detail}>
          <span className={styles.labelRow}>
            <label className={own.detailLabel} htmlFor="new-model-provider">{t('Provider')}</label>
            {/* In a tab of its own, so the graph and this form are still here to come back to. */}
            <Link
              className={styles.jump}
              to={`/workspace/${workspaceId}/models/providers/new`}
              target="_blank"
              rel="noreferrer"
            >
              {t('Add Provider')}
            </Link>
          </span>
          {/* With none to hold this kind, the empty select says so, and Add Provider above is the way on. */}
          <div className={own.selectWrapper}>
            <select
              id="new-model-provider"
              className={`${own.input} ${own.select}`}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              disabled={usable.length === 0}
            >
              {usable.length === 0 && <option value="">{t('No provider for this kind of model')}</option>}
              {usable.map((one) => (
                <option key={one.id} value={one.id}>{one.name}</option>
              ))}
            </select>
            <img className={own.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
          </div>
        </div>
        <div className={own.detail}>
          <label className={own.detailLabel} htmlFor="new-model-name">{t('Name')}</label>
          <input
            id="new-model-name"
            className={own.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
        </div>
        <div className={own.detail}>
          <label className={own.detailLabel} htmlFor="new-model-id">{t('Model ID')}</label>
          <input
            id="new-model-id"
            className={`${own.input} ${own.detailMono}`}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            spellCheck={false}
            required
          />
        </div>
      </div>

      {saveError !== null && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={saving}>
          {t('Cancel')}
        </button>
        <button type="submit" className={styles.filled} disabled={!complete || saving}>
          {saving ? t('Creating…') : t('Create')}
        </button>
      </div>
    </form>
  );
}
