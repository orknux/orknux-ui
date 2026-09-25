import { useCallback, useEffect, useState } from 'react';

import { ROLE_SCOPES, ROLE_SCOPE_HINT, ROLE_SCOPE_LABEL, createRole, deleteRole, fetchRoles, updateRole } from '../../api/roles';
import type { Role, RoleScope } from '../../api/roles';
import { authMethod } from '../../api/session';
import type { AuthMethodInfo, SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import lockIcon from '../../assets/lock-keyhole.svg';
import pencilIcon from '../../assets/pencil.svg';
import plusIcon from '../../assets/plus.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { ordered, useTableSort } from '../../components/tableSort';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { TrashIcon } from '../../components/TrashIcon';
import { shellUser } from '../../session/user';
import styles from './AdminRolesPage.module.css';
import { t } from '../../i18n';

export interface AdminRolesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** A role being written, before it is one. */
interface Draft {
  /** The role this is editing, or null while it is being created. */
  id: string | null;
  name: string;
  description: string;
  scopes: RoleScope[];
  /**
   * The directory names typed into the box, one per line. Issue #375.
   *
   * A string rather than a list, because that is what a textarea holds; it is
   * split on the way to the server and joined on the way back, so an empty line
   * somebody left while typing is not a rule that grants nothing.
   */
  matches: string;
}

const BLANK: Draft = { id: null, name: '', description: '', scopes: ['USER'], matches: '' };

/**
 * The roles this installation defines.
 *
 * A role is what this application says somebody may do; which of a provider's
 * groups or claims grants it is configuration, and deliberately not editable here —
 * an administrator who could grant themselves a directory group from a web page
 * would be an administrator who never needed the directory.
 *
 * The administrator role is built in and shown without its controls. An installation
 * with no administrator role is one nobody can administer, and a delete button able
 * to do that is one that eventually will.
 */
export function AdminRolesPage({ session, onSignOut }: AdminRolesPageProps) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  /* The list arrives whole - an installation has a handful of roles. Issue #358. */
  const [order, ascending, sortBy] = useTableSort<'NAME' | 'SCOPES' | 'MODIFIED'>(
    'admin-roles',
    'NAME',
    true,
    ['MODIFIED', 'SCOPES'],
  );
  /** The roles in the order a heading asked for; the name breaks every tie. */
  const arranged =
    roles === null
      ? null
      : ordered(
          roles,
          (role) => {
            if (order === 'SCOPES') return role.scopes.length;
            if (order === 'MODIFIED') return role.lastModifiedAt;
            return role.name;
          },
          ascending,
          (role) => role.name,
        );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  /** The role whose removal is waiting to be confirmed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /*
   * How this installation signs people in. Directory groups only mean something
   * where a directory grants them, so the field for them is drawn only under a
   * directory sign-in and never on an internal-accounts installation. The same
   * signal the login page reads to hide the password-reset link. Issue #382.
   */
  const [signIn, setSignIn] = useState<AuthMethodInfo | null>(null);
  const directory = signIn?.method === 'LDAP' || signIn?.method === 'OIDC';

  useEffect(() => {
    let current = true;
    authMethod().then((found) => {
      if (current) setSignIn(found);
    });
    return () => {
      current = false;
    };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRoles()
      .then((found) => {
        setRoles(found);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setRoles(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the roles.'));
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  async function save() {
    if (draft === null || draft.name.trim() === '' || saving) return;

    setSaving(true);
    setError(null);
    try {
      const input = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        scopes: draft.scopes,
        matches: draft.matches
          .split('\n')
          .map((one) => one.trim())
          .filter((one) => one !== ''),
      };
      if (draft.id === null) await createRole(input);
      else await updateRole(draft.id, input);
      setDraft(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the role.'));
    } finally {
      setSaving(false);
    }
  }

  /** Opens a role for editing. The row and the pencil both come here. */
  function edit(role: Role) {
    setDraft({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      scopes: role.scopes,
      matches: role.matches.join('\n'),
    });
  }

  async function remove(role: Role) {
    setError(null);
    try {
      await deleteRole(role.id);
      setConfirming(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not remove the role.'));
    }
  }

  return (
    <AppShell
      user={shellUser(session)}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      scrollContent
      sidebar={<AdminSidebar active="roles" />}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>
              <span className={styles.titleWithHint}>
                {t('Roles')}
                {/*
                  Where a role comes from is a thing somebody asks once and then
                  knows, so it is behind the (?) rather than printed under the
                  title on every visit.
                */}
                <FieldHint label={t('Roles')}>
                  {t('Which of the identity provider\'s groups or claims grants a role is set in the server\'s configuration, not here.')}
                </FieldHint>
              </span>
            </h1>
            <p className={styles.subtitle}>
              {t('What somebody may do here, in this installation\'s own terms.')}
            </p>
          </div>
          <button
            type="button"
            className={styles.create}
            onClick={() => setDraft(BLANK)}
            disabled={draft !== null}
          >
            <img src={plusIcon} alt="" width={14} height={14} />
            {t('New Role')}
          </button>
        </header>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {draft !== null && (
          <div className={styles.editor}>
            <h2 className={styles.editorTitle}>{draft.id === null ? t('New role') : `Editing ${draft.name}`}</h2>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="role-name">{t('Name')}</label>
              <input
                id="role-name"
                className={styles.input}
                value={draft.name}
                placeholder={t('e.g. Backend')}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="role-description">{t('Description')}</label>
              <input
                id="role-description"
                className={styles.input}
                value={draft.description}
                placeholder={t('What holding this role means')}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>

            {/*
              Scopes are what a role grants everywhere, as opposed to the workspaces
              it is assigned to. Checkboxes rather than a picker: a role can be more
              than one thing, and the two are not alternatives.
            */}
            <div className={styles.field}>
              <span className={styles.label}>{t('Scopes')}</span>
              {ROLE_SCOPES.map((scope) => (
                <label key={scope} className={styles.scope}>
                  <input
                    type="checkbox"
                    checked={draft.scopes.includes(scope)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        scopes: event.target.checked
                          ? [...draft.scopes, scope]
                          : draft.scopes.filter((held) => held !== scope),
                      })
                    }
                  />
                  <span>
                    <span className={styles.scopeName}>{ROLE_SCOPE_LABEL[scope]}</span>
                    <span className={styles.scopeHint}>{ROLE_SCOPE_HINT[scope]}</span>
                  </span>
                </label>
              ))}
            </div>

            {/*
              Where a role is granted by a name it cannot be called. Issue #375.

              Below the scopes because it is the rarer half: a role named after
              its group needs nothing here, and this box exists for the groups a
              role cannot be named after — a dot or a space in the group's name
              is enough. It was configuration-file-only, which meant the person
              administering the installation could not see it, let alone change
              it.

              One per line, because that is how somebody pastes a handful of
              group names out of a directory browser.
            */}
            {directory && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="role-matches">{t('Directory groups')}</label>
                <FieldHint label={t('Directory groups')}>
                  <p>
                    Extra names the directory may use for this role, one per line. A role is
                    already granted to whoever holds the authority made from its own name, so
                    most roles need none of these.
                  </p>
                  <p>
                    They are for groups this role cannot be named after — anything with a dot or
                    a space in it. Write the group's name as the directory sends it
                    (<code>ROLE_DEV.TL</code>) or paste its whole DN; either is matched, and
                    capitals do not matter.
                  </p>
                </FieldHint>
              </span>
              <textarea
                id="role-matches"
                className={styles.textarea}
                rows={3}
                value={draft.matches}
                placeholder={'ROLE_DEV.TL'}
                onChange={(event) => setDraft({ ...draft, matches: event.target.value })}
              />
            </div>
            )}

            <div className={styles.editorActions}>
              <button type="button" className={styles.ghost} onClick={() => setDraft(null)} disabled={saving}>{t('Cancel')}</button>
              <button
                type="button"
                className={styles.save}
                onClick={() => void save()}
                disabled={saving || draft.name.trim() === ''}
              >
                {saving ? t('Saving…') : draft.id === null ? t('Create Role') : t('Save Changes')}
              </button>
            </div>
          </div>
        )}

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            {/*
              Pressable. Issue #358. Scopes is a set, so it orders by how many a
              role has - which groups the roles that can do little away from the
              ones that can do everything, and is what pressing it is asking.
            */}
            <ColumnHeader
              label={t('Name')}
              order="NAME"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colName}
            />
            <ColumnHeader
              label={t('Scopes')}
              order="SCOPES"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colScopes}
            />
            <ColumnHeader
              label={t('Last modified')}
              order="MODIFIED"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colModified}
            />
            <span className={styles.colActions}>{t('Actions')}</span>
          </div>

          {loading && (
            <p className={styles.notice}>
              <Loader />
            </p>
          )}
          {!loading && roles?.length === 0 && <p className={styles.notice}>{t('No roles yet.')}</p>}

          {arranged?.map((role) => (
            <div
              key={role.id}
              className={role.builtin ? styles.row : styles.rowClickable}
              /*
                The row opens the role, which is what clicking a row in a list of
                things means everywhere else. The built-in one is not clickable at
                all rather than clickable-and-refused: there is nothing behind it
                to open.
              */
              onClick={role.builtin ? undefined : () => edit(role)}
              role={role.builtin ? undefined : 'button'}
              tabIndex={role.builtin ? undefined : 0}
              onKeyDown={
                role.builtin
                  ? undefined
                  : (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        edit(role);
                      }
                    }
              }
            >
              <span className={styles.colName}>
                <span className={styles.name}>
                  {role.name}
                  {role.builtin && (
                    <img src={lockIcon} alt={t("Built in")} title={t('Built in: not editable')} width={12} height={12} />
                  )}
                </span>
                {role.description !== null && <span className={styles.description}>{role.description}</span>}
              </span>
              <span className={styles.colScopes}>
                {role.scopes.map((scope) => (
                  <span key={scope} className={scope === 'ADMIN' ? styles.scopeBadgeAdmin : styles.scopeBadge}>
                    {ROLE_SCOPE_LABEL[scope]}
                  </span>
                ))}
              </span>
              <span className={`${styles.colModified} ${styles.muted}`}>
                {timeAgo(role.lastModifiedAt)} by {role.lastModifiedBy}
              </span>
              <span className={styles.colActions}>
                {/*
                  The built-in role has no controls at all rather than disabled ones:
                  it is not a role somebody has yet to earn the right to change.
                */}
                {!role.builtin && (
                  <>
                    {/*
                      The buttons stop the click reaching the row, which would
                      otherwise open the editor behind whatever was pressed.
                    */}
                    <button
                      type="button"
                      className={styles.rowAction}
                      aria-label={`Edit ${role.name}`}
                      title={`Edit ${role.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        edit(role);
                      }}
                    >
                      <img src={pencilIcon} alt="" width={14} height={14} />
                    </button>
                    {confirming === role.id ? (
                      <button
                        type="button"
                        className={styles.confirm}
                        onClick={(event) => {
                          event.stopPropagation();
                          void remove(role);
                        }}
                      >{t('Remove?')}</button>
                    ) : (
                      <button
                        type="button"
                        className={styles.rowAction}
                        aria-label={`Remove ${role.name}`}
                        title={`Remove ${role.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirming(role.id);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
