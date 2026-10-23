import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { fetchWorkspaceWorkflows, removeWorkflow, updateWorkflow } from '../../api/workflows';
import type { WorkspaceWorkflow } from '../../api/workflows';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { useDirty } from '../../components/useDirty';
import { BackLink } from '../../components/BackLink';
import { Loader } from '../../components/Loader';
import { PublicationHistory } from '../../components/PublicationHistory';
import { UsedBy } from '../../components/UsedBy';
import { FieldHint } from '../../components/FieldHint';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { shellUser } from '../../session/user';
import styles from './AgentSettingsPage.module.css';
import { t } from '../../i18n';

export interface WorkflowSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const WORKFLOW_LIST_SIZE = 100;

/**
 * No frame exists for this one; the workflows row now opens a settings cog, so
 * this mirrors the agent settings page and keeps removal reachable.
 */
function WorkflowSettingsView({ session, onSignOut, onDiscard }: WorkflowSettingsPageProps & { onDiscard: () => void }) {
  const { workspaceId = '', workflowId = '' } = useParams();
  const navigate = useNavigate();
  /** Ties the save strip's button to the General form. See `SaveBar`. */
  const formId = useId();

  const [workflow, setWorkflow] = useState<WorkspaceWorkflow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  /**
   * What the workflow's badge said after a restore.
   *
   * A restore puts an older publication back into service and leaves the draft
   * alone, so the two can end up disagreeing - the answer is the status the
   * server worked out, said here rather than left for somebody to discover in
   * the editor.
   */
  const [restored, setRestored] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === '') return;
    /*
     * An answer that is no longer wanted is dropped rather than applied.
     *
     * This fills the form from what came back, so a reply landing late writes
     * the stored version over whatever is in the boxes - somebody's typing, or
     * the record they opened after this one. Nothing on screen says it
     * happened: it is the state behind the fields that is replaced, and the
     * state is what the save sends. #324, #862 and #863 were three reports of
     * it on three pages.
     */
    let abandoned = false;
    fetchWorkspaceWorkflows(workspaceId, 0, WORKFLOW_LIST_SIZE)
      .then((page) => {
        if (abandoned) return;
        const found = page.content.find((candidate) => candidate.id === workflowId) ?? null;
        if (found === null) {
          setLoadError(t('That workflow is not assigned to this workspace, or you do not have access to it.'));
          return;
        }
        setWorkflow(found);
        setName(found.name);
        setDescription(found.description ?? '');
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the workflow.'));
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId, workflowId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateWorkflow(workflowId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setWorkflow(updated);
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the workflow.'));
    } finally {
      setSaving(false);
    }
  }

  /*
   * Whether there is anything to save: what the fields would send, against
   * what the page last agreed with the server. Save and Discard are off while
   * there is not.
   */
  const changed = useDirty({ name, description }, [workflow]);

  return (
    <AppShell
      scrollContent
      title={workflow?.name}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to={`/workspace/${workspaceId}`} label={t('Workflows')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}`}>
            {t('Workflows')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{workflow?.name ?? '…'}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{t('Workflow Settings')}</h1>
          <div className={styles.headerActions}>
            {/* The two halves of a workflow are its settings and its graph, and
                getting from here to the graph meant going back to the list and
                finding the row again. */}
            <Link
              className={styles.ghost}
              to={`/workspace/${workspaceId}/workflows/${workflowId}/editor`}
            >
              {t('Open Editor')}
            </Link>
          </div>
        </div>
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        </section>
      ) : workflow === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <>
          <form id={formId} className={styles.card} onSubmit={handleSave}>
            <h2 className={styles.sectionHeading}>{t('General')}</h2>

            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="workflow-name">{t('Workflow Name')}</label>
                {/*
                  Behind the (?), like every other consequence in the product.
                  It was printed here on the argument that a consequence read
                  afterwards has already happened - which is a fair argument and
                  is not the one this product settled on: the rules file puts a
                  consequence worth knowing beforehand behind the (?) beside the
                  thing it is about, and a screen keeping its own answer is the
                  inconsistency the whole convention exists to end.
                */}
                <FieldHint label={t('Workflow Name')}>
                  {t('The definition is shared, so renaming it affects every workspace using this workflow.')}
                </FieldHint>
              </span>
              <div className={styles.inputWrapper}>
                <input
                  id="workflow-name"
                  name="workflowName"
                  className={styles.input}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="workflow-description">
                {t('Description')}
              </label>
              <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
                <textarea
                  id="workflow-description"
                  name="workflowDescription"
                  className={`${styles.input} ${styles.textarea}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>

            {saveError !== null && (
              <p className={styles.error} role="alert">
                {saveError}
              </p>
            )}
            {/* The Save for this form is in the strip floating at the foot of the window. */}
          </form>

          {/*
            A workflow's versions are its publications, so this is the history
            and the canvas is not. It sits above the Danger Zone for the same
            reason it exists: somebody who has just broken a live workflow is
            looking for the way back, not the way out.
          */}
          <section className={styles.card}>
            <PublicationHistory
              workspaceId={workspaceId}
              workflowId={workflowId}
              onRestored={setRestored}
            />
            {restored !== null && (
              <p className={styles.savedNote}>
                {restored === 'PUBLISHED'
                  ? t('Restored. What runs is what the editor is drawing.')
                  : 'Restored. What runs is now that publication; the draft on the canvas is untouched, ' +
                    'so the workflow reads as a draft until it is published again.'}
              </p>
            )}
          </section>

          {/* The workflows that run this one from a node, as every other part's page says what uses it. */}
          <section className={styles.card}>
            <UsedBy kind="WORKFLOW" componentId={workflowId} />
          </section>

          <section className={`${styles.card} ${styles.dangerCard}`}>
            <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <p className={styles.dangerTitle}>{t('Remove Workflow')}</p>
                <p className={styles.dangerMessage}>
                  {t('Unassign this workflow from the workspace. The workflow definition is kept.')}
                </p>
              </div>
              <button type="button" className={styles.delete} onClick={() => setRemoving(true)}>{t('Remove Workflow')}</button>
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        subject={removing ? (workflow?.name ?? null) : null}
        kind="remove"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await removeWorkflow(workflowId);
          setRemoving(false);
          navigate(`/workspace/${workspaceId}`);
        }}
      />
      {/* Save floats at the foot of the window, in view wherever the reader has scrolled to; it drives the General form through its `form`. */}
      {workflow !== null && (
        <SaveBar>
          {saved && saveError === null && <p className={styles.savedNote}>{t('Saved.')}</p>}
          <DiscardButton onDiscard={onDiscard} disabled={saving || !changed} />
          <button
            type="submit"
            form={formId}
            className={styles.save}
            disabled={name.trim() === '' || saving || !changed}
          >
            {saving ? t('Saving…') : t('Save Changes')}
          </button>
        </SaveBar>
      )}
    </AppShell>
  );
}

/**
 * The page, started over by Discard.
 *
 * Discard puts every field back to what the server holds. This page keeps
 * its drafts across many fields and sections, so rather than a second copy
 * of the code that fills them, the page is drawn again from the start and
 * fills them the one way it always does - a round trip, which is the price
 * of there being one way.
 */
export function WorkflowSettingsPage(props: WorkflowSettingsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <WorkflowSettingsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
