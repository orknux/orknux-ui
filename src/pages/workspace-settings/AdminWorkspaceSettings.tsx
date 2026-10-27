import { useEffect, useState } from 'react';
import {
  ADMIN_WORKSPACE_SCOPES,
  ADMIN_WORKSPACE_TOOLS,
  fetchAdminWorkspace,
  setAdminWorkspace,
  type AdminWorkspaceInput,
  type AdminWorkspaceScope,
  type AdminWorkspaceSettings as Held,
  type AdminWorkspaceTool,
} from '../../api/adminWorkspaces';
import { fetchWorkspaces, type Workspace } from '../../api/workspaces';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import styles from './AdminWorkspaceSettings.module.css';

/** How many workspaces the reach list offers; the same page the settings page reads its own from. */
const WORKSPACE_LIST_SIZE = 100;

/**
 * The admin workspace section's draft, held by the page so its one Save writes
 * it with everything else and its Discard puts it back - the shape the search
 * section has, for the same reason.
 */
export interface AdminWorkspaceHandle {
  /** What the server holds; null until it has answered. */
  held: Held | null;
  failure: string | null;
  draft: AdminWorkspaceInput;
  /** The other workspaces, for the reach list. */
  others: Workspace[];
  dirty: boolean;
  /** Whether this save switches it off, which goes first so a role it was holding off can be added in the same save. */
  turningOff: boolean;
  edit: (next: Partial<AdminWorkspaceInput>) => void;
  /**
   * Writes it. A refusal is shown in the card, beside the switch it is about,
   * and thrown as [AdminWorkspaceRefused] so the page stops its save without
   * saying it a second time at its button.
   */
  save: () => Promise<void>;
}

/** The card's own refusal, already drawn in the card. */
export class AdminWorkspaceRefused extends Error {}

function inputOf(held: Held): AdminWorkspaceInput {
  return { enabled: held.enabled, reachAll: held.reachAll, reach: held.reach, scopes: held.scopes, tools: held.tools };
}

export function useAdminWorkspace(workspaceId: string, onChange?: () => void): AdminWorkspaceHandle {
  const [held, setHeld] = useState<Held | null>(null);
  const [draft, setDraft] = useState<AdminWorkspaceInput>({ enabled: false, reachAll: true, reach: [], scopes: [], tools: [] });
  const [others, setOthers] = useState<Workspace[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // An answer for a workspace this page has since left is dropped, not applied.
    let live = true;
    fetchAdminWorkspace(workspaceId)
      .then((answer) => {
        if (!live) return;
        setHeld(answer);
        setDraft(inputOf(answer));
      })
      .catch((cause: unknown) => {
        if (live) setFailure(cause instanceof Error ? cause.message : t('The admin workspace settings could not be read.'));
      });
    fetchWorkspaces(0, WORKSPACE_LIST_SIZE)
      .then((page) => { if (live) setOthers(page.content.filter((one) => one.id !== workspaceId)); })
      .catch(() => { if (live) setOthers([]); });
    return () => { live = false; };
  }, [workspaceId]);

  return {
    held,
    failure,
    draft,
    others,
    dirty,
    turningOff: held !== null && held.enabled && !draft.enabled,
    edit(next) {
      setDraft((was) => ({ ...was, ...next }));
      setDirty(true);
      setFailure(null);
      onChange?.();
    },
    async save() {
      if (!dirty || held === null) return;
      let saved: Held;
      try {
        saved = await setAdminWorkspace(workspaceId, draft);
      } catch (cause) {
        const said = cause instanceof Error ? cause.message : t('The admin workspace settings could not be saved.');
        setFailure(said);
        throw new AdminWorkspaceRefused(said);
      }
      setHeld(saved);
      setDraft(inputOf(saved));
      setDirty(false);
    },
  };
}

/* Asked at drawing time, since `t` answers in the language the tree was mounted in. */
function scopeLabel(scope: AdminWorkspaceScope): string {
  switch (scope) {
    case 'SESSIONS': return t('Sessions');
    case 'CHATS': return t('Chats');
    case 'AGENTS': return t('Agents');
    case 'ACTIONS': return t('Actions');
    case 'WORKFLOWS': return t('Workflows');
    case 'RUNS': return t('Runs');
    case 'REPORTS': return t('Reports');
  }
}

function toolLabel(tool: AdminWorkspaceTool): string {
  switch (tool) {
    case 'REPORTS': return t('Reports');
    case 'DOCTOR': return t('Doctor');
    case 'ROLES': return t('Roles');
    case 'MONITORING': return t('Monitoring');
    case 'TEMPLATES': return t('Templates');
    case 'PLUGINS': return t('Plugins');
    case 'AUDIT': return t('Audit Log');
    case 'USERS': return t('Users');
  }
}

function toggled<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list.filter((one) => one !== item), item] : list.filter((one) => one !== item);
}

/**
 * Whether this workspace is an admin workspace, and what it may read.
 *
 * Here and not on the workspace's own settings: only an installation
 * administrator decides it, and this page is theirs. Nothing here saves; the
 * page's Save Changes writes it.
 */
/**
 * @param blocking the roles opening this workspace that do not make their
 *   holders installation administrators. While the switch is on and any are
 *   here, saving would be refused - so it is said in the card before anybody
 *   presses Save, naming them.
 */
export function AdminWorkspaceSettings({ admin, blocking = [] }: { admin: AdminWorkspaceHandle; blocking?: string[] }) {
  const { held, draft } = admin;
  const blocked = draft.enabled && blocking.length > 0;

  if (held === null) {
    return (
      <section className={styles.card} data-admin-workspace-settings="">
        <h2 id="admin-workspace" className={styles.heading}>{t('Admin workspace')}</h2>
        <p className={styles.note}>{admin.failure ?? t('Reading…')}</p>
      </section>
    );
  }

  return (
    <section className={styles.card} data-admin-workspace-settings="">
      <h2 id="admin-workspace" className={styles.heading}>
        {t('Admin workspace')}
        <FieldHint label={t('Admin workspace')}>
          {t('Its agents may read the workspaces it reaches, and the admin pages switched on below. Read only, and seen by administrators alone.')}
        </FieldHint>
      </h2>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.enabled}
          data-admin-workspace-switch=""
          onChange={(event) => admin.edit({ enabled: event.target.checked })}
        />
        {t('Admin workspace')}
      </label>

      {draft.enabled && (
        <>
          <fieldset className={styles.group}>
            <legend className={styles.label}>{t('Reach')}</legend>
            <div className={styles.options}>
              <label className={styles.check}>
                <input
                  type="radio"
                  name="admin-workspace-reach"
                  checked={draft.reachAll}
                  data-admin-workspace-reach="all"
                  onChange={() => admin.edit({ reachAll: true })}
                />
                {t('Every workspace')}
              </label>
              <label className={styles.check}>
                <input
                  type="radio"
                  name="admin-workspace-reach"
                  checked={!draft.reachAll}
                  data-admin-workspace-reach="chosen"
                  onChange={() => admin.edit({ reachAll: false })}
                />
                {t('Chosen workspaces')}
              </label>
            </div>
            {!draft.reachAll && (
              <div className={styles.choices}>
                {admin.others.map((other) => (
                  <label key={other.id} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.reach.includes(other.id)}
                      data-admin-workspace-reaches={other.name}
                      onChange={(event) => admin.edit({ reach: toggled(draft.reach, other.id, event.target.checked) })}
                    />
                    {other.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.label}>{t('May read')}</legend>
            <div className={styles.choices}>
              {ADMIN_WORKSPACE_SCOPES.map((scope) => (
                <label key={scope} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={draft.scopes.includes(scope)}
                    data-admin-workspace-scope={scope}
                    onChange={(event) => admin.edit({ scopes: toggled(draft.scopes, scope, event.target.checked) })}
                  />
                  {scopeLabel(scope)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.labelRow}>
              <span className={styles.label}>{t('Admin tools')}</span>
              <FieldHint label={t('Admin tools')}>
                {t('Each is a tool its agents may call to read that admin page. Nothing here changes a role, a user or a plugin.')}
              </FieldHint>
            </legend>
            <div className={styles.choices}>
              {ADMIN_WORKSPACE_TOOLS.map((tool) => (
                <label key={tool} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={draft.tools.includes(tool)}
                    data-admin-workspace-tool={tool}
                    onChange={(event) => admin.edit({ tools: toggled(draft.tools, tool, event.target.checked) })}
                  />
                  {toolLabel(tool)}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {blocked && admin.failure === null && (
        <p className={styles.caution} role="alert" data-admin-workspace-blocked="">
          {tf('Take {roles} off this workspace first: only installation administrators may open an admin workspace.', {
            roles: blocking.join(', '),
          })}
        </p>
      )}
      {admin.failure !== null && <p className={styles.error} role="alert" data-admin-workspace-failure="">{admin.failure}</p>}
    </section>
  );
}
