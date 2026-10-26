import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  describeDiagram,
  fetchDiagram,
  fetchDiagramCatalogs,
  moveDiagram,
  renameDiagram,
  setDiagramAgentAccess,
} from '../../api/diagrams';
import type { Diagram, DiagramAgentAccess, DiagramCatalog } from '../../api/diagrams';
import type { SessionUser } from '../../api/session';
import { AppShell } from '../../components/AppShell';
import { BackLink } from '../../components/BackLink';
import { Loader } from '../../components/Loader';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { Select } from '../../components/Select';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { useLeaveGuard } from '../../components/leaveGuard';
import { t } from '../../i18n';
import { shellUser } from '../../session/user';
import styles from '../workspace/AgentSettingsPage.module.css';
import { agentAccessOptions } from './DiagramsPage';
import own from './DiagramSettingsPage.module.css';

export interface DiagramSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** What the form sends, compared with what the server holds to say whether anything changed. */
interface Draft {
  name: string;
  description: string;
  catalogId: string;
  agentAccess: DiagramAgentAccess;
}

const draftOf = (diagram: Diagram): Draft => ({
  name: diagram.name,
  description: diagram.description ?? '',
  catalogId: diagram.catalogId,
  agentAccess: diagram.agentAccess,
});

/**
 * A diagram's details: its name, what it is for, the catalog it is filed in
 * and what agents may do with it. The list's pencil opens it; the drawing is
 * the editor's.
 *
 * Laid out as the workflow and agent settings pages are - a breadcrumb back to
 * the list, one General card, the save strip at the window's foot - and saved
 * through the mutations the list and the editor already use, so each change is
 * the audit entry it always was.
 */
function DiagramSettingsView({ session, onSignOut, onDiscard }: DiagramSettingsPageProps & { onDiscard: () => void }) {
  const { workspaceId = '', diagramId = '' } = useParams();
  const formId = useId();
  const listPath = `/workspace/${workspaceId}/explore/diagrams`;

  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [catalogs, setCatalogs] = useState<DiagramCatalog[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workspaceId === '' || diagramId === '') return;
    let abandoned = false;
    Promise.all([fetchDiagram(diagramId), fetchDiagramCatalogs(workspaceId)])
      .then(([found, filed]) => {
        if (abandoned) return;
        if (found === null || found.workspaceId !== workspaceId) {
          setLoadError(t('There is no such diagram here.'));
          return;
        }
        setDiagram(found);
        setDraft(draftOf(found));
        setCatalogs(filed);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setLoadError(cause instanceof Error ? cause.message : t('Could not load the diagram.'));
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId, diagramId]);

  const changed = diagram !== null && draft !== null && JSON.stringify({ ...draft, description: draft.description.trim(), name: draft.name.trim() }) !== JSON.stringify(draftOf(diagram));

  /** Each part that changed, through its own mutation; answers whether all of them were taken. */
  async function save(): Promise<boolean> {
    if (diagram === null || draft === null) return false;
    if (!changed) return true;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      let now = diagram;
      if (draft.name.trim() !== now.name) now = await renameDiagram(now.id, draft.name.trim());
      if (draft.description.trim() !== (now.description ?? '')) now = await describeDiagram(now.id, draft.description.trim());
      if (draft.catalogId !== now.catalogId) now = await moveDiagram(now.id, draft.catalogId);
      if (draft.agentAccess !== now.agentAccess) now = await setDiagramAgentAccess(now.id, draft.agentAccess);
      setDiagram(now);
      setDraft(draftOf(now));
      setSaved(true);
      return true;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the diagram.'));
      // What was taken before the refusal is kept: read it back, and leave the fields as typed.
      const held = await fetchDiagram(diagram.id).catch(() => null);
      if (held !== null) setDiagram(held);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || draft.name.trim() === '' || saving) return;
    await save();
  }

  const guard = useLeaveGuard({ unsaved: changed, backTo: listPath, save });
  const most = diagram?.descriptionCharactersMost ?? 2000;
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((held) => (held === null ? held : { ...held, ...patch }));
  };

  return (
    <AppShell
      scrollContent
      title={diagram?.name}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to={listPath} label={t('Diagrams')} />
          <Link className={styles.crumbLink} to={listPath}>
            {t('Diagrams')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{diagram?.name ?? '…'}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{t('Diagram Settings')}</h1>
          <div className={styles.headerActions}>
            <Link className={styles.ghost} to={`/workspace/${workspaceId}/explore/diagrams/${diagramId}`} data-testid="diagram-open-editor">
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
      ) : diagram === null || draft === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <form id={formId} className={styles.card} onSubmit={(event) => void handleSave(event)} data-testid="diagram-settings">
          <h2 className={styles.sectionHeading}>{t('General')}</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="diagram-name">
              {t('Name')}
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="diagram-name"
                className={styles.input}
                type="text"
                value={draft.name}
                onChange={(event) => set({ name: event.target.value })}
                maxLength={200}
                required
                data-testid="diagram-settings-name"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={own.labelRow}>
              <label className={styles.label} htmlFor="diagram-description">
                {t('Description')}
              </label>
              <span
                className={`${own.counter} ${draft.description.length >= most ? own.counterFull : ''}`}
                data-testid="diagram-settings-counter"
              >{`${draft.description.length} / ${most}`}</span>
            </span>
            <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
              <textarea
                id="diagram-description"
                className={`${styles.input} ${styles.textarea}`}
                value={draft.description}
                onChange={(event) => set({ description: event.target.value.slice(0, most) })}
                maxLength={most}
                data-testid="diagram-settings-description"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="diagram-catalog">
              {t('Catalog')}
            </span>
            <Select
              className={styles.select}
              value={draft.catalogId}
              onChange={(picked) => set({ catalogId: picked })}
              aria-labelledby="diagram-catalog"
              data-testid="diagram-settings-catalog"
            >
              {catalogs.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Select>
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="diagram-agents">
              {t('What agents may do with it')}
            </span>
            <Select
              className={styles.select}
              value={draft.agentAccess}
              title={agentAccessOptions().find((one) => one.value === draft.agentAccess)?.hint}
              onChange={(picked) => set({ agentAccess: picked as DiagramAgentAccess })}
              aria-labelledby="diagram-agents"
              data-testid="diagram-settings-access"
            >
              {agentAccessOptions().map((one) => (
                <option key={one.value} value={one.value} data-hint={one.hint}>
                  {one.label}
                </option>
              ))}
            </Select>
          </div>

          {saveError !== null && (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          )}
        </form>
      )}

      {diagram !== null && draft !== null && (
        <SaveBar>
          {saved && saveError === null && <p className={styles.savedNote}>{t('Saved.')}</p>}
          <DiscardButton onDiscard={onDiscard} disabled={saving || !changed} />
          <button
            type="submit"
            form={formId}
            className={styles.save}
            disabled={draft.name.trim() === '' || saving || !changed}
            data-testid="diagram-settings-save"
          >
            {saving ? t('Saving…') : t('Save Changes')}
          </button>
        </SaveBar>
      )}
      <UnsavedWorkDialog
        subject={guard.asking ? (diagram?.name ?? t('This diagram')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}

/** The page, started over by Discard, as the workflow settings page is. */
export function DiagramSettingsPage(props: DiagramSettingsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <DiagramSettingsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
