import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import { fetchRoles } from '../../api/roles';
import type { Role } from '../../api/roles';
import type { SessionUser } from '../../api/session';
import { fetchWorkspaces, updateWorkspace } from '../../api/workspaces';
import type { Workspace } from '../../api/workspaces';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { useDirty } from '../../components/useDirty';
import { AdminSidebar } from '../../components/AdminSidebar';
import { CatalogueNote, useCatalogue } from '../../components/Catalogue';
import { DeleteWorkspaceDialog } from '../../components/DeleteWorkspaceDialog';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { shellUser } from '../../session/user';
import { forgetWorkspaces } from '../../session/workspaces';
import { SearchSettings, useSearchSettings } from './SearchSettings';
import { AdminWorkspaceRefused, AdminWorkspaceSettings, useAdminWorkspace } from './AdminWorkspaceSettings';
import styles from './WorkspaceSettingsPage.module.css';
import { t } from '../../i18n';
import { Select } from '../../components/Select';

export interface WorkspaceSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const WORKSPACE_LIST_SIZE = 100;

function WorkspaceSettingsView({ session, onSignOut, onDiscard }: WorkspaceSettingsPageProps & { onDiscard: () => void }) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  /** Ties the save strip's button to the General form. See `SaveBar`. */
  const formId = useId();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** Which roles open this workspace, and everything there is to choose from. */
  const [roleIds, setRoleIds] = useState<string[]>([]);
  /**
   * Which of those also administer it. A subset of the list above by
   * construction: taking a role off the workspace takes it off this too, since a
   * role that administers a workspace it cannot open is a permission that does
   * nothing, and the server refuses that save anyway.
   */
  const [adminRoleIds, setAdminRoleIds] = useState<string[]>([]);

  /*
   * Everything there is to assign. Loaded here rather than with the workspace
   * because it is the same list for every workspace, and a checkbox for a role that
   * has since been removed would be a checkbox for nothing.
   *
   * A failure used to arrive as an empty list, and the panel then sent the
   * reader to the Roles screen to define the roles this installation already
   * has - so the failure is kept and printed in that sentence's place.
   */
  const roleCatalogue = useCatalogue('roles', fetchRoles, []);
  const roles: Role[] = roleCatalogue.items;

  /** What is left to add, so the button knows whether there is anything to add. */
  const unassigned = roles.filter((role) => !roleIds.includes(role.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** What the workspace searches the web with; saved by this page's Save Changes, put back by its Discard. */
  const search = useSearchSettings(workspaceId, () => setSaved(false));
  /** Whether it is an admin workspace, and what it may read; saved and put back with the rest. */
  const admin = useAdminWorkspace(workspaceId, () => setSaved(false));

  useEffect(() => {
    // The workspaces query is already filtered to what the caller may see.
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
    fetchWorkspaces(0, WORKSPACE_LIST_SIZE)
      .then((page) => {
        if (abandoned) return;
        const found = page.content.find((candidate) => candidate.id === workspaceId) ?? null;
        if (found === null) {
          setLoadError(t('That workspace does not exist, or you do not have access to it.'));
          return;
        }
        setWorkspace(found);
        setName(found.name);
        setDescription(found.description ?? '');
        setRoleIds(found.roles.map((role) => role.id));
        setAdminRoleIds(found.adminRoles.map((role) => role.id));
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the workspace.'));
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      /*
       * Switching an admin workspace off goes before the roles, and on after
       * them: the server refuses a role that is not the administrator's on an
       * admin workspace, and refuses switching one on while such a role is on
       * it - so one save can take a role off and switch it on, or switch it off
       * and put a role on, whichever order the boxes were touched in.
       */
      if (admin.turningOff) await admin.save();
      if (generalChanged) {
        const updated = await updateWorkspace(workspaceId, {
          name: name.trim(),
          description: description.trim() || undefined,
          roleIds,
          adminRoleIds,
        });
        // A rename has to reach the selector, which paints from the cached list.
        forgetWorkspaces();
        setWorkspace(updated);
      }
      await admin.save();
      await search.save();
      setSaved(true);
    } catch (cause) {
      // The admin workspace card says its own refusal, beside its switch.
      if (!(cause instanceof AdminWorkspaceRefused)) {
        setSaveError(cause instanceof Error ? cause.message : t('Could not save the workspace.'));
      }
    } finally {
      setSaving(false);
    }
  }

  /*
   * Whether there is anything to save: what the fields would send, against
   * what the page last agreed with the server. Save and Discard are off while
   * there is not.
   */
  const generalChanged = useDirty({ name, description, roleIds, adminRoleIds }, [workspace]);
  /** The search section is part of this form too: its draft is written by the same Save. */
  const changed = generalChanged || search.dirty || admin.dirty;

  return (
    <AppShell
      scrollContent
      user={shellUser(session)}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="workspaces" />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <Link className={styles.crumbLink} to="/admin">{t('Workspaces')}</Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{workspace?.name ?? '…'}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{t('Workspace Settings')}</h1>
        </div>
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        </section>
      ) : workspace === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <>
          <form id={formId} className={styles.card} onSubmit={handleSave}>
            <div className={styles.sectionTitle}>
              <h2 id="general" className={styles.sectionHeading}>{t('General')}</h2>
            </div>

            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="workspace-name">
                  {t('Workspace Name')}
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="workspace-name"
                    name="workspaceName"
                    className={styles.input}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="workspace-description">
                  {t('Description')}
                </label>
                <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
                  <textarea
                    id="workspace-description"
                    name="workspaceDescription"
                    className={`${styles.input} ${styles.textarea}`}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              {/*
                Roles, not a group typed from memory. What used to be here was the
                directory's own name for an audience — free text, unvalidated, and
                meaningless to any other identity provider. These are this
                installation's roles, defined on the Roles screen, and which of the
                provider's groups or claims grants one is the server's configuration.

                A row per role with an add button under it, the same shape the
                function editor uses for its parameters: each row is one decision,
                and the picker in it can be changed without taking the row off first.
              */}
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <span className={styles.label}>{t('Allowed roles')}</span>
                  <FieldHint label={t('Allowed roles')}>
                    {t('Whoever holds one of these can see the workspace. None assigned keeps it administrators-only. Administers adds this workspace’s settings, its issue observers and moving an issue in or out — here only, and nothing installation-wide.')}
                  </FieldHint>
                </span>
                <div className={styles.roleList}>
                  {roleIds.map((roleId, index) => (
                    <div key={`${roleId}-${index}`} className={styles.roleRow}>
                      <div className={styles.selectWrapper}>
                        <Select
                          className={styles.roleSelect}
                          value={roleId}
                          aria-label={`Role ${index + 1}`}
                          onChange={(picked) => {
                            const chosen = picked;
                            setRoleIds((held) =>
                              held.map((id, at) => (at === index ? chosen : id)),
                            );
                            // The row now names a different role, so whatever was
                            // ticked was ticked about the old one.
                            setAdminRoleIds((held) => held.filter((id) => id !== roleId));
                          }}
                          chevron={false}
                        >
                          {roles.map((role) => (
                            <option
                              key={role.id}
                              value={role.id}
                              // Already on another row: choosing it twice would
                              // assign it once and leave a row that does nothing.
                              disabled={role.id !== roleId && roleIds.includes(role.id)}
                            >
                              {role.name}
                            </option>
                          ))}
                        </Select>
                        <img src={chevronDown12Icon} alt="" width={12} height={12} />
                      </div>
                      {/*
                        The second half of the row, and the whole of what the
                        workspace administrator role is: this role opens the
                        workspace, and ticked, it also administers it. Beside the
                        picker rather than in a list of its own, because it is one
                        decision about one role and two lists would have to be kept
                        in step by whoever reads them.
                      */}
                      <label className={styles.administers}>
                        <input
                          type="checkbox"
                          checked={adminRoleIds.includes(roleId)}
                          aria-label={`${roles.find((role) => role.id === roleId)?.name ?? 'This role'} administers this workspace`}
                          onChange={(event) =>
                            setAdminRoleIds((held) =>
                              event.target.checked
                                ? [...held.filter((id) => id !== roleId), roleId]
                                : held.filter((id) => id !== roleId),
                            )
                          }
                        />
                        {t('Administers')}
                      </label>
                      <button
                        type="button"
                        className={styles.roleRemove}
                        aria-label={`Remove ${roles.find((role) => role.id === roleId)?.name ?? 'role'}`}
                        onClick={() => {
                          setRoleIds((held) => held.filter((_, at) => at !== index));
                          setAdminRoleIds((held) => held.filter((id) => id !== roleId));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className={styles.addRole}
                    disabled={unassigned.length === 0}
                    title={
                      roleCatalogue.failure !== null
                        ? t('The roles could not be listed')
                        : roles.length === 0
                          ? t('No roles are defined yet')
                          : unassigned.length === 0
                            ? t('Every role is already assigned')
                            : t('Assign another role to this workspace')
                    }
                    onClick={() => {
                      const next = unassigned[0];
                      if (next !== undefined) setRoleIds((held) => [...held, next.id]);
                    }}
                  >{t('+ Add Role')}</button>

                  {/*
                    What the list has instead of rows, so it stays printed: the
                    add button is dead until somebody goes and makes a role, and
                    a dead end is not an explanation to go looking for.
                  */}
                  <CatalogueNote
                    catalogue={roleCatalogue}
                    className={styles.fieldNote}
                    empty={
                      <>
                        No roles are defined yet. Add one on the <Link to="/admin/roles">Roles</Link> screen,
                        then assign it here.
                      </>
                    }
                  />
                </div>
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
            What this workspace searches with, between the general form and the
            danger zone. Its own component, and part of this page's draft: the
            Save Changes below writes it with the rest and Discard puts it back.
          */}
          <SearchSettings search={search} workspaceId={workspaceId} />

          <AdminWorkspaceSettings
            admin={admin}
            blocking={roles.filter((role) => roleIds.includes(role.id) && !role.scopes.includes('ADMIN')).map((role) => role.name)}
          />

          <section className={`${styles.card} ${styles.dangerCard}`}>
            <h2 id="danger-zone" className={styles.dangerHeading}>{t('Danger Zone')}</h2>
            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <p className={styles.dangerTitle}>{t('Delete Workspace')}</p>
                <p className={styles.dangerMessage}>
                  {t('Permanently remove this workspace and all associated workflows and executions.')}
                </p>
              </div>
              <button type="button" className={styles.delete} onClick={() => setDeleting(true)}>{t('Delete Workspace')}</button>
            </div>
          </section>
        </>
      )}

      <DeleteWorkspaceDialog
        workspace={deleting ? workspace : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          navigate('/admin');
        }}
      />
      {/* Save floats at the foot of the window, in view wherever the reader has scrolled to - and above the AI button. */}
      {workspace !== null && (
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
export function WorkspaceSettingsPage(props: WorkspaceSettingsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <WorkspaceSettingsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
