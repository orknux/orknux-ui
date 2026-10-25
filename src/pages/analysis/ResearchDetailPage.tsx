import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { deleteResearch, fetchResearch, restartResearch, startFollowUpResearch } from '../../api/research';
import type { Research, ResearchImage, ResearchStage, ResearchStatus } from '../../api/research';
import type { SessionUser } from '../../api/session';
import { formatDuration } from '../../api/executions';
import { timeAgo } from '../../api/tools';
import checkIcon from '../../assets/check.svg';
import rotateIcon from '../../assets/rotate-cw.svg';
import { AppShell } from '../../components/AppShell';
import { AttachmentViewer } from '../../components/AttachmentViewer';
import { AutoRefresh } from '../../components/AutoRefresh';
import { BackLink } from '../../components/BackLink';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { PdfReader } from '../../components/PdfReader';
import { TrashIcon } from '../../components/TrashIcon';
import { roughly } from '../../components/timeLeft';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import { issueLabel, languageLabel, seededLabel, stageLabel, statusLabel, stepLabel } from './researchLabels';
import styles from './ResearchDetailPage.module.css';
import { t, tf } from '../../i18n';

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
const STAGES: ResearchStage[] = ['PLAN', 'GATHER', 'FOLLOW_UP', 'WRITE', 'REVIEW', 'SAVE'];

/** Where one step stands: taken, being taken, where the research stopped, still ahead, or not asked for. */
type StageState = 'done' | 'current' | 'failed' | 'waiting' | 'skipped';

/**
 * Each step's state, read off the step the research last said it was in and
 * how it ended. A finished research took every step; one that failed or was
 * stopped stopped at the step it was in.
 */
function stagesOf(research: Research): StageState[] {
  // Review is a step only of a research that asked for one; any other goes past it.
  const asked = (stage: ResearchStage) => stage !== 'REVIEW' || research.review;
  if (research.status === 'COMPLETED') return STAGES.map((stage) => (asked(stage) ? 'done' : 'skipped'));
  const at = research.progress?.stage == null ? -1 : STAGES.indexOf(research.progress.stage);
  return STAGES.map((stage, index) => {
    if (!asked(stage)) return 'skipped';
    if (index < at) return 'done';
    if (index > at) return 'waiting';
    return research.status === 'RUNNING' ? 'current' : 'failed';
  });
}

/** Where a source was read: a website's host, or the Artifacts page for a document. */
function hostOf(source: { url: string; kind: string }): string {
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
  /** The restart being asked about: from a stage, or from where it stopped when that is null. */
  const [restarting, setRestarting] = useState<{ stage: ResearchStage | null; label: string } | null>(null);
  /** The follow-up question somebody is being asked to confirm a research on. */
  const [following, setFollowing] = useState<string | null>(null);
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
  const restartable = research?.status === 'FAILED' || research?.status === 'STOPPED';
  /** Where a restart without a stage begins: the step it stopped at, as the strip names it. */
  const stoppedAt = research?.progress?.stage ?? null;

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
              {/* From the step it failed or stopped at, keeping every step before it. */}
              {restartable && research !== null && (
                <button
                  type="button"
                  className={`${styles.button} ${styles.primaryButton}`}
                  onClick={() => setRestarting({ stage: null, label: stoppedAt === null ? research.question : stepLabel(stoppedAt) })}
                  data-restart
                >
                  {t('Restart')}
                </button>
              )}
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
            <Progress
              research={research}
              onRestartFrom={running ? undefined : (stage) => setRestarting({ stage, label: stepLabel(stage) })}
            />
            <Given research={research} />
            <div className={styles.columns}>
              <SubQuestions research={research} />
              <Sources research={research} />
            </div>
            {research.status === 'COMPLETED' && <Report research={research} workspaceId={workspaceId} />}
            {research.status === 'COMPLETED' && <FollowUps research={research} onPick={setFollowing} />}
            <Children research={research} workspaceId={workspaceId} />
            {running && <Draft research={research} />}
            <Review research={research} />
            <Images research={research} />
          </>
        )}
      </div>

      <ConfirmDialog
        subject={following}
        kind="startFollowUp"
        onClose={() => setFollowing(null)}
        onConfirm={async () => {
          if (research === null || following === null) return;
          const started = await startFollowUpResearch(research.id, following);
          setFollowing(null);
          navigate(`${listPath}/${started.id}`);
        }}
      />

      <ConfirmDialog
        subject={restarting?.label ?? null}
        kind="restartResearch"
        onClose={() => setRestarting(null)}
        onConfirm={async () => {
          if (research === null || restarting === null) return;
          const restarted = await restartResearch(research.id, restarting.stage);
          setResearch(restarted);
          setError(null);
          setRestarting(null);
        }}
      />

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
      {research.review && (
        <div className={styles.summaryItem}>
          <dt>{t('Reviewer')}</dt>
          <dd data-research-reviewer>{research.reviewerModelName ?? '—'}</dd>
        </div>
      )}
      <div className={styles.summaryItem}>
        <dt>{t('Language')}</dt>
        <dd>{languageLabel(research.language)}</dd>
      </div>
      <div className={styles.summaryItem}>
        <dt>{t('Output')}</dt>
        <dd>{research.outputFormat === 'PDF' ? 'PDF' : t('Document')}</dd>
      </div>
      {research.parentId != null && (
        <div className={styles.summaryItem}>
          <dt>{t('Follow-up of')}</dt>
          <dd data-parent title={research.parentQuestion ?? undefined}>
            <Link className={styles.link} to={`/workspace/${workspaceId}/explore/research/${research.parentId}`} data-parent-link>
              #{research.parentId}
            </Link>
          </dd>
        </div>
      )}
      <div className={styles.summaryItem}>
        <dt>{t('Started')}</dt>
        <dd title={research.startedAt}>{timeAgo(research.startedAt)}</dd>
      </div>
      {/* Measured from the workspace's finished research in this mode; absent where there are too few. */}
      {research.status === 'RUNNING' && research.estimatedSecondsLeft != null && research.estimatedSecondsLeft > 0 && (
        <div className={styles.summaryItem}>
          <dt>{t('Time left')}</dt>
          <dd data-time-left>{roughly(research.estimatedSecondsLeft * 1000)}</dd>
        </div>
      )}
      {/* How long it took, once it is over: from the start to the moment it finished, failed or was stopped. */}
      {research.finishedAt !== null && (
        <div className={styles.summaryItem}>
          <dt>{t('Took')}</dt>
          <dd data-took>
            {formatDuration(Math.max(0, Math.round((Date.parse(research.finishedAt) - Date.parse(research.startedAt)) / 1000)))}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The five steps in order, with the one it is in, what it is doing now, and
 * how much it has searched and read. A step taken offers, on hover, to run the
 * research again from it, where it is not running.
 */
function Progress({ research, onRestartFrom }: { research: Research; onRestartFrom?: (stage: ResearchStage) => void }) {
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
            {onRestartFrom !== undefined && states[index] === 'done' && (
              <button
                type="button"
                className={styles.stageRestart}
                onClick={() => onRestartFrom(stage)}
                aria-label={t('Restart from here')}
                title={t('Restart from here')}
                data-restart-from={stage}
              >
                <img src={rotateIcon} alt="" width={12} height={12} />
              </button>
            )}
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
          {/* Rounds of searching: 1 is the plan's own queries, each follow-up round one more - not the mode. */}
          <dt>{t('Search rounds')}</dt>
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
  if (told.length === 0 && research.useWebSearch && !research.includeImages) return null;
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
        {research.includeImages && (
          <div className={styles.givenRow}>
            <dt>{t('Images')}</dt>
            <dd data-include-images-on>{t('On')}</dd>
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

/**
 * The sources read, numbered as the report cites them - and, while it runs,
 * the page being read now as a row on its way: not numbered, because one the
 * model notes nothing in never becomes a source.
 */
function Sources({ research }: { research: Research }) {
  const reading = research.status === 'RUNNING' ? (research.progress?.reading ?? null) : null;
  return (
    <section className={styles.card} aria-label={t('Sources')}>
      <h2 className={styles.cardTitle}>
        {t('Sources')}
        <span className={styles.count}>{research.sources.length}</span>
      </h2>
      {research.sources.length === 0 && reading === null ? (
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
          {reading !== null && (
            <li className={`${styles.source} ${styles.sourceReading}`} data-source-reading title={reading.url}>
              <span className={styles.sourceNumber} aria-hidden="true">…</span>
              <span className={styles.sourceBody}>
                <a className={styles.sourceTitle} href={reading.url} target="_blank" rel="noreferrer noopener">
                  {reading.title}
                </a>
                <span className={styles.sourceMeta}>
                  <span className={styles.sourceHost} data-source-host>{hostOf(reading)}</span>
                  <span className={styles.kind} data-source-kind={reading.kind}>
                    {reading.kind === 'DOCUMENT' ? t('Document') : t('Web')}
                  </span>
                  <span className={styles.readingNow}>{t('Reading…')}</span>
                </span>
              </span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

/**
 * What the review said, round by round: the verdict, what was found and what
 * to do about it, and whether the writer revised the report for it.
 */
function Review({ research }: { research: Research }) {
  const rounds = research.reviewRounds ?? [];
  if (!research.review || rounds.length === 0) return null;
  return (
    <section className={styles.card} aria-label={t('Review')} data-review-panel>
      <h2 className={styles.cardTitle}>
        {t('Review')}
        <span className={styles.count}>{rounds.length}</span>
      </h2>
      <ol className={styles.rounds}>
        {rounds.map((round) => (
          <li key={round.round} className={styles.round} data-review-round={round.round} data-verdict={round.verdict}>
            <div className={styles.roundHead}>
              <span className={`${styles.verdict} ${round.verdict === 'ACCEPT' ? styles.verdictAccepted : styles.verdictRevise}`} data-verdict-label>
                {round.verdict === 'ACCEPT' ? t('Accepted') : t('Changes asked for')}
              </span>
              <span className={styles.roundMeta} data-review-outcome>
                {round.revised
                  ? tf('{issues} issues · revised, {before} → {after} characters', {
                      issues: round.issues.length,
                      before: round.charactersBefore,
                      after: round.charactersAfter ?? round.charactersBefore,
                    })
                  : tf('{issues} issues', { issues: round.issues.length })}
              </span>
            </div>
            {round.summary !== '' && <p className={styles.roundSummary}>{round.summary}</p>}
            {round.issues.length > 0 && (
              <ul className={styles.issues}>
                {round.issues.map((issue, at) => (
                  <li key={at} className={styles.issue} data-issue={issue.kind}>
                    <span className={styles.kind}>{issueLabel(issue.kind)}</span>
                    <span className={styles.issueText}>{issue.issue}</span>
                    {issue.fix !== '' && <span className={styles.issueFix}>{issue.fix}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What to research next, as the finished research suggests: each a research of its own, once confirmed. */
function FollowUps({ research, onPick }: { research: Research; onPick: (question: string) => void }) {
  const questions = research.followUps ?? [];
  if (questions.length === 0) return null;
  return (
    <section className={styles.card} aria-label={t('Follow-up questions')} data-follow-ups>
      <h2 className={styles.cardTitle}>
        {t('Follow-up questions')}
        <span className={styles.count}>{questions.length}</span>
      </h2>
      <ul className={styles.followUps}>
        {questions.map((question) => (
          <li key={question}>
            <button type="button" className={styles.followUp} onClick={() => onPick(question)} data-follow-up={question}>
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The research started from this one as follow-ups. */
function Children({ research, workspaceId }: { research: Research; workspaceId: string }) {
  const children = research.children ?? [];
  if (children.length === 0) return null;
  return (
    <section className={styles.card} aria-label={t('Follow-up research')} data-children>
      <h2 className={styles.cardTitle}>
        {t('Follow-up research')}
        <span className={styles.count}>{children.length}</span>
      </h2>
      <ul className={styles.followUps}>
        {children.map((child) => (
          <li key={child.id} className={styles.child} data-child={child.id}>
            <Link className={styles.link} to={`/workspace/${workspaceId}/explore/research/${child.id}`}>{child.question}</Link>
            <span className={`${styles.status} ${STATUS_CLASS[child.status]}`}>{statusLabel(child.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The report as its writer writes it, while the research runs; the finished one takes its place. */
function Draft({ research }: { research: Research }) {
  if (research.draft == null || research.draft.trim() === '') return null;
  return (
    <section className={styles.card} aria-label={t('Report')} data-draft>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('Report')}</h2>
        <span className={styles.writing} data-writing>
          <Loader label="" size={14} delay={0} />
          {t('Writing…')}
        </span>
      </div>
      <article className={styles.document}>
        <Markdown>{research.draft}</Markdown>
      </article>
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
          {research.artifactKey !== null && (
            <Link className={styles.button} to={`/workspace/${workspaceId}/artifacts/${research.artifactKey}`} data-research-artifact>
              {t('Open in Artifacts')}
            </Link>
          )}
        </div>
      </div>
      {research.outputFormat === 'PDF' && research.previewUrl !== null ? (
        /*
          Drawn here rather than framed: the preview is served sandboxed, and a
          browser's own PDF reader does not run in a sandboxed document.
        */
        <PdfReader className={styles.pdf} src={research.previewUrl} name={research.fileName ?? t('Report')} />
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

/** Where an image came from, as a link can carry it: the page it was on, or where it was fetched from. */
function originOf(image: ResearchImage): { href: string; host: string } | null {
  const href = image.page ?? image.url;
  if (href.startsWith('/')) return { href: href.split('#')[0], host: t('Artifacts') };
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return { href, host: parsed.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

/**
 * The images it kept, as a small gallery under the report: each with its
 * caption and where it came from, and opened over the page in the picture
 * viewer. Kept on the Artifacts page as files of their own, which is where
 * they are shown from - never from the address they were found at.
 */
function Images({ research }: { research: Research }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (research.images.length === 0) return null;
  const pictures = research.images.map((image) => ({
    id: image.artifactId,
    filename: image.caption,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
  }));
  const previews = new Map(research.images.map((image) => [image.artifactId, image.previewUrl]));
  return (
    <section className={styles.card} aria-label={t('Images')} data-images>
      <h2 className={styles.cardTitle}>
        {t('Images')}
        <span className={styles.count}>{research.images.length}</span>
      </h2>
      <ul className={styles.gallery} data-gallery>
        {research.images.map((image) => {
          const origin = originOf(image);
          return (
            <li key={image.artifactId} className={styles.figure} data-image={image.number}>
              <button
                type="button"
                className={styles.thumb}
                onClick={() => setOpenId(image.artifactId)}
                title={image.caption}
                data-open-image={image.number}
              >
                <img src={image.previewUrl} alt={image.caption} loading="lazy" width={image.width} height={image.height} data-keeps-colour="" />
              </button>
              <span className={styles.caption} title={image.caption} data-image-caption>
                <span className={styles.sourceNumber} aria-hidden="true">{image.number}</span>
                <span className={styles.captionText}>{image.caption}</span>
              </span>
              {origin !== null && (
                <a className={styles.imageSource} href={origin.href} target="_blank" rel="noreferrer noopener" title={origin.href} data-image-source>
                  {origin.host}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <AttachmentViewer
        images={pictures}
        openId={openId}
        onClose={() => setOpenId(null)}
        onOpen={setOpenId}
        urlOf={(id) => previews.get(id) ?? ''}
      />
    </section>
  );
}
