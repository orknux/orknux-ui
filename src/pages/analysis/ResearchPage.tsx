import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import { deleteResearch, fetchResearches } from '../../api/research';
import type { Research, ResearchStatus } from '../../api/research';
import type { SessionUser } from '../../api/session';
import { formatDuration } from '../../api/executions';
import { timeAgo } from '../../api/tools';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { CompactPagination } from '../../components/CompactPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import { NewResearchDialog } from './NewResearchDialog';
import { seededLabel, statusLabel } from './researchLabels';
import styles from './ResearchPage.module.css';
import { t, tf } from '../../i18n';

export interface ResearchPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const STATUS_CLASS: Record<ResearchStatus, string> = {
  RUNNING: styles.running,
  COMPLETED: styles.completed,
  FAILED: styles.failed,
  STOPPED: styles.stopped,
};

/**
 * Explore > Research: the research this workspace has done, and starting
 * another. Issue #659.
 *
 * A research is a question handed to one of the workspace's own workflows - the
 * mode chosen is which - and what comes back is a report. The list follows a
 * research while it runs; opening one goes to its own page,
 * [ResearchDetailPage], where its progress and its report are read.
 */
export function ResearchPage({ session, onSignOut }: ResearchPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<PageOf<Research> | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('research');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [removing, setRemoving] = useState<Research | null>(null);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    fetchResearches(workspaceId, page - 1, pageSize)
      .then((found) => {
        setList(found);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load research.')));
  }, [workspaceId, page, pageSize]);

  useEffect(load, [load]);

  const running = (list?.content ?? []).some((one) => one.status === 'RUNNING');

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={table.header}>
        <div className={table.titleGroup}>
          <h1 className={table.title}>{t('Research')}</h1>
          <p className={table.subtitle}>{t('Questions researched by this workspace’s own workflows.')}</p>
        </div>
        <div className={styles.headerActions}>
          <AutoRefresh
            onRefresh={load}
            defaultSeconds={5}
            settled={!running}
          />
          <button type="button" className={table.createButton} onClick={() => setStarting(true)}>
            <span aria-hidden="true">+ </span>
            {t('New research')}
          </button>
        </div>
      </header>

      {error !== null && <p className={table.pageError}>{error}</p>}

      <section className={table.card} aria-label={t('Research')}>
        <div className={table.tableHeader}>
          <span className={styles.colQuestion}>{t('Question')}</span>
          <span className={styles.colMode}>{t('Mode')}</span>
          <span className={styles.colModel}>{t('Model')}</span>
          <span className={styles.colStatus}>{t('Status')}</span>
          <span className={styles.colRounds}>{t('Search rounds')}</span>
          <span className={styles.colStarted}>{t('Started')}</span>
          <span className={styles.colTook}>{t('Took')}</span>
          <span className={styles.colResult}>{t('Result')}</span>
          <span className={styles.colActions}>{t('Actions')}</span>
        </div>

        {list === null && error === null && <p className={styles.notice}><Loader /></p>}
        {list !== null && list.content.length === 0 && <p className={styles.notice}>{t('No research yet.')}</p>}

        {list?.content.map((one) => (
          <div key={one.id} className={`${table.row} ${styles.row}`} data-research={one.id}>
            <Link className={`${styles.colQuestion} ${styles.question}`} to={`/workspace/${workspaceId}/explore/research/${one.id}`} title={one.question} data-cell="question">
              {one.question}
            </Link>
            <span className={`${styles.colMode} ${styles.cell}`} data-cell="mode">{seededLabel(one.modeName)}</span>
            <span className={`${styles.colModel} ${styles.cell}`} data-cell="model">
              <ModelName research={one} workspaceId={workspaceId} />
            </span>
            <span className={styles.colStatus} data-cell="status">
              <span className={`${styles.status} ${STATUS_CLASS[one.status]}`} title={one.error ?? undefined}>
                <span className={styles.statusDot} aria-hidden="true" />
                {statusLabel(one.status)}
              </span>
            </span>
            <span className={`${styles.colRounds} ${styles.cell}`} data-cell="rounds">{one.progress?.level ?? '—'}</span>
            <span className={`${styles.colStarted} ${styles.cell}`} title={one.startedAt} data-cell="started">
              {timeAgo(one.startedAt)}
            </span>
            <span className={`${styles.colTook} ${styles.cell}`} data-cell="took">
              {one.finishedAt === null
                ? '—'
                : formatDuration(Math.max(0, Math.round((Date.parse(one.finishedAt) - Date.parse(one.startedAt)) / 1000)))}
            </span>
            <span className={`${styles.colResult} ${styles.cell}`} data-cell="result">
              {one.status === 'COMPLETED' ? (
                <Link className={styles.cellLink} to={`/workspace/${workspaceId}/explore/research/${one.id}`}>
                  {one.outputFormat === 'PDF' ? t('PDF') : t('Document')}
                </Link>
              ) : one.status === 'RUNNING' && one.progress !== null ? (
                <span title={one.progress.step} data-row-progress>
                  {tf('{count} sources', { count: one.progress.sourcesRead })}
                </span>
              ) : one.executionId !== null ? (
                <Link className={styles.cellLink} to={`/workspace/${workspaceId}/executions/${one.executionId}`}>{t('Run')}</Link>
              ) : (
                '—'
              )}
            </span>
            <span className={styles.colActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setRemoving(one)}
                aria-label={t('Remove')}
                title={t('Remove')}
              >
                <TrashIcon />
              </button>
            </span>
          </div>
        ))}

        <CompactPagination
          page={page}
          pageSize={pageSize}
          totalItems={list?.totalElements ?? 0}
          unit="research"
          onPageChange={setPage}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(chosen) => {
            setPageSize(chosen);
            setPage(1);
          }}
        />
      </section>

      <NewResearchDialog
        open={starting}
        workspaceId={workspaceId}
        onClose={() => setStarting(false)}
        onStarted={(started) => {
          setStarting(false);
          setPage(1);
          load();
          // Straight to the research just started, where its progress is shown.
          navigate(`/workspace/${workspaceId}/explore/research/${started.id}`);
        }}
      />

      <ConfirmDialog
        subject={removing?.question ?? null}
        kind="remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteResearch(removing.id);
          setRemoving(null);
          load();
        }}
      />
    </AppShell>
  );
}

/**
 * The model a research was started with, as a way to its page - the way an
 * agent's or a node's model is. Plain where the research names none.
 */
function ModelName({ research, workspaceId }: { research: Research; workspaceId: string }) {
  if (research.modelId === null) return <>{research.modelName ?? '—'}</>;
  return (
    <Link className={styles.cellLink} to={`/workspace/${workspaceId}/models/${research.modelId}`} data-model-link>
      {research.modelName ?? research.modelId}
    </Link>
  );
}
