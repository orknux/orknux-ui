import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { fetchDependencyGraph } from '../../api/dependencyGraph';
import type { DependencyGraph } from '../../api/dependencyGraph';
import type { SessionUser } from '../../api/session';
import searchIcon from '../../assets/search.svg';
import { AppShell } from '../../components/AppShell';
import { DependencyGraphCanvas, DependencySelection, narrowed } from '../../components/DependencyGraphCanvas';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './WorkspaceDependenciesPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceDependenciesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** A workspace's parts and what uses what, drawn as one graph. */
export function WorkspaceDependenciesPage({ session, onSignOut }: WorkspaceDependenciesPageProps) {
  const { workspaceId = '' } = useParams();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hideUnused, setHideUnused] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === '') return;
    setGraph(null);
    setError(null);
    setSelectedKey(null);
    fetchDependencyGraph(workspaceId)
      .then(setGraph)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the dependencies.')));
  }, [workspaceId]);

  const shown = useMemo(() => {
    if (graph === null || !hideUnused) return graph;
    return narrowed(graph, new Set(graph.edges.flatMap((edge) => [edge.from, edge.to])));
  }, [graph, hideUnused]);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('Dependencies')}</h1>
        <p className={styles.subtitle}>{t('What uses what in this workspace')}</p>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.searchInput}>
          <img src={searchIcon} alt="" width={14} height={14} />
          <input
            className={styles.searchField}
            type="search"
            placeholder={t('Search by name...')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('Search the dependencies')}
          />
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={hideUnused} onChange={(event) => setHideUnused(event.target.checked)} />
          {t('Hide unconnected')}
        </label>
        {graph !== null && (
          <DependencySelection graph={graph} workspaceId={workspaceId} selectedKey={selectedKey} className={styles.selectionAside} />
        )}
      </div>

      {error !== null && <p className={styles.notice}>{error}</p>}
      {error === null && graph === null && (
        <p className={styles.notice}>
          <Loader />
        </p>
      )}
      {graph !== null && graph.nodes.length === 0 && <p className={styles.notice}>{t('Nothing in this workspace yet.')}</p>}
      {shown !== null && shown.nodes.length > 0 && (
        <DependencyGraphCanvas
          graph={shown}
          workspaceId={workspaceId}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          search={search}
        />
      )}
    </AppShell>
  );
}
