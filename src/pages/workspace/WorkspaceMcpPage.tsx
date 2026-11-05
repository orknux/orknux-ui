import { useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { AppShell } from '../../components/AppShell';
import { McpClients } from '../../components/McpClients';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './WorkspaceMcpPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceMcpPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * Admin -> MCP, held to one workspace: the AI clients that reach it over MCP
 * and what they called. For somebody who administers the workspace, as the
 * server decides - it names people and their addresses.
 */
export function WorkspaceMcpPage({ session, onSignOut }: WorkspaceMcpPageProps) {
  const { workspaceId = '' } = useParams();
  return (
    <AppShell
      scrollContent
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('MCP')}</h1>
        <p className={styles.subtitle}>
          {t('The AI clients connected to this workspace over MCP: who, from which address and host, and every call they made.')}
        </p>
      </header>
      {workspaceId !== '' && <McpClients workspaceId={workspaceId} />}
    </AppShell>
  );
}
