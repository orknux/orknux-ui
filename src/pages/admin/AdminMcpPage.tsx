import type { SessionUser } from '../../api/session';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { McpClients } from '../../components/McpClients';
import { McpConnect } from '../../components/McpConnect';
import { useLastWorkspaceId } from '../../session/lastWorkspace';
import { shellUser } from '../../session/user';
import styles from './AdminMcpPage.module.css';
import { t } from '../../i18n';

export interface AdminMcpPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** Every MCP client that reaches this installation: who, from where, and what it called, in every workspace. */
export function AdminMcpPage({ session, onSignOut }: AdminMcpPageProps) {
  // An MCP address is a workspace's, and this page names none: the one last looked at, as the corner button uses.
  const workspaceId = useLastWorkspaceId();
  return (
    <AppShell scrollContent user={shellUser(session)} onSignOut={onSignOut} sidebar={<AdminSidebar active="mcp" />}>
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('MCP')}</h1>
        <p className={styles.subtitle}>
          {t('The AI clients connected to this installation over MCP, in every workspace: who, from which address and host, and every call they made.')}
        </p>
        {workspaceId !== null && (
          <p className={styles.subtitle}>
            <McpConnect workspacePath={`/workspace/${workspaceId}`} admin asLink />
          </p>
        )}
      </header>
      <McpClients workspaceId={null} />
    </AppShell>
  );
}
