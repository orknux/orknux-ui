import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { deleteResearch, fetchResearch } from '../../api/research';
import type { Research, ResearchSource, ResearchStage, ResearchStatus } from '../../api/research';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import checkIcon from '../../assets/check.svg';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { BackLink } from '../../components/BackLink';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import { languageLabel, seededLabel, stageLabel, statusLabel, stepLabel } from './researchLabels';
import styles from './ResearchDetailPage.module.css';
import { t } from '../../i18n';

export interface ResearchDetailPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const STATUS_CLASS: Record<ResearchStatus, string> = {
  RUNNING: styles.running,
  COMPLETED: styles.completed,
  FAILED: styles.failed,
  STOPPED: styles.stopped,
};

/** The steps of a mode's workflow, in the order it takes them. */
const STAGES: ResearchStage[] = ['PLAN', 'GATHER', 'FOLLOW_UP', 'WRITE', 'SAVE'];

/** Where one step stands: taken, being taken, where the research stopped, or still ahead. */
type StageState = 'done' | 'current' | 'failed' | 'waiting';

/**
 * Each step's state, read off the step the research last said it was in and
 * how it ended. A finished research took every step; one that failed or was
 * stopped stopped at the step it was in.
 */
function stagesOf(research: Research): StageState[] {
  if (research.status === 'COMPLETED') return STAGES.map(() => 'done');
  const at = research.progress?.stage == null ? -1 : STAGES.indexOf(research.progress.stage);
  return STAGES.map((_, index) => {
    if (index < at) return 'done';
    if (index > at) return 'waiting';
    return research.status === 'RUNNING' ? 'current' : 'failed';
  });
}

/** Where a source was read: a website's host, or the Artifacts page for a document. */
function hostOf(source: ResearchSource): string {
  if (source.kind === 'DOCUMENT') return t('Artifacts');
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
}

/**
 * Explore > Research, one research: its own page, opened from the list or
 * straight after it was started. Issue #659.
 *
 * A summary of what was asked and how, the five steps of its workflow drawn in
 * order with the one it is in, the sub-questions and the sources it read, and
 * the report it came to - as the document it is or as the PDF it was laid out
 * as. Nothing from the list: the way back is the Back link.
 */
export function ResearchDetailPage({ session, onSignOut }: ResearchDetailPageProps) {
  const { workspaceId = '', researchId = '' } = useParams();
  const navigate = useNavigate();
  const [research, setResearch] = useState<Research | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const listPath = `/workspace/${workspaceId}/explore/research`;

  const load = useCallback(() => {
    if (researchId === '') return;
    fetchResearch(researchId)
      .then((found) => {
        setResearch(found);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load research.')));
  }, [researchId]);

  useEffect(load, [load]);

  const running = research?.status === 'RUNNING';

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={styles.page} data-opened={research?.id ?? researchId}>
        <header className={styles.header}>
          <p className={styles.breadcrumb}>
            <BackLink to={listPath} label={t('Research')} />
            <Link className={styles.crumbLink} to={listPath}>
              {t('Research')}
            </Link>
            <span className={styles.crumbSeparator}>/</span>
            <span className={styles.crumbCurrent}>#{researchId}</span>
          </p>

          <div className={styles.titleRow}>
            <h1 className={styles.title} title={research?.question} data-research-title>
              {research?.question ?? '…'}
            </h1>
            <div className={styles.actions}>
              <AutoRefresh onRefresh={load} defaultSeconds={5} settled={research !== null && !running} />
              {research?.executionId != null && (
                <Link className={styles.button} to={`/workspace/${workspaceId}/executions/${research.executionId}`} data-open-run>
                  {t('Open the run')}
                </Link>
              )}
              {research !== null && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setRemoving(true)}
                  aria-label={t('Remove')}
                  title={t('Remove')}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>

          {research !== null && <Summary research={research} workspaceId={workspaceId} />}
        </header>

        {error !== null && <p className={styles.errorLine} role="alert">{error}</p>}
        {research === null && error === null && <Loader />}

        {research !== null && (
          <>
            {research.error !== null && <p className={styles.errorBox} role="alert">{research.error}</p>}
            <Progress research={research} />
            <Given research={research} />
            <div className={styles.columns}>
              <SubQuestions research={research} />
              <Sources research={research} />
            </div>
            {research.status === 'COMPLETED' && <Report research={research} workspaceId={workspaceId} />}
          </>
        )}
      </div>

      <ConfirmDialog
        subject={removing ? (research?.question ?? null) : null}
        kind="remove"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          if (research === null) return;
          await deleteResearch(research.id);
          setRemoving(false);
          navigate(listPath);
        }}
      />
    </AppShell>
  );
}

/** What was asked and how: its state, mode, model, language, output and when it started. */
function Summary({ research, workspaceId }: { research: Research; workspaceId: string }) {
  return (
    <dl className={styles.summary} data-summary>
      <div className={styles.summaryItem}>
        <dt>{t('Status')}</dt>
        <dd className={styles.statusCell}>
          <span className={`${styles.status} ${STATUS_CLASS[research.status]}`} data-status={research.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            {statusLabel(research.status)}
          </span>
          {/* Working, said beside the state rather than in front of what it is reading. */}
          {research.status === 'RUNNING' && (
            <span className={styles.working} data-working>
              <Loader label="" size={16} delay={0} />
            </span>
          )}
        </dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Mode')}</dt>
        <dd>{seededLabel(research.modeName)}</dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Model')}</dt>
        <dd data-research-model>
          {research.modelId === null ? (
            research.modelName ?? '—'
          ) : (
            <Link className={styles.link} to={`/workspace/${workspaceId}/models/${research.modelId}`} data-model-link>
              {research.modelName ?? research.modelId}
            </Link>
          )}
        </dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Language')}</dt>
        <dd>{languageLabel(research.language)}</dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Output')}</dt>
        <dd>{research.outputFormat === 'PDF' ? 'PDF' : t('Document')}</dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Started')}</dt>
        <dd title={research.startedAt}>{timeAgo(research.startedAt)}</dd>
      </div>
    </dl>
  );
}

/** The five steps in order, with the one it is in, what it is doing now, and how much it has searched and read. */
function Progress({ research }: { research: Research }) {
  const states = stagesOf(research);
  const progress = research.progress;
  const running = research.status === 'RUNNING';
  return (
    <section className={styles.card} aria-label={t('Progress')} data-progress>
      <h2 className={styles.cardTitle}>{t('Progress')}</h2>
      <ol className={styles.stages} data-stages>
        {STAGES.map((stage, index) => (
          <li key={stage} className={`${styles.stage} ${styles[`stage_${states[index]}`]}`} data-stage-step={stage} data-state={states[index]}>
            <span className={styles.marker} aria-hidden="true">
              {states[index] === 'done' ? <img src={checkIcon} alt="" width={12} height={12} /> : index + 1}
            </span>
            <span className={styles.stageName}>{stepLabel(stage)}</span>
          </li>
        ))}
      </ol>

      {running && progress !== null && (
        <p className={styles.now}>
          {progress.stage !== null && (
            <span className={styles.nowStage} data-stage={progress.stage}>
              {stageLabel(progress.stage)}
            </span>
          )}
          <span className={styles.nowStep} data-step title={progress.step}>
            {progress.step}
          </span>
        </p>
      )}

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>{t('Searches')}</dt>
          <dd data-stat="searches">{progress?.searched.length ?? 0}</dd>
        </div>
        <div className={styles.stat}>
          <dt>{t('Sources read')}</dt>
          <dd data-stat="sources">{progress?.sourcesRead ?? 0}</dd>
        </div>
        <div className={styles.stat}>
          <dt>{t('Level')}</dt>
          <dd data-stat="level">{progress?.level ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}

/** What it was told to read and to leave alone, where it was told anything. */
function Given({ research }: { research: Research }) {
  const lists: Array<[string, string[]]> = [
    [t('Websites to use'), research.websitesInclude],
    [t('Websites to avoid'), research.websitesExclude],
    [t('Documents to use'), research.documentsInclude],
    [t('Documents to avoid'), research.documentsExclude],
  ];
  const told = lists.filter(([, values]) => values.length > 0);
  if (told.length === 0 && research.useWebSearch) return null;
  return (
    <section className={styles.card} aria-label={t('What it was given')}>
      <h2 className={styles.cardTitle}>{t('What it was given')}</h2>
      <dl className={styles.given}>
        {!research.useWebSearch && (
          <div className={styles.givenRow}>
            <dt>{t('Web search')}</dt>
            <dd data-web-search-off>{t('Off')}</dd>
          </div>
        )}
        {told.map(([label, values]) => (
          <div key={label} className={styles.givenRow}>
            <dt>{label}</dt>
            <dd>
              <ul className={styles.chips}>
                {values.map((value) => (
                  <li key={value} className={styles.chip}>{value}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The queries the question was broken into. */
function SubQuestions({ research }: { research: Research }) {
  const parts = research.progress?.subQuestions ?? [];
  return (
    <section className={styles.card} aria-label={t('Sub-questions')}>
      <h2 className={styles.cardTitle}>
        {t('Sub-questions')}
        <span className={styles.count}>{parts.length}</span>
      </h2>
      {parts.length === 0 ? (
        <p className={styles.empty}>—</p>
      ) : (
        <ol className={styles.subQuestions} data-sub-questions>
          {parts.map((one) => (
            <li key={one}>{one}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The sources read, numbered as the report cites them. */
function Sources({ research }: { research: Research }) {
  return (
    <section className={styles.card} aria-label={t('Sources')}>
      <h2 className={styles.cardTitle}>
        {t('Sources')}
        <span className={styles.count}>{research.sources.length}</span>
      </h2>
      {research.sources.length === 0 ? (
        <p className={styles.empty}>—</p>
      ) : (
        <ol className={styles.sources} data-sources>
          {research.sources.map((source) => (
            <li key={source.number} value={source.number} className={styles.source} data-source={source.number} title={source.notes}>
              <span className={styles.sourceNumber} aria-hidden="true">{source.number}</span>
              <span className={styles.sourceBody}>
                <a className={styles.sourceTitle} href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.title}
                </a>
                <span className={styles.sourceMeta}>
                  <span className={styles.sourceHost} data-source-host>{hostOf(source)}</span>
                  <span className={styles.kind} data-source-kind={source.kind}>
                    {source.kind === 'DOCUMENT' ? t('Document') : t('Web')}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The report: the file to download, where it is kept, and the report itself. */
function Report({ research, workspaceId }: { research: Research; workspaceId: string }) {
  return (
    <section className={styles.card} aria-label={t('Report')} data-report>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('Report')}</h2>
        <div className={styles.actions}>
          {research.fileUrl !== null && (
            <a className={styles.button} href={research.fileUrl} download={research.fileName ?? undefined} title={research.fileName ?? undefined}>
              {t('Download')}
            </a>
          )}
          {/* Already kept there by the research's Save step; this says so and goes to it. */}
          {research.artifactId !== null && (
            <Link className={styles.button} to={`/workspace/${workspaceId}/artifacts/${research.artifactId}`} data-research-artifact>
              {t('Open in Artifacts')}
            </Link>
          )}
        </div>
      </div>
      {research.outputFormat === 'PDF' && research.previewUrl !== null ? (
        <iframe className={styles.pdf} src={research.previewUrl} title={research.fileName ?? t('Report')} />
      ) : (
        research.result != null && (
          <article className={styles.document}>
            <Markdown>{research.result}</Markdown>
          </article>
        )
      )}
    </section>
  );
}
