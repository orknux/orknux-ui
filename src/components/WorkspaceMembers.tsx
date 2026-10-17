import { useEffect, useState } from 'react';

import { fetchWorkspaceMembers, setWorkspaceMemberRole } from '../api/workspaces';
import type { WorkspaceMember, WorkspaceMemberRole } from '../api/workspaces';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import { FieldHint } from './FieldHint';
import { Loader } from './Loader';
import styles from './WorkspaceMembers.module.css';
import { t, tf } from '../i18n';

export interface WorkspaceMembersProps {
  workspaceId: string;
}

/**
 * Who is in this workspace, and which of them may change its settings.
 *
 * Who is in it is decided by roles, in Admin > Roles, and only read here. What
 * is chosen here is the one thing a workspace decides about its own people: a
 * member is a user, or a workspace admin who can open this page. An
 * installation administrator administers everywhere and is shown fixed.
 */
export function WorkspaceMembers({ workspaceId }: WorkspaceMembersProps) {
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the members.')));
  }, [workspaceId]);

  async function choose(member: WorkspaceMember, role: WorkspaceMemberRole) {
    setBusy(member.username);
    setError(null);
    try {
      const changed = await setWorkspaceMemberRole(workspaceId, member.username, role);
      setMembers((held) => held?.map((one) => (one.username === changed.username ? changed : one)) ?? null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not change the role.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.card} data-testid="workspace-members">
      <div className={styles.heading}>
        <h2 id="members" className={styles.title}>{t('Members')}</h2>
        <FieldHint label={t('Members')}>
          {t('Everybody whose roles open this workspace. A workspace admin can change its settings; who opens it is still decided by roles in Admin > Roles.')}
        </FieldHint>
      </div>

      {members === null && error === null && <Loader />}
      {error !== null && <p className={styles.error} role="alert">{error}</p>}

      {members !== null && (
        <div className={styles.tableBox}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('User')}</th>
                <th>{t('Opens it through')}</th>
                <th className={styles.roleHead}>{t('Role here')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.username} data-testid="workspace-member" data-username={member.username}>
                  <td>
                    <span className={styles.person}>
                      <span className={styles.name}>{member.displayName}</span>
                      <span className={styles.detail}>
                        {member.userType === 'EXTERNAL' ? tf('{username} · directory', { username: member.username }) : member.username}
                      </span>
                    </span>
                  </td>
                  <td className={styles.through}>{member.through.join(', ')}</td>
                  <td>
                    {member.fixed ? (
                      <span className={styles.fixed} data-member-role="fixed">{t('Installation admin')}</span>
                    ) : (
                      <span className={styles.pickerBox}>
                        <select
                          className={member.role === 'ADMIN' ? `${styles.picker} ${styles.pickerAdmin}` : styles.picker}
                          value={member.role}
                          disabled={busy !== null}
                          aria-label={tf('Role of {name} here', { name: member.displayName })}
                          data-member-role={member.role}
                          onChange={(event) => void choose(member, event.target.value as WorkspaceMemberRole)}
                        >
                          <option value="USER">{t('User')}</option>
                          <option value="ADMIN">{t('Workspace admin')}</option>
                        </select>
                        <img className={styles.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
