import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import { deleteResearch, fetchResearch, fetchResearches } from '../../api/research';
import type { Research, ResearchStatus } from '../../api/research';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { CompactPagination } from '../../components/CompactPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import { NewResearchDialog } from './NewResearchDialog';
import { languageLabel, seededLabel, stageLabel, statusLabel } from './researchLabels';
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
 * Answer > Research: the research this workspace has done, the one opened, and
 * starting another. Issue #659.
 *
 * A research is a question handed to one of the workspace's own workflows - the
 * mode chosen is which - and what comes back is a report, shown here as the
 * document it is or as the PDF it was laid out as. The list follows a research
 * while it runs; opening one reads its report.
 */
export function ResearchPage({ session, onSignOut }: ResearchPageProps) {
  const { workspaceId = '', researchId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<PageOf<Research> | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('research');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [opened, setOpened] = useState<Research | null>(null);
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

  const loadOpened = useCallback(() => {
    if (researchId === undefined) {
      setOpened(null);
      return;
    }
    fetchResearch(researchId)
      .then((found) => setOpened(found))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load research.')));
  }, [researchId]);

  useEffect(loadOpened, [loadOpened]);

  const running = (list?.content ?? []).some((one) => one.status === 'RUNNING') || opened?.status === 'RUNNING';

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
            onRefresh={() => {
              load();
              loadOpened();
            }}
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

      {opened !== null && (
        <OpenedResearch
          research={opened}
          workspaceId={workspaceId}
          onClose={() => navigate(`/workspace/${workspaceId}/analysis/research`)}
        />
      )}

      <section className={table.card} aria-label={t('Research')}>
        <div className={table.tableHeader}>
          <span className={styles.colQuestion}>{t('Question')}</span>
          <span className={styles.colMode}>{t('Mode')}</span>
          <span className={styles.colModel}>{t('Model')}</span>
          <span className={styles.colStatus}>{t('Status')}</span>
          <span className={styles.colStarted}>{t('Started')}</span>
          <span className={styles.colResult}>{t('Result')}</span>
          <span className={styles.colActions} />
        </div>

        {list === null && error === null && <p className={styles.notice}><Loader /></p>}
        {list !== null && list.content.length === 0 && <p className={styles.notice}>{t('No research yet.')}</p>}

        {list?.content.map((one) => (
          <div key={one.id} className={`${table.row} ${styles.row}`} data-research={one.id}>
            <Link className={`${styles.colQuestion} ${styles.question}`} to={`/workspace/${workspaceId}/analysis/research/${one.id}`} title={one.question}>
              {one.question}
            </Link>
            <span className={styles.colMode}>{seededLabel(one.modeName)}</span>
            <span className={`${styles.colModel} ${styles.muted}`}>{one.modelName ?? '—'}</span>
            <span className={styles.colStatus}>
              <span className={`${styles.status} ${STATUS_CLASS[one.status]}`} title={one.error ?? undefined}>
                {statusLabel(one.status)}
              </span>
            </span>
            <span className={`${styles.colStarted} ${styles.muted}`} title={one.startedAt}>
              {timeAgo(one.startedAt)}
            </span>
            <span className={styles.colResult}>
              {one.status === 'COMPLETED' ? (
                <Link to={`/workspace/${workspaceId}/analysis/research/${one.id}`}>
                  {one.outputFormat === 'PDF' ? t('PDF') : t('Document')}
                </Link>
              ) : one.status === 'RUNNING' && one.progress !== null ? (
                <span className={styles.muted} title={one.progress.step} data-row-progress>
                  {tf('{count} sources', { count: one.progress.sourcesRead })}
                </span>
              ) : one.executionId !== null ? (
                <Link to={`/workspace/${workspaceId}/executions/${one.executionId}`}>{t('Run')}</Link>
              ) : (
                <span className={styles.muted}>—</span>
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
        onStarted={() => {
          setStarting(false);
          setPage(1);
          load();
        }}
      />

      <ConfirmDialog
        subject={removing?.question ?? null}
        kind="remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteResearch(removing.id);
          if (opened?.id === removing.id) navigate(`/workspace/${workspaceId}/analysis/research`);
          setRemoving(null);
          load();
        }}
      />
    </AppShell>
  );
}

/** One research opened: what was asked, and the report it came to. */
function OpenedResearch({ research, workspaceId, onClose }: { research: Research; workspaceId: string; onClose: () => void }) {
  return (
    <section className={styles.opened} aria-label={t('Research')} data-opened={research.id}>
      <header className={styles.openedHeader}>
        <h2 className={styles.openedTitle}>{research.question}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('Close')} title={t('Close')}>
          ×
        </button>
      </header>

      <dl className={styles.facts}>
        <dt>{t('Mode')}</dt>
        <dd>{seededLabel(research.modeName)}</dd>
        <dt>{t('Model')}</dt>
        <dd data-research-model>{research.modelName ?? '—'}</dd>
        <dt>{t('Language')}</dt>
        <dd>{languageLabel(research.language)}</dd>
        <dt>{t('Status')}</dt>
        <dd>
          <span className={`${styles.status} ${STATUS_CLASS[research.status]}`}>{statusLabel(research.status)}</span>
          {research.executionId !== null && (
            <>
              {' '}
              <Link to={`/workspace/${workspaceId}/executions/${research.executionId}`}>{t('Open the run')}</Link>
            </>
          )}
        </dd>
        {!research.useWebSearch && (
          <>
            <dt>{t('Web search')}</dt>
            <dd data-web-search-off>{t('Off')}</dd>
          </>
        )}
        {research.websitesInclude.length > 0 && (
          <>
            <dt>{t('Websites to use')}</dt>
            <dd>{research.websitesInclude.join(', ')}</dd>
          </>
        )}
        {research.websitesExclude.length > 0 && (
          <>
            <dt>{t('Websites to avoid')}</dt>
            <dd>{research.websitesExclude.join(', ')}</dd>
          </>
        )}
        {research.documentsInclude.length > 0 && (
          <>
            <dt>{t('Documents to use')}</dt>
            <dd>{research.documentsInclude.join(', ')}</dd>
          </>
        )}
        {research.documentsExclude.length > 0 && (
          <>
            <dt>{t('Documents to avoid')}</dt>
            <dd>{research.documentsExclude.join(', ')}</dd>
          </>
        )}
      </dl>

      {research.error !== null && <p className={styles.errorLine} role="alert">{research.error}</p>}

      {research.progress !== null && (
        <div className={styles.progress} data-progress>
          {research.status === 'RUNNING' && (
            <p className={styles.step} data-step>
              <Loader /> {research.progress.step}
            </p>
          )}
          <dl className={styles.facts}>
            {research.progress.stage !== null && (
              <>
                <dt>{t('Step')}</dt>
                <dd data-stage={research.progress.stage}>{stageLabel(research.progress.stage)}</dd>
              </>
            )}
            <dt>{t('Level')}</dt>
            <dd>{research.progress.level}</dd>
            <dt>{t('Searches')}</dt>
            <dd>{research.progress.searched.length}</dd>
            <dt>{t('Sources read')}</dt>
            <dd>{research.progress.sourcesRead}</dd>
          </dl>
          {research.progress.subQuestions.length > 0 && (
            <>
              <h3 className={styles.subheading}>{t('Sub-questions')}</h3>
              <ol className={styles.subQuestions} data-sub-questions>
                {research.progress.subQuestions.map((one) => (
                  <li key={one}>{one}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {research.sources.length > 0 && (
        <>
          <h3 className={styles.subheading}>{t('Sources')}</h3>
          <ol className={styles.sources} data-sources>
            {research.sources.map((source) => (
              <li key={source.number} value={source.number} title={source.notes}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a>
                {source.kind === 'DOCUMENT' && <span className={styles.muted}> · {t('Document')}</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      {research.status === 'COMPLETED' && (
        <div className={styles.report}>
          {research.fileUrl !== null && (
            <a className={styles.download} href={research.fileUrl} download={research.fileName ?? undefined}>
              {t('Download')} {research.fileName}
            </a>
          )}
          {research.outputFormat === 'PDF' && research.previewUrl !== null ? (
            <iframe className={styles.pdf} src={research.previewUrl} title={research.fileName ?? t('Report')} />
          ) : (
            research.result != null && (
              <article className={styles.document}>
                <Markdown>{research.result}</Markdown>
              </article>
            )
          )}
        </div>
      )}
    </section>
  );
}
